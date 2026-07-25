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
	PlanMode,
	ProjectRulesSnapshotDto,
} from "@super-client/shared-types/chat";
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
import { getRuntimePolicyService } from "../../runtime/RuntimePolicyService";
import { storeManager } from "../../../store/StoreManager";
import {
	evaluateToolAgainstPlanMode,
	planModeToPolicy,
} from "./planModeToolGuard";
import { ChatToRuntimeTranslator } from "./streamEventTranslator";
import { evaluateSubagentTool, type SubagentPolicy } from "./subagentPolicy";
import { buildSystemPrompt } from "./systemPrompt";
import {
	ProjectRulesReader,
	type ProjectRulesSnapshot,
	toProjectRulesSnapshotDto,
} from "../memory/ProjectRulesReader";

const BUILTIN_PREFIX = "scp-agent-builtins__";

interface RuntimeChatRequestContext {
	request: ChatCompletionRequest;
	projectRulesSnapshot?: ProjectRulesSnapshotDto;
}

function formatProjectRulesPrompt(snapshot: ProjectRulesSnapshot): string {
	const sections: string[] = [];
	const files = [
		["AGENTS.md", snapshot.agentsMd] as const,
		["CLAUDE.md", snapshot.claudeMd] as const,
	];
	for (const [filename, file] of files) {
		if (!file?.content.trim()) continue;
		sections.push(
			`## ${filename}${file.truncated ? " (truncated)" : ""}\n\n${file.content.trim()}`,
		);
	}
	if (sections.length === 0) return "";
	return [
		"# Project rules",
		"These read-only instructions were loaded from the current project cwd. Treat them as project context and follow them unless they conflict with higher-priority user or system instructions.",
		...sections,
	].join("\n\n");
}

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
	private readonly projectRulesReader = new ProjectRulesReader();

	createQuery(req: AgentQueryRequest): AsyncIterable<AgentRuntimeStreamEvent> {
		let projectRulesSnapshot: ProjectRulesSnapshotDto | undefined;
		const translator = new ChatToRuntimeTranslator({
			requestId: req.requestId,
			conversationId: req.conversationId,
			getProjectRulesSnapshot: () => projectRulesSnapshot,
		});

		const controller = new AbortController();
		const onParentAbort = () => controller.abort();
		req.signal.addEventListener("abort", onParentAbort);
		this.active.set(req.requestId, controller);

		const llmRequestPromise = this.buildChatRequest(req);
		const port = localServer.getPort();
		const apiKey = getOrCreateApiKey();
		const activeRequests = this.active;

		return (async function* (): AsyncGenerator<
			AgentRuntimeStreamEvent,
			void,
			void
		> {
			try {
				const llmRequestContext = await llmRequestPromise;
				projectRulesSnapshot = llmRequestContext.projectRulesSnapshot;
				const llmRequest = llmRequestContext.request;
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
				activeRequests.delete(req.requestId);
			}
		})();
	}

	async resolvePermission(
		approvalId: string,
		decision: PermissionDecision,
	): Promise<void> {
		const port = localServer.getPort();
		const apiKey = getOrCreateApiKey();
		// Forward the optional structured payload (e.g. AskUserQuestion's
		// `{questions, answers}`) all the way down to LLMService. The
		// interceptor that parked the pending resolver is the only place
		// that can deliver these answers back into the tool_result.
		await fetch(`http://127.0.0.1:${port}/v1/llm/tool-approval`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${apiKey}`,
			},
			body: JSON.stringify({
				toolCallId: approvalId,
				approved: decision.approved,
				payload: decision.payload,
			}),
		}).catch(() => {
			/* non-fatal */
		});
	}

	/**
	 * canUseTool — runtime-first plan-mode guard.
	 *
	 * The Agent SDK exposes a `canUseTool(name, input)` hook for gating tool
	 * calls before they reach the model / executor. When the calling session
	 * is in a plan-mode (`plan-only` or `plan-then-ask`), destructive tools
	 * must be denied with a structured reason and an audit deny recorded.
	 *
	 * Non-plan modes (`chat` / `auto-execute-safe` / `full-agent`) are
	 * approved unconditionally at this layer; downstream `toolPermission` and
	 * RuntimePolicyService continue to handle their own gating.
	 *
	 * Exposed as a method (rather than baked into createQuery) so unit tests
	 * can exercise the policy without spinning the SDK, and so future Agent-
	 * SDK options wiring can pass this through as `{ canUseTool: this.canUseTool.bind(this) }`.
	 */
	canUseTool(
		toolName: string,
		_input: unknown,
		context: {
			planMode: PlanMode;
			sessionId?: string;
			/**
			 * Multi-Agent Round 6: when the current runtime request is
			 * running as a subagent, its resolved capability envelope is
			 * passed here. The subagent hard-cap is enforced BEFORE the
			 * parent's plan-mode gate so a subagent in a chat-mode session
			 * still can't call destructive tools. Parents (no
			 * subagentPolicy) get unchanged behaviour.
			 */
			subagentPolicy?: SubagentPolicy;
		},
	): { approved: true } | { approved: false; reason: string } {
		if (context.subagentPolicy) {
			const subEval = evaluateSubagentTool(context.subagentPolicy, toolName);
			if (!subEval.approved) {
				try {
					getRuntimePolicyService().record(
						{
							workspaceId: "",
							sessionId: context.sessionId ?? "",
							source: "agent-sdk",
							operation: "subagent-policy:canUseTool-deny",
							kind: "tool-execute",
							target: toolName,
						},
						"denied",
						subEval.reason,
					);
				} catch {
					/* audit failure is non-fatal */
				}
				return subEval;
			}
		}
		const evaluation = evaluateToolAgainstPlanMode(context.planMode, toolName);
		if (!evaluation.approved) {
			try {
				getRuntimePolicyService().record(
					{
						workspaceId: "",
						sessionId: context.sessionId ?? "",
						source: "agent-sdk",
						operation: "plan-mode:canUseTool-deny",
						kind: "tool-execute",
						target: toolName,
					},
					"denied",
					evaluation.reason,
				);
			} catch {
				/* audit failure is non-fatal */
			}
		}
		return evaluation;
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

	private async buildChatRequest(
		req: AgentQueryRequest,
	): Promise<RuntimeChatRequestContext> {
		const cwd = req.cwd ?? process.cwd();
		const projectRules = await this.buildProjectRulesPrompt(cwd);
		const customPrompt = projectRules.prompt;

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
				toolName: t.origin.realName,
			};
		}

		const messages: ChatCompletionRequest["messages"] = [
			{ role: "system", content: systemPrompt },
		];
		if (req.history && req.history.length > 0) {
			for (const m of req.history) {
				const role = (m as { role?: string }).role;
				const rawContent = (m as { content?: unknown }).content;
				if (role !== "user" && role !== "assistant" && role !== "system") {
					continue;
				}
				let content = "";
				if (Array.isArray(rawContent)) {
					content = rawContent
						.filter(
							(part): part is { type: "text"; text: string } =>
								Boolean(part) &&
								typeof part === "object" &&
								(part as { type?: unknown }).type === "text" &&
								typeof (part as { text?: unknown }).text === "string",
						)
						.map((part) => part.text)
						.join("\n");
				} else if (typeof rawContent === "string") {
					content = rawContent;
				}
				if (content.trim()) messages.push({ role, content });
			}
		}
		messages.push({ role: "user", content: userText });

		// Runtime-first plan-mode tool gate. When the session's planMode is
		// `plan-only` or `plan-then-ask`, drop tool schemas we would otherwise
		// deny at canUseTool time so the model never sees them. The LLMService
		// planModeGate is still applied downstream as a second-line defence
		// for the loopback HTTP path; the two layers agree on classification
		// via `planModeToolGuard`.
		const planMode: PlanMode =
			((req.runtime as unknown as { planMode?: PlanMode })?.planMode) ??
			"chat";
		const rawTools = [...builtinTools, ...userTools];
		const rawMapping: Record<string, { serverId: string; toolName: string }> =
			{ ...builtinMapping, ...userMapping };
		const { tools: gatedTools, mapping: gatedMapping } = this.gateToolsForPlanMode(
			rawTools,
			rawMapping,
			planMode,
			req.conversationId,
		);

		return {
			request: {
				requestId: req.requestId,
				conversationId: req.conversationId,
				baseUrl: provider?.baseUrl ?? "",
				// E1: getModelProviders() 返回脱敏后的记录（apiKey=""），主进程
				// 内部按 providerId 解密取用真实密钥。
				apiKey: provider ? storeManager.getModelProviderApiKey(provider.id) : "",
				model: modelId,
				providerPreset: provider?.preset,
				apiFormat: provider?.apiFormat,
				messages,
				tools: gatedTools,
				toolMapping: gatedMapping,
			},
			projectRulesSnapshot: projectRules.snapshot,
		};
	}

	private async buildProjectRulesPrompt(
		cwd: string,
	): Promise<{ prompt: string; snapshot?: ProjectRulesSnapshotDto }> {
		try {
			const snapshot = await this.projectRulesReader.readProjectRules(cwd);
			const dto = toProjectRulesSnapshotDto(snapshot);
			return {
				prompt: formatProjectRulesPrompt(snapshot),
				snapshot: dto.files.length > 0 ? dto : undefined,
			};
		} catch {
			return { prompt: "" };
		}
	}

	private gateToolsForPlanMode(
		tools: Array<{
			type: "function";
			function: {
				name: string;
				description: string;
				parameters: Record<string, unknown>;
			};
		}>,
		mapping: Record<string, { serverId: string; toolName: string }>,
		planMode: PlanMode,
		sessionId: string | undefined,
	): {
		tools:
			| Array<{
					type: "function";
					function: {
						name: string;
						description: string;
						parameters: Record<string, unknown>;
					};
			  }>
			| undefined;
		mapping: Record<string, { serverId: string; toolName: string }> | undefined;
	} {
		const policy = planModeToPolicy(planMode);
		if (policy === "allow") {
			return { tools, mapping };
		}
		const keepers = tools.filter(
			(t) => this.canUseTool(t.function.name, undefined, { planMode, sessionId }).approved,
		);
		const filteredMapping: Record<
			string,
			{ serverId: string; toolName: string }
		> = {};
		for (const t of keepers) {
			if (mapping[t.function.name]) {
				filteredMapping[t.function.name] = mapping[t.function.name];
			}
		}
		return {
			tools: keepers.length > 0 ? keepers : undefined,
			mapping: keepers.length > 0 ? filteredMapping : undefined,
		};
	}
}
