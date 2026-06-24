/**
 * ClaudeCodeAgentRuntime — Claude-Code-style agent experience built on top
 * of the local HTTP `/v1/llm/chat/completions` proxy.
 *
 * Architecture (two orthogonal layers):
 *
 *   Renderer (useChat / chatMessageStore)
 *       ↑ AgentRuntimeStreamEvent (via AgentRuntimeIpcBroker)
 *   ┌─────────────────────────────────────────────────────────┐
 *   │ ClaudeCodeAgentRuntime (this file)  ← agent layer       │
 *   │  - builds ChatCompletionRequest with tools[] mapped     │
 *   │    to @scp/agent-builtins MCP server                    │
 *   │  - fetches its own HTTP `/v1/llm/chat/completions`      │
 *   │  - parses SSE → AgentRuntimeStreamEvent via translator  │
 *   │  - interrupt → POST /v1/llm/stop                        │
 *   │  - resolvePermission → POST /v1/llm/tool-approval       │
 *   └─────────────────────────────────────────────────────────┘
 *       ↓ fetch + SSE (loopback HTTP)
 *   ┌─────────────────────────────────────────────────────────┐
 *   │ LocalServer /v1/llm/chat/completions                    │
 *   │  → LLMService.chatCompletion → AI SDK → provider HTTP   │
 *   └─────────────────────────────────────────────────────────┘
 *
 * Built-in tools (Read/Write/Edit/Bash/Grep/Glob/WebFetch/Task) are
 * exposed via the `@scp/agent-builtins` internal MCP server. The HTTP
 * route's toolExecutorFactory injects provider/cwd/scpPort/scpApiKey
 * so the Task tool can HTTP-recurse for subagents.
 *
 * Rules:
 *   1. Never calls llmService directly — only fetches HTTP.
 *   2. LLMService is unaware of the agent concept.
 *   3. The HTTP server must be running before the first request (boot
 *      order in main.ts: localServer.start() → bootstrapAgentRuntime).
 */

import type {
	AgentQueryRequest,
	AgentRuntime,
	AgentRuntimeDescriptor,
	AgentRuntimeStreamEvent,
	PermissionDecision,
} from "@super-client/shared-types/agent-runtime";
import type {
	ChatCompletionRequest,
	ChatStreamEvent,
	ModelProvider,
} from "../../../ipc/types";
import { localServer } from "../../../server";
import { getOrCreateApiKey } from "../../../server/config";
import { parseSSEStream } from "../../llm/sseClient";
import {
	AGENT_BUILTIN_TOOL_DEFS,
	AGENT_BUILTIN_TOOL_NAMES,
} from "../../mcp/internal/servers/agentBuiltinsServer";
import { storeManager } from "../../../store/StoreManager";
import { ChatToRuntimeTranslator } from "./streamEventTranslator";
import { buildSystemPrompt } from "./systemPrompt";

const BUILTIN_PREFIX = "scp-agent-builtins__";

const DESCRIPTOR: AgentRuntimeDescriptor = {
	id: "llm-loop",
	displayName: "Claude Code Agent (LLM Loop)",
	schemaVersion: 1,
	capabilities: {
		streaming: true,
		reasoning: false,
		planMode: "host-strip",
		nativeSession: false,
		sandbox: "workspace-write",
		toolSchema: "json-schema",
		multimodalInput: ["text"],
	},
};

export class ClaudeCodeAgentRuntime implements AgentRuntime {
	readonly descriptor = DESCRIPTOR;
	/** Active in-flight requests, keyed by requestId, so `interrupt` works. */
	private readonly active = new Map<string, AbortController>();

	createQuery(req: AgentQueryRequest): AsyncIterable<AgentRuntimeStreamEvent> {
		const translator = new ChatToRuntimeTranslator({
			requestId: req.requestId,
			conversationId: req.conversationId,
		});

		const controller = new AbortController();
		const onParentAbort = () => controller.abort();
		req.signal.addEventListener("abort", onParentAbort);
		this.active.set(req.requestId, controller);

		const llmRequest = this.buildChatRequest(req);
		const port = localServer.getPort();
		const apiKey = getOrCreateApiKey();

		const self = this;
		return (async function* (): AsyncGenerator<
			AgentRuntimeStreamEvent,
			void,
			void
		> {
			try {
				let res: Response;
				try {
					res = await fetch(
						`http://127.0.0.1:${port}/v1/llm/chat/completions`,
						{
							method: "POST",
							headers: {
								"Content-Type": "application/json",
								Authorization: `Bearer ${apiKey}`,
							},
							body: JSON.stringify(llmRequest),
							signal: controller.signal,
						},
					);
				} catch (err) {
					if (controller.signal.aborted) {
						for (const ev of translator.finalize()) yield ev;
						return;
					}
					throw err;
				}

				if (!res.ok || !res.body) {
					const text = await res.text().catch(() => "");
					for (const ev of translator.translate({
						requestId: req.requestId,
						type: "error",
						error: `LLM HTTP ${res.status}${text ? `: ${text}` : ""}`,
					} as ChatStreamEvent)) {
						yield ev;
					}
					return;
				}

				let finished = false;
				try {
					for await (const frame of parseSSEStream(res.body)) {
						// The SSE event name mirrors ChatStreamEvent.type. Some
						// clients (or future server versions) may emit data
						// without echoing the type field — merge defensively.
						const data = (frame.data ?? {}) as Record<string, unknown>;
						const chatEvent = {
							type: frame.event,
							...data,
						} as ChatStreamEvent;
						for (const out of translator.translate(chatEvent)) yield out;
						if (
							chatEvent.type === "done" ||
							chatEvent.type === "error"
						) {
							finished = true;
							break;
						}
					}
				} catch (err) {
					if (!controller.signal.aborted) {
						for (const ev of translator.translate({
							requestId: req.requestId,
							type: "error",
							error: (err as Error).message,
						} as ChatStreamEvent)) {
							yield ev;
						}
						return;
					}
				}

				if (!finished) {
					for (const ev of translator.finalize()) yield ev;
				}
			} finally {
				req.signal.removeEventListener("abort", onParentAbort);
				self.active.delete(req.requestId);
			}
		})();
	}

	async resolvePermission(
		approvalId: string,
		decision: PermissionDecision,
	): Promise<void> {
		const port = localServer.getPort();
		const apiKey = getOrCreateApiKey();
		await fetch(`http://127.0.0.1:${port}/v1/llm/tool-approval`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${apiKey}`,
			},
			body: JSON.stringify({
				toolCallId: approvalId,
				approved: decision.approved,
			}),
		}).catch(() => {
			/* non-fatal */
		});
	}

	async interrupt(requestId: string): Promise<void> {
		const ctrl = this.active.get(requestId);
		if (ctrl) ctrl.abort();
		const port = localServer.getPort();
		const apiKey = getOrCreateApiKey();
		await fetch(`http://127.0.0.1:${port}/v1/llm/stop`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${apiKey}`,
			},
			body: JSON.stringify({ requestId }),
		}).catch(() => {
			/* non-fatal */
		});
	}

	private buildChatRequest(req: AgentQueryRequest): ChatCompletionRequest {
		const cwd = req.cwd ?? process.cwd();
		const customPrompt = "";

		const systemPrompt = buildSystemPrompt({ cwd, customPrompt });
		const userText =
			req.prompt.kind === "text"
				? req.prompt.text
				: req.prompt.parts
						.filter((p) => p.type === "text")
						.map((p) => (p as { text: string }).text)
						.join("\n");

		// Provider + model from req.runtime.model
		const runtimeInfo = req.runtime as unknown as {
			model?: { providerId?: string; modelId?: string };
		};
		const providerId = runtimeInfo?.model?.providerId;
		const modelId = runtimeInfo?.model?.modelId ?? "";

		const providers = storeManager.getModelProviders();
		const provider =
			(providerId
				? providers.find((p: ModelProvider) => p.id === providerId)
				: undefined) ?? providers.find((p: ModelProvider) => p.enabled);

		// 8 built-in tools (Read/Write/Edit/Bash/Grep/Glob/WebFetch/Task)
		// from @scp/agent-builtins. Prefixed names per project's MCP naming
		// convention so renderer's ToolCallCard renders them with the
		// "builtin" badge (E4) and toolExecutorFactory routes them via
		// mcpService.callTool("@scp/agent-builtins", ...).
		const builtinTools = AGENT_BUILTIN_TOOL_DEFS.map((t) => ({
			type: "function" as const,
			function: {
				name: `${BUILTIN_PREFIX}${t.name}`,
				description: t.description,
				parameters: t.inputSchema,
			},
		}));

		const builtinMapping: Record<
			string,
			{ serverId: string; toolName: string }
		> = {};
		for (const name of AGENT_BUILTIN_TOOL_NAMES) {
			builtinMapping[`${BUILTIN_PREFIX}${name}`] = {
				serverId: "@scp/agent-builtins",
				toolName: name,
			};
		}

		const userTools = req.tools.map((t) => ({
			type: "function" as const,
			function: {
				name: t.name,
				description: t.description,
				parameters: t.inputSchema,
			},
		}));

		const userMapping: Record<string, { serverId: string; toolName: string }> =
			{};
		for (const t of req.tools) {
			userMapping[t.name] = {
				serverId: t.origin.serverId,
				toolName: t.name,
			};
		}

		const messages: ChatCompletionRequest["messages"] = [
			{ role: "system", content: systemPrompt },
		];
		if (req.history && req.history.length > 0) {
			for (const m of req.history) {
				const role = (m as { role?: string }).role;
				const content = (m as { content?: unknown }).content;
				if (
					(role === "user" || role === "assistant" || role === "system") &&
					typeof content === "string"
				) {
					messages.push({ role, content });
				}
			}
		}
		messages.push({ role: "user", content: userText });

		return {
			requestId: req.requestId,
			conversationId: req.conversationId,
			baseUrl: provider?.baseUrl ?? "",
			apiKey: provider?.apiKey ?? "",
			model: modelId,
			providerPreset: provider?.preset,
			apiFormat: provider?.apiFormat,
			messages,
			tools: [...builtinTools, ...userTools],
			toolMapping: { ...builtinMapping, ...userMapping },
		};
	}
}
