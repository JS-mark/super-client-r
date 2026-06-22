/**
 * AgentSdkTraceSniffer —— Phase 1 过渡期观察器
 *
 * 在 useChat 尚未切到 `agentRuntime.*` 通道前，让 `/debug/agent-traces` 页面
 * 也能看到旧 `agent-sdk:*` 路径上的真实流量。
 *
 * 实现：
 *   - 监听 `agentSDKService.on('stream-event')`
 *   - 把 `AgentSDKStreamEvent` 通过现有 `normalize` 转成 `AgentRuntimeStreamEvent`
 *   - 按 requestId 维护 trace 生命周期（init → begin、result/error → finish）
 *
 * 副作用零接管：不修改任何事件流向，仅"旁路"喂给 collector。Phase 1.5b/1.8
 * 之后 useChat 切到 broker 时本 sniffer 可下线（spec §10 Phase 3）。
 */

import type { AgentSDKStreamEvent } from "@super-client/shared-types/agent-sdk";
import type { AgentRuntimeStreamEvent } from "@super-client/shared-types/agent-runtime";

import type { AgentSDKService } from "../AgentSDKService";
import type { AgentTraceCollector } from "../trace/AgentTraceCollector";
import { normalize as normalizeClaudeSdkEvent } from "./ClaudeSdkRuntime";

const RUNTIME_ID = "claude-sdk" as const;

interface TraceCtx {
	seq: number;
	beganAt: number;
}

export class AgentSdkTraceSniffer {
	private readonly ctxByRequest = new Map<string, TraceCtx>();
	private unsubscribe: (() => void) | null = null;

	constructor(
		private readonly inner: AgentSDKService,
		private readonly collector: AgentTraceCollector,
	) {}

	start(): void {
		if (this.unsubscribe) return;
		const eventListener = (raw: AgentSDKStreamEvent) => this.onSdkEvent(raw);
		const stderrListener = (payload: { requestId: string; line: string }) =>
			this.onStderrLine(payload);
		this.inner.on("stream-event", eventListener);
		this.inner.on("stderr-line", stderrListener);
		this.unsubscribe = () => {
			this.inner.off("stream-event", eventListener);
			this.inner.off("stderr-line", stderrListener);
		};
	}

	stop(): void {
		this.unsubscribe?.();
		this.unsubscribe = null;
		this.ctxByRequest.clear();
	}

	private onStderrLine(payload: { requestId: string; line: string }): void {
		// 即便没有 init 事件先到（极少数情况下 SDK 子进程在 init 之前就喷 stderr），
		// 也兜底建一个 trace 把日志留下来
		if (!this.ctxByRequest.has(payload.requestId)) {
			this.ctxByRequest.set(payload.requestId, {
				seq: 0,
				beganAt: Date.now(),
			});
			this.collector.begin({
				requestId: payload.requestId,
				conversationId: payload.requestId,
				runtimeId: RUNTIME_ID,
				prompt: { kind: "text", text: "(stderr cold-start)" },
				startedAt: Date.now(),
			});
		}
		this.collector.record(payload.requestId, {
			kind: "native.log",
			payload: {
				kind: "native.log",
				stream: "stderr",
				line: payload.line,
			},
			tag: "sniffed:agent-sdk:stderr",
		});
	}

	// ─────────────────────────── private ───────────────────────────

	private onSdkEvent(raw: AgentSDKStreamEvent): void {
		const requestId = raw.requestId;
		if (!requestId) return;

		let ctx = this.ctxByRequest.get(requestId);

		// init 阶段：开始一条 trace。conversationId 在 SDK 事件里没有显式字段，
		// 我们用 sessionId（init 携带）作为兜底；若也缺则用 requestId。
		if (!ctx && raw.type === "init") {
			ctx = { seq: 0, beganAt: Date.now() };
			this.ctxByRequest.set(requestId, ctx);
			this.collector.begin({
				requestId,
				conversationId: raw.sessionId ?? requestId,
				runtimeId: RUNTIME_ID,
				prompt: { kind: "text", text: "(sniffed from agent-sdk)" },
				startedAt: ctx.beganAt,
			});
		}

		if (!ctx) {
			// 该 trace 没有看到 init（可能是 sniffer 启动前就开始的）；
			// 兜底创建一条以保留事件
			ctx = { seq: 0, beganAt: Date.now() };
			this.ctxByRequest.set(requestId, ctx);
			this.collector.begin({
				requestId,
				conversationId: requestId,
				runtimeId: RUNTIME_ID,
				prompt: { kind: "text", text: "(sniffer cold-start)" },
				startedAt: ctx.beganAt,
			});
		}

		// 把事件归一化（复用 ClaudeSdkRuntime 的 normalize）。
		// normalize 的第二个参数是 EventFactory：partial → 完整事件，自动 spread base。
		const conversationId = raw.sessionId ?? requestId;
		const annotate = (
			partial: Record<string, unknown> & {
				type: AgentRuntimeStreamEvent["type"];
			},
		): AgentRuntimeStreamEvent =>
			({
				v: 1,
				requestId,
				conversationId,
				seq: ctx ? ctx.seq++ : 0,
				runtime: RUNTIME_ID,
				timestamp: Date.now(),
				...partial,
			}) as AgentRuntimeStreamEvent;
		const normalized = normalizeClaudeSdkEvent(raw, annotate);

		for (const ev of normalized) {
			this.collector.record(requestId, {
				kind: "event",
				payload: { kind: "event", event: ev as AgentRuntimeStreamEvent },
				callId: "callId" in ev ? (ev as { callId?: string }).callId : undefined,
				approvalId:
					"approvalId" in ev
						? (ev as { approvalId?: string }).approvalId
						: undefined,
				messageId:
					"messageId" in ev
						? (ev as { messageId?: string }).messageId
						: undefined,
				tag: "sniffed:agent-sdk",
			});
		}

		// 终止：result / error
		if (raw.type === "result" || raw.type === "error") {
			this.ctxByRequest.delete(requestId);
			const status =
				raw.type === "error" || raw.result?.success === false
					? "errored"
					: "completed";
			this.collector.finish(requestId, status);
		}
	}
}
