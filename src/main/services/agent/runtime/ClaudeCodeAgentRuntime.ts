/**
 * ClaudeCodeAgentRuntime — Claude-Code-style agent experience built on top
 * of the unified LLMService.chatCompletion path.
 *
 * Architecture (two orthogonal layers):
 *
 *   Renderer (useChat / chatMessageStore)
 *       ↑ AgentRuntimeStreamEvent (via AgentRuntimeIpcBroker)
 *   ┌─────────────────────────────────────────────────────────┐
 *   │ ClaudeCodeAgentRuntime (this file)  ← agent layer       │
 *   │  - 8 builtin tools (Read/Write/Edit/Bash/Grep/Glob/     │
 *   │    WebFetch/Task)                                       │
 *   │  - system prompt                                        │
 *   │  - subagent recursion (Task tool)                       │
 *   │  - translator: ChatStreamEvent → AgentRuntimeStreamEvent│
 *   └─────────────────────────────────────────────────────────┘
 *       ↓ ChatCompletionRequest
 *   ┌─────────────────────────────────────────────────────────┐
 *   │ LLMService.chatCompletion (model abstraction)           │
 *   │  - resolveProvider, toolAdapter, streamEventBridge      │
 *   └─────────────────────────────────────────────────────────┘
 *       ↓ HTTP
 *   any model (Qwen / DeepSeek / GPT / Claude / Gemini / …)
 *
 * Rules:
 *   1. Never makes HTTP calls directly — only goes through LLMService.
 *   2. LLMService is unaware of the agent concept.
 *
 * Phase B will plug Task subagent dispatch + register this runtime into
 * AgentRuntimeRegistry.
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
import { llmService } from "../../llm/LLMService";
import { storeManager } from "../../../store/StoreManager";
import { ChatToRuntimeTranslator } from "./streamEventTranslator";
import { buildSystemPrompt } from "./systemPrompt";
import { getBuiltinTools, type BuiltinToolDef } from "./tools";

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
	/**
	 * Per-request task recursion depth. Read by the Task tool to bound
	 * subagent nesting (see Phase B).
	 */
	private readonly taskDepthByRequest = new Map<string, number>();

	createQuery(req: AgentQueryRequest): AsyncIterable<AgentRuntimeStreamEvent> {
		const translator = new ChatToRuntimeTranslator({
			requestId: req.requestId,
			conversationId: req.conversationId,
		});

		// Bridge LLMService events into an internal queue with a single waiter
		// so the AsyncIterable can pull lazily.
		const queue: AgentRuntimeStreamEvent[] = [];
		let waiter: (() => void) | null = null;
		let finished = false;
		let errored: unknown = null;
		const wake = () => {
			if (waiter) {
				const w = waiter;
				waiter = null;
				w();
			}
		};

		const cwd = req.cwd ?? process.cwd();
		const taskDepth = this.taskDepthByRequest.get(req.requestId) ?? 0;

		// Closure so the Task tool can recurse back into this same runtime
		// with a fresh requestId + tracked depth.
		const dispatchSubagent = async (
			subPrompt: string,
			opts: { signal: AbortSignal; depth: number },
		): Promise<string> => {
			const subRequestId = `${req.requestId}_sub_${opts.depth}_${Date.now()}`;
			this.taskDepthByRequest.set(subRequestId, opts.depth);
			const subReq: AgentQueryRequest = {
				...req,
				requestId: subRequestId,
				prompt: { kind: "text", text: subPrompt },
				signal: opts.signal,
				history: [],
			};
			let collected = "";
			for await (const ev of this.createQuery(subReq)) {
				if ((ev as { type?: string }).type === "text.delta") {
					collected += (ev as { delta: string }).delta;
				}
			}
			return collected || "(subagent returned no text)";
		};

		const builtinTools = getBuiltinTools({
			cwd,
			signal: req.signal,
			taskDepth,
			dispatchSubagent,
		});
		const builtinByName = new Map<string, BuiltinToolDef>(
			builtinTools.map((t) => [t.name, t]),
		);

		// Track request for interrupt(): forward parent abort signal.
		const controller = new AbortController();
		const onParentAbort = () => controller.abort();
		req.signal.addEventListener("abort", onParentAbort);
		this.active.set(req.requestId, controller);

		const llmRequest = this.buildChatRequest(req, builtinTools);

		const unsubscribe = llmService.subscribeRequestEvents(
			req.requestId,
			(ev: ChatStreamEvent) => {
				for (const out of translator.translate(ev)) queue.push(out);
				if (ev.type === "done" || ev.type === "error") {
					finished = true;
				}
				wake();
			},
		);

		// Tool executor — builtin tools dispatch locally; non-builtin tools
		// (the ones in req.tools) route via mcpService dynamically so the
		// initial import graph stays small.
		const toolExecutor = async (
			name: string,
			args: Record<string, unknown>,
		): Promise<unknown> => {
			const builtin = builtinByName.get(name);
			if (builtin) return await builtin.execute(args);
			const binding = req.tools.find((t) => t.name === name);
			if (!binding) {
				throw new Error(`Tool '${name}' not found`);
			}
			const { mcpService } = await import("../../mcp/McpService");
			const result = await mcpService.callTool(
				binding.origin.serverId,
				name.includes("__") ? (name.split("__").pop() ?? name) : name,
				args,
				{ conversationId: req.conversationId },
			);
			if (!result.success) throw new Error(result.error ?? "Tool call failed");
			return result.data;
		};

		// Fire-and-forget; failures land in `errored` and flush via the queue.
		llmService.chatCompletion(llmRequest, toolExecutor).catch((err) => {
			errored = err;
			finished = true;
			wake();
		});

		const self = this;
		const iter = async function* (): AsyncGenerator<
			AgentRuntimeStreamEvent,
			void,
			void
		> {
			try {
				while (!finished || queue.length > 0) {
					if (queue.length === 0) {
						await new Promise<void>((resolve) => {
							waiter = resolve;
						});
						continue;
					}
					const next = queue.shift();
					if (next) yield next;
				}
				for (const ev of translator.finalize()) yield ev;
				if (errored) {
					throw errored;
				}
			} finally {
				unsubscribe();
				req.signal.removeEventListener("abort", onParentAbort);
				self.active.delete(req.requestId);
				self.taskDepthByRequest.delete(req.requestId);
			}
		};

		return iter();
	}

	async resolvePermission(
		approvalId: string,
		decision: PermissionDecision,
	): Promise<void> {
		llmService.resolveToolApproval(approvalId, decision.approved);
	}

	async interrupt(requestId: string): Promise<void> {
		const ctrl = this.active.get(requestId);
		if (ctrl) ctrl.abort();
		llmService.stopStream(requestId);
	}

	/**
	 * Phase B will use this from the Task tool's dispatch closure to thread
	 * recursion depth into the subagent's runtime.
	 */
	setTaskDepth(requestId: string, depth: number): void {
		this.taskDepthByRequest.set(requestId, depth);
	}

	private buildChatRequest(
		req: AgentQueryRequest,
		builtinTools: BuiltinToolDef[],
	): ChatCompletionRequest {
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

		// Merge built-in tools + caller-provided tools into one OpenAI-style tool list.
		const allTools = [
			...builtinTools.map((t) => ({
				type: "function" as const,
				function: {
					name: t.name,
					description: t.description,
					parameters: t.inputSchema,
				},
			})),
			...req.tools.map((t) => ({
				type: "function" as const,
				function: {
					name: t.name,
					description: t.description,
					parameters: t.inputSchema,
				},
			})),
		];

		const toolMapping: Record<string, { serverId: string; toolName: string }> =
			{};
		for (const t of req.tools) {
			toolMapping[t.name] = {
				serverId: t.origin.serverId,
				toolName: t.name,
			};
		}

		const messages: ChatCompletionRequest["messages"] = [
			{ role: "system", content: systemPrompt },
		];
		// Caller-provided history goes in chronological order before the new user
		// turn. The history shape is `AgentHistoryMessage`; we map text content
		// pass-through into OpenAI-style entries (richer parts are dropped here —
		// future iteration when multimodal is in scope).
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
			tools: allTools,
			toolMapping,
		};
	}
}
