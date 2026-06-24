/**
 * AgentRuntimeIpcBroker
 *
 * 详见 spec §6.2。Adapter 与 IPC 边界的唯一接缝。
 *
 * 职责：
 * - 收到 `agent:create-query` payload 后注入 AbortController.signal
 * - 调 `AgentRuntimeRegistry.resolveForSession` 选 runtime
 * - 消费 `runtime.createQuery(req)` 的 AsyncIterable，把每条事件
 *   `event.sender.send('agent:stream-event', ev)` 推回**发起请求的窗口**
 * - 同时把每条事件推送到 `AgentTraceCollector`
 * - Adapter 抛出未捕获异常 → 兜底转 AgentErrorEvent(fatal=true)
 * - `agent:interrupt(requestId)` 调对应 controller.abort()，再让 adapter
 *   的 createQuery 完成清理
 *
 * 不在本文件里：
 * - IPC 通道注册（在 ipc/handlers/agentRuntimeHandlers.ts，调用本类）
 * - 旧 `agent-sdk:*` 转调（同上）
 */

import type { WebContents } from "electron";
import {
	type AgentErrorEvent,
	type AgentQueryRequest,
	type AgentQueryRequestPayload,
	type AgentResultEvent,
	type AgentRuntime,
	type AgentRuntimeStreamEvent,
	AgentRuntimeError,
	type PermissionDecision,
} from "@super-client/shared-types/agent-runtime";

import type { AgentRuntimeRegistry } from "./AgentRuntimeRegistry";
import type {
	AgentTraceBeginInfo,
	AgentTraceCollector,
} from "../trace/AgentTraceCollector";
import type { SessionMeta } from "@super-client/shared-types/project";

// ─────────────────────────────────────────────────────────────────────
// Sender 抽象（便于单测，不直接耦合 electron WebContents）
// ─────────────────────────────────────────────────────────────────────

export interface BrokerSender {
	send(channel: string, payload: unknown): void;
	isDestroyed(): boolean;
}

export function wrapWebContents(wc: WebContents): BrokerSender {
	return {
		send: (channel, payload) => wc.send(channel, payload),
		isDestroyed: () => wc.isDestroyed(),
	};
}

// ─────────────────────────────────────────────────────────────────────
// Session resolver hook
// ─────────────────────────────────────────────────────────────────────

/**
 * Broker 不直接依赖 SessionStorageService / SessionRuntimeResolver，避免循环
 * 依赖。Adapter 注入一个解析器，把 conversationId → SessionMeta + EffectiveSessionRuntime。
 *
 * - sessionMeta 用于 registry.resolveForSession（runtimeId 选择）
 * - effective 注入到 AgentQueryRequest.runtime
 */
export interface SessionContextResolver {
	resolve(conversationId: string): Promise<{
		sessionMeta: Pick<SessionMeta, "runtimeId" | "interactionProfileOverride">;
		effective: AgentQueryRequest["runtime"];
	}>;
}

// ─────────────────────────────────────────────────────────────────────
// Inflight 状态
// ─────────────────────────────────────────────────────────────────────

interface InflightEntry {
	controller: AbortController;
	sender: BrokerSender;
	runtime: AgentRuntime;
	/**
	 * Pump 进入前持有的 AgentQueryRequest，用于 `interrupt()` 的超时兜底里
	 * 构造完整的 result event（带真实 conversationId / runtime id）。
	 */
	req: AgentQueryRequest;
	/** Pump 当前累计的最大 seq + 1，兜底 emit 时拿来续号。 */
	nextSeq: number;
	/** Pump 是否已经 emit 过 result。 */
	resultEmitted: boolean;
}

/**
 * 流式事件 channel；与 IPC handlers 中的 `AGENT_RUNTIME_CHANNELS.STREAM_EVENT`
 * 保持一致。用 `agent-runtime:` 命名空间避免与 legacy `agent:` 桥接冲突
 * （legacy AgentService 的 onStreamEvent 已经占用 `agent:stream-event`）。
 */
export const AGENT_STREAM_CHANNEL = "agent-runtime:stream-event";

// ─────────────────────────────────────────────────────────────────────
// Broker
// ─────────────────────────────────────────────────────────────────────

export interface AgentRuntimeIpcBrokerDeps {
	registry: AgentRuntimeRegistry;
	trace: AgentTraceCollector;
	resolver: SessionContextResolver;
	/** 用于 broker 内部 fatal 错误日志（非业务错） */
	onError?: (err: unknown, ctx: { requestId: string }) => void;
}

export class AgentRuntimeIpcBroker {
	private readonly inflight = new Map<string, InflightEntry>();

	constructor(private readonly deps: AgentRuntimeIpcBrokerDeps) {}

	/**
	 * 处理 `agent:create-query`。
	 *
	 * 立即返回 ack；事件流通过 sender.send 异步推送。
	 * Drain 由 broker 自己 await 在后台 Promise 中跑。
	 */
	async createQuery(
		payload: AgentQueryRequestPayload,
		sender: BrokerSender,
	): Promise<{ ok: true; runtimeId: string }> {
		if (this.inflight.has(payload.requestId)) {
			throw new AgentRuntimeError(
				"InvalidRequest",
				`Duplicate requestId: ${payload.requestId}`,
			);
		}

		const ctx = await this.deps.resolver.resolve(payload.conversationId);
		const profile =
			ctx.sessionMeta.interactionProfileOverride ??
			ctx.effective.interactionProfile;
		const runtime = this.deps.registry.resolveForSession({
			sessionMeta: ctx.sessionMeta,
			profile,
			model: ctx.effective.model,
		});

		const controller = new AbortController();
		const req: AgentQueryRequest = {
			...payload,
			runtime: ctx.effective,
			signal: controller.signal,
		};

		const entry: InflightEntry = {
			controller,
			sender,
			runtime,
			req,
			nextSeq: 0,
			resultEmitted: false,
		};
		this.inflight.set(payload.requestId, entry);

		const beginInfo: AgentTraceBeginInfo = {
			requestId: payload.requestId,
			conversationId: payload.conversationId,
			runtimeId: runtime.descriptor.id,
			prompt: payload.prompt,
			tools: payload.tools,
		};
		this.deps.trace.begin(beginInfo);

		// fire-and-forget pump
		void this.pump(runtime, req, sender, entry);

		return { ok: true, runtimeId: runtime.descriptor.id };
	}

	/** `agent:resolve-permission` */
	async resolvePermission(
		approvalId: string,
		decision: PermissionDecision,
	): Promise<void> {
		// 把 decision 路由到所有 inflight runtime（同 approvalId 通常只命中一个）。
		// adapter 自己负责按 approvalId 找到对应 pending resolver。
		const runtimes = new Set<AgentRuntime>();
		for (const e of this.inflight.values()) runtimes.add(e.runtime);
		await Promise.all(
			[...runtimes].map((r) =>
				r.resolvePermission(approvalId, decision).catch((err) => {
					this.deps.onError?.(err, { requestId: "<approval-fanout>" });
				}),
			),
		);
	}

	/** `agent:interrupt` */
	async interrupt(requestId: string): Promise<{ ok: boolean }> {
		const entry = this.inflight.get(requestId);
		if (!entry) return { ok: false };
		entry.controller.abort();
		try {
			await entry.runtime.interrupt(requestId);
		} catch (err) {
			this.deps.onError?.(err, { requestId });
		}
		// 兜底：2s 后若 pump 仍未结束（runtime 漏发 result / 软中断不响应），
		// 主动 send 一个 result(cancelled) 给 sender，解放 renderer。
		// Pump 自己的 finally 也会判 resultEmitted，避免重复 emit。
		setTimeout(() => {
			const stale = this.inflight.get(requestId);
			if (!stale || stale.resultEmitted) return;
			this.emitFallbackResult(stale, "cancelled");
		}, 2000);
		return { ok: true };
	}

	/**
	 * 兜底 emit 一个 result event 给 sender + trace，并标记 entry.resultEmitted。
	 * 调用方需自行保证 `!entry.resultEmitted`。
	 */
	private emitFallbackResult(
		entry: InflightEntry,
		reason: AgentResultEvent["reason"],
	): void {
		const seq = entry.nextSeq++;
		const ev = makeResultEvent(entry.req, entry.runtime, reason, seq);
		entry.resultEmitted = true;
		this.deps.trace.record(entry.req.requestId, {
			kind: "event",
			payload: { kind: "event", event: ev },
		});
		if (!entry.sender.isDestroyed()) {
			entry.sender.send(AGENT_STREAM_CHANNEL, ev);
		}
	}

	/** App quit 时调用：abort 所有 inflight。 */
	async dispose(): Promise<void> {
		for (const [, entry] of this.inflight) {
			entry.controller.abort();
		}
		this.inflight.clear();
	}

	// ─────────────────────────── pump ───────────────────────────

	private async pump(
		runtime: AgentRuntime,
		req: AgentQueryRequest,
		sender: BrokerSender,
		entry: InflightEntry,
	): Promise<void> {
		let lastEvent: AgentRuntimeStreamEvent | null = null;
		// Track whether the runtime already yielded its own structured
		// `error` event so the broker's fallback catch doesn't emit a
		// SECOND, less-detailed error event that would clobber the rich
		// LLMErrorContext (HTTP status, response body, stack, etc.) on the
		// renderer side. See ClaudeCodeAgentRuntime.createQuery — when an
		// underlying LLM call fails, the runtime yields the translator's
		// error event *and* re-throws the captured `errored` from the
		// iterator's finalizer, so this code path used to fire twice.
		let runtimeEmittedError = false;
		try {
			for await (const ev of runtime.createQuery(req)) {
				lastEvent = ev;
				if (ev.type === "result") entry.resultEmitted = true;
				if (ev.type === "error") runtimeEmittedError = true;
				entry.nextSeq = Math.max(entry.nextSeq, ev.seq + 1);
				this.deps.trace.record(req.requestId, {
					kind: "event",
					payload: { kind: "event", event: ev },
					callId: "callId" in ev ? ev.callId : undefined,
					approvalId: "approvalId" in ev ? ev.approvalId : undefined,
					messageId: "messageId" in ev ? ev.messageId : undefined,
				});
				if (!sender.isDestroyed()) {
					sender.send(AGENT_STREAM_CHANNEL, ev);
				}
			}
		} catch (err) {
			// adapter 抛出未捕获异常 → 转 fatal error event + result
			// Skip the synthesized error event when the runtime already
			// emitted its own — keeping the structured one (with
			// statusCode / stack / response body) intact on the renderer.
			if (!runtimeEmittedError) {
				const errEv = makeErrorEvent(req, runtime, err, entry.nextSeq++);
				this.deps.trace.record(req.requestId, {
					kind: "event",
					payload: { kind: "event", event: errEv },
				});
				if (!sender.isDestroyed()) sender.send(AGENT_STREAM_CHANNEL, errEv);
				lastEvent = errEv;
			}
			if (!entry.resultEmitted) {
				const resEv = makeResultEvent(req, runtime, "error", entry.nextSeq++);
				this.deps.trace.record(req.requestId, {
					kind: "event",
					payload: { kind: "event", event: resEv },
				});
				if (!sender.isDestroyed()) sender.send(AGENT_STREAM_CHANNEL, resEv);
				entry.resultEmitted = true;
				lastEvent = resEv;
			}
			this.deps.onError?.(err, { requestId: req.requestId });
		} finally {
			// 兜底：iterator 正常退出但 runtime 漏发 result（理论不该发生，
			// 此处兜底让 renderer 不卡死，并保持 trace 状态闭环）。
			if (!entry.resultEmitted) {
				const resEv = makeResultEvent(
					req,
					runtime,
					"cancelled",
					entry.nextSeq++,
				);
				this.deps.trace.record(req.requestId, {
					kind: "event",
					payload: { kind: "event", event: resEv },
				});
				if (!sender.isDestroyed()) sender.send(AGENT_STREAM_CHANNEL, resEv);
				entry.resultEmitted = true;
				lastEvent = resEv;
			}
			this.inflight.delete(req.requestId);
			const status = deriveTraceStatus(lastEvent, entry.resultEmitted);
			this.deps.trace.finish(req.requestId, status);
		}
	}
}

// ─────────────────────────── helpers ───────────────────────────

function makeErrorEvent(
	req: AgentQueryRequest,
	runtime: AgentRuntime,
	err: unknown,
	seq: number,
): AgentErrorEvent {
	const e = err as { code?: string; message?: string };
	const code =
		err instanceof AgentRuntimeError ? err.code : (e?.code ?? "Internal");
	// Capture a minimal LLMErrorContext from the broker-level exception so
	// the renderer's ErrorCard has at least preset/model/runtime + stack to
	// show, even when the failure didn't originate from LLMService (e.g.
	// IPC/runtime/spawn failures).
	const rawStack =
		err instanceof Error && typeof err.stack === "string"
			? err.stack
			: undefined;
	const stack = rawStack ? rawStack.slice(0, 4_000) : undefined;
	const errorContext = {
		preset: undefined,
		apiFormat: undefined,
		baseUrl: undefined,
		model: undefined,
		statusCode: undefined,
		endpointUrl: undefined,
		responseBodySnippet: undefined,
		providerErrorCode: code,
		providerErrorMessage: e?.message ?? String(err),
		...(stack ? { stack } : {}),
	};
	return {
		v: 1,
		type: "error",
		fatal: true,
		code,
		message: e?.message ?? String(err),
		errorContext,
		requestId: req.requestId,
		conversationId: req.conversationId,
		seq,
		runtime: runtime.descriptor.id,
		timestamp: Date.now(),
	};
}

function makeResultEvent(
	req: AgentQueryRequest,
	runtime: AgentRuntime,
	reason: AgentResultEvent["reason"],
	seq: number,
): AgentResultEvent {
	return {
		v: 1,
		type: "result",
		reason,
		requestId: req.requestId,
		conversationId: req.conversationId,
		seq,
		runtime: runtime.descriptor.id,
		timestamp: Date.now(),
	};
}

function deriveTraceStatus(
	last: AgentRuntimeStreamEvent | null,
	resultEmitted: boolean,
): "completed" | "cancelled" | "errored" {
	if (!resultEmitted) return "errored";
	if (last && last.type === "result") {
		switch (last.reason) {
			case "completed":
				return "completed";
			case "cancelled":
				return "cancelled";
			case "error":
				return "errored";
			case "max_turns":
				return "completed";
		}
	}
	return "completed";
}
