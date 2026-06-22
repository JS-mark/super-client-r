/**
 * ClaudeSdkRuntime —— Phase 1.5a：wrap-only adapter
 *
 * 详见 spec §8.1。
 *
 * 当前阶段不改 `AgentSDKService` 行为，仅把它适配成 `AgentRuntime`：
 *   - 转译 `AgentQueryRequest` → `AgentSDKQueryRequest`
 *   - 通过 EventEmitter 监听 inner 的 `stream-event` 并归一化为
 *     `AgentRuntimeStreamEvent`
 *   - 工具仍走 SDK 内置 MCP（`canUseTool` 路径不变）；ToolDispatcher 在
 *     Phase 1.5b 才接入
 *
 * 事件归一化映射见 spec §8.4。
 */

import type {
	AgentEventBase,
	AgentRuntime,
	AgentRuntimeDescriptor,
	AgentRuntimeStreamEvent,
	AgentQueryRequest,
	NativeSessionInfo,
	PermissionDecision,
	ToolDispatcher,
} from "@super-client/shared-types/agent-runtime";
import type {
	AgentSDKQueryRequest,
	AgentSDKStreamEvent,
} from "@super-client/shared-types/agent-sdk";

import type { AgentSDKService } from "../AgentSDKService";

const RUNTIME_ID = "claude-sdk" as const;
const DEFAULT_MESSAGE_ID = "main";

const DESCRIPTOR: AgentRuntimeDescriptor = {
	id: RUNTIME_ID,
	displayName: "Claude Agent SDK",
	schemaVersion: 1,
	capabilities: {
		streaming: true,
		reasoning: true,
		planMode: "native",
		nativeSession: true,
		sandbox: "workspace-write",
		toolSchema: "json-schema",
		multimodalInput: ["text", "image", "file"],
	},
};

// ─────────────────────────────────────────────────────────────────────
// Adapter
// ─────────────────────────────────────────────────────────────────────

export interface ClaudeSdkRuntimeDeps {
	inner: AgentSDKService;
	/**
	 * Phase 1.5b 起会启用：所有工具执行经 dispatcher。Phase 1.5a 期间允许
	 * 不传，inner 仍走 SDK 内置 MCP。
	 */
	dispatcher?: ToolDispatcher;
}

export class ClaudeSdkRuntime implements AgentRuntime {
	readonly descriptor = DESCRIPTOR;

	constructor(private readonly deps: ClaudeSdkRuntimeDeps) {}

	async *createQuery(
		req: AgentQueryRequest,
	): AsyncIterable<AgentRuntimeStreamEvent> {
		// Per-request seq counter；baseFields() 在每个 callsite 被 spread 进入 event
		let seq = 0;
		const baseFields = (): EventBaseFields => ({
			v: 1,
			requestId: req.requestId,
			conversationId: req.conversationId,
			seq: seq++,
			runtime: RUNTIME_ID,
			timestamp: Date.now(),
		});
		const annotate: EventFactory = (partial) =>
			({
				...baseFields(),
				...partial,
			}) as AgentRuntimeStreamEvent;

		// 队列 + 信号量驱动 async iterable
		const queue: AgentRuntimeStreamEvent[] = [];
		let resolveNext: (() => void) | null = null;
		let done = false;
		const wake = () => {
			const r = resolveNext;
			resolveNext = null;
			r?.();
		};

		const onSdkEvent = (raw: AgentSDKStreamEvent) => {
			if (raw.requestId !== req.requestId) return;
			for (const ev of normalize(raw, annotate)) {
				queue.push(ev);
				if (raw.type === "result" || raw.type === "error") {
					done = true;
				}
			}
			wake();
		};
		this.deps.inner.on("stream-event", onSdkEvent);

		// abort 信号 → 调 inner.interruptQuery
		const onAbort = () => {
			void this.deps.inner.interruptQuery(req.requestId);
		};
		req.signal.addEventListener("abort", onAbort, { once: true });

		// 启动 SDK 查询（不等待——它内部 fire-and-forget 后通过 emitter 推送）
		const sdkRequest = toSdkRequest(req);
		const startedPromise = this.deps.inner
			.createQuery(req.requestId, sdkRequest)
			.catch((err: unknown) => {
				// inner.createQuery 自身抛错（非通过 stream-event）：作为 fatal error 注入
				queue.push({
					...baseFields(),
					type: "error",
					fatal: true,
					code: "Internal",
					message: err instanceof Error ? err.message : String(err),
				});
				done = true;
				wake();
			});

		try {
			while (true) {
				if (queue.length > 0) {
					const ev = queue.shift() as AgentRuntimeStreamEvent;
					yield ev;
					continue;
				}
				if (done) break;
				await new Promise<void>((r) => {
					resolveNext = r;
				});
			}
		} finally {
			this.deps.inner.off("stream-event", onSdkEvent);
			req.signal.removeEventListener("abort", onAbort);
			// 等待启动 promise 完成（即便它已经 resolved），保证 inner 资源释放
			await startedPromise.catch(() => undefined);
		}
	}

	async resolvePermission(
		approvalId: string,
		decision: PermissionDecision,
	): Promise<void> {
		this.deps.inner.resolvePermission(approvalId, decision.approved);
	}

	async interrupt(requestId: string): Promise<void> {
		await this.deps.inner.interruptQuery(requestId);
	}

	async listNativeSessions(): Promise<NativeSessionInfo[]> {
		const list = await this.deps.inner.listSDKSessions();
		return list.map((s) => ({
			id: s.sessionId,
			title: s.customTitle ?? s.summary,
			updatedAt: s.lastModified,
		}));
	}

	/**
	 * `atMessageId` 暂不传递——Agent SDK 当前的 forkSession 仅支持整段 fork。
	 * 上层调用方传入也无害。
	 */
	async forkNativeSession(
		sessionId: string,
		_atMessageId?: string,
	): Promise<string> {
		const r = await this.deps.inner.forkSDKSession(sessionId);
		return r?.sessionId ?? sessionId;
	}

	async dispose(): Promise<void> {
		// inner 是单例 service，不在这里销毁；adapter 仅清自己。
	}
}

// ─────────────────────────────────────────────────────────────────────
// 翻译：AgentQueryRequest → AgentSDKQueryRequest
// ─────────────────────────────────────────────────────────────────────

function toSdkRequest(req: AgentQueryRequest): AgentSDKQueryRequest {
	const prompt = promptToString(req.prompt);
	const out: AgentSDKQueryRequest = {
		prompt,
		sessionId: req.conversationId,
		resumeSessionId: req.resume?.nativeSessionId,
		cwd: req.cwd,
		// model 由 inner 的 AutoConfig 推断；除非 runtime 明确覆盖
		model: req.runtime.model.modelId,
	};
	return out;
}

function promptToString(prompt: AgentQueryRequest["prompt"]): string {
	if (prompt.kind === "text") return prompt.text;
	return prompt.parts
		.filter((p): p is { type: "text"; text: string } => p.type === "text")
		.map((p) => p.text)
		.join("\n");
}

// ─────────────────────────────────────────────────────────────────────
// 翻译：AgentSDKStreamEvent → AgentRuntimeStreamEvent (一对多)
// ─────────────────────────────────────────────────────────────────────

type EventBaseFields = Omit<AgentEventBase, "extra">;

type EventInput = Record<string, unknown> & {
	type: AgentRuntimeStreamEvent["type"];
};

type EventFactory = (partial: EventInput) => AgentRuntimeStreamEvent;

/** 仅供单测使用；签名稳定保证回归覆盖。 */
export function normalize(
	raw: AgentSDKStreamEvent,
	make: EventFactory,
): AgentRuntimeStreamEvent[] {
	switch (raw.type) {
		case "init":
			return [
				make({
					type: "init",
					nativeSessionId: raw.sessionId,
				}),
			];

		case "chunk":
			if (typeof raw.content !== "string" || raw.content.length === 0) {
				return [];
			}
			return [
				make({
					type: "text.delta",
					messageId: DEFAULT_MESSAGE_ID,
					delta: raw.content,
				}),
			];

		case "assistant":
			return [
				make({
					type: "message.final",
					messageId: DEFAULT_MESSAGE_ID,
					text: raw.content ?? "",
				}),
			];

			case "tool_call":
				if (!raw.toolCall) return [];
				return [
					make({
						type: "tool.call",
					callId: raw.toolCall.id,
					toolName: raw.toolCall.name,
					input: raw.toolCall.input,
					}),
				];

			case "tool_error":
				if (!raw.toolError) return [];
				return [
					make({
						type: "tool.result",
						callId: raw.toolError.id,
						content: { kind: "error", message: String(raw.toolError.error) },
						isError: true,
					}),
				];

			case "tool_use_summary":
			// 摘要不是 tool.result（result 由 SDK 内部喂回，本阶段不发独立事件）。
			// Phase 1.5b 起 dispatcher 接管后改用 tool.result。
			// 这里把它当 status 输出便于 UI 展示进度。
			if (!raw.toolSummary) return [];
			return [
				make({
					type: "status",
					status: "tool_calling",
					extra: { toolSummary: raw.toolSummary },
				}),
			];

		case "status":
			return [
				make({
					type: "status",
					status: mapStatus(raw.status),
					extra: raw.status ? { raw: raw.status } : undefined,
				}),
			];

		case "permission_request": {
			if (!raw.permissionRequest) return [];
			const p = raw.permissionRequest;
			return [
				make({
					type: "permission.request",
					approvalId: p.toolUseId,
					toolName: p.toolName,
					input: p.toolInput,
				}),
			];
		}

		case "permission_denied":
			return [
				make({
					type: "permission.resolved",
					approvalId: raw.permissionRequest?.toolUseId ?? "<unknown>",
					decision: { approved: false, scope: "once", reason: raw.error },
					source: "auto-policy",
				}),
			];

		case "rate_limit":
			return [
				make({
					type: "rate_limit",
					message: raw.error,
				}),
			];

		case "result": {
			const events: AgentRuntimeStreamEvent[] = [];
			if (raw.result?.usage) {
				events.push(
					make({
						type: "usage",
						inputTokens: raw.result.usage.inputTokens,
						outputTokens: raw.result.usage.outputTokens,
						cacheReadTokens: raw.result.usage.cacheReadInputTokens,
						cacheWriteTokens: raw.result.usage.cacheCreationInputTokens,
					}),
				);
			}
			events.push(
				make({
					type: "result",
					reason: raw.result?.success === false ? "error" : "completed",
				}),
			);
			return events;
		}

		case "error":
			return [
				make({
					type: "error",
					fatal: true,
					code: "Internal",
					message: raw.error ?? "unknown error",
				}),
			];

		default:
			return [];
	}
}

function mapStatus(
	s?: string,
): "preparing" | "streaming" | "tool_calling" | "idle" {
	if (!s) return "streaming";
	if (s.includes("tool")) return "tool_calling";
	if (s.includes("prepar")) return "preparing";
	if (s.includes("idle") || s.includes("done")) return "idle";
	return "streaming";
}
