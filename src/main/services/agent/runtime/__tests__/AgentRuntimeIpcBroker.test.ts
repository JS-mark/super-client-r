// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import type {
	AgentQueryRequest,
	AgentRuntime,
	AgentRuntimeDescriptor,
	AgentRuntimeStreamEvent,
} from "@super-client/shared-types/agent-runtime";
import type { EffectiveSessionRuntime } from "@super-client/shared-types/chat";

import { AgentTraceCollector } from "../../trace/AgentTraceCollector";
import { AgentRuntimeRegistry } from "../AgentRuntimeRegistry";
import {
	AgentRuntimeIpcBroker,
	AGENT_STREAM_CHANNEL,
	type BrokerSender,
	type SessionContextResolver,
} from "../AgentRuntimeIpcBroker";

// ─────────────────────────── helpers ───────────────────────────

function descriptor(id: string): AgentRuntimeDescriptor {
	return {
		id: id as AgentRuntimeDescriptor["id"],
		displayName: id,
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
}

function effectiveRuntime(): EffectiveSessionRuntime {
	return {
		workspaceId: "ws",
		sessionId: "sess",
		model: { providerId: "anthropic", modelId: "x" },
		interactionProfile: "claude-code",
		planMode: "chat",
		runtimePolicy: {
			approvalMode: "request",
			sandboxMode: "workspace-write",
			writableRoots: [],
			networkAccess: "allowed",
			externalAppAccess: "allowed",
		},
		contextPolicy: {
			defaultAttachmentMode: "include-content",
			includeWorkspaceKnowledge: false,
		},
		enabledCapabilities: [],
		attachments: [],
		approvalGrants: [],
	};
}

function fakeRuntime(opts: {
	id?: string;
	events?: AgentRuntimeStreamEvent[];
	onAbort?: () => void;
	throwOnFirst?: unknown;
	delayMs?: number;
}): AgentRuntime {
	const id = opts.id ?? "claude-sdk";
	const desc = descriptor(id);
	const events = opts.events ?? [];
	const interrupt = vi.fn().mockResolvedValue(undefined);
	const resolvePermission = vi.fn().mockResolvedValue(undefined);

	return {
		descriptor: desc,
		interrupt,
		resolvePermission,
		async *createQuery(req: AgentQueryRequest) {
			if (opts.throwOnFirst) throw opts.throwOnFirst;
			let aborted = false;
			req.signal.addEventListener("abort", () => {
				aborted = true;
				opts.onAbort?.();
			});
			for (const ev of events) {
				if (aborted) return;
				if (opts.delayMs) {
					await new Promise((r) => setTimeout(r, opts.delayMs));
				}
				yield ev;
			}
		},
	};
}

function makeSender(): BrokerSender & {
	calls: Array<{ channel: string; payload: unknown }>;
} {
	const calls: Array<{ channel: string; payload: unknown }> = [];
	return {
		send: (channel, payload) => {
			calls.push({ channel, payload });
		},
		isDestroyed: () => false,
		calls,
	};
}

function makeResolver(): SessionContextResolver {
	return {
		resolve: async () => ({
			sessionMeta: { runtimeId: "claude-sdk" },
			effective: effectiveRuntime(),
		}),
	};
}

const baseEvent = {
	v: 1 as const,
	requestId: "req-1",
	conversationId: "conv-1",
	timestamp: 0,
	runtime: "claude-sdk" as const,
};

function ev<T extends AgentRuntimeStreamEvent["type"]>(
	type: T,
	rest: Partial<Extract<AgentRuntimeStreamEvent, { type: T }>> = {},
	seq = 0,
): AgentRuntimeStreamEvent {
	return { ...baseEvent, type, seq, ...rest } as AgentRuntimeStreamEvent;
}

async function flushMicrotasks(times = 5): Promise<void> {
	for (let i = 0; i < times; i++) {
		await Promise.resolve();
	}
}

// ─────────────────────────── tests ───────────────────────────

describe("AgentRuntimeIpcBroker", () => {
	it("forwards adapter events to sender and trace", async () => {
		const events: AgentRuntimeStreamEvent[] = [
			ev("init", { model: "m" }, 0),
			ev("text.delta", { messageId: "m1", delta: "hi" }, 1),
			ev("result", { reason: "completed" }, 2),
		];
		const registry = new AgentRuntimeRegistry();
		registry.register(fakeRuntime({ events }));
		const trace = new AgentTraceCollector();
		const broker = new AgentRuntimeIpcBroker({
			registry,
			trace,
			resolver: makeResolver(),
		});
		const sender = makeSender();
		await broker.createQuery(
			{
				requestId: "req-1",
				conversationId: "conv-1",
				prompt: { kind: "text", text: "hello" },
				runtime: undefined as unknown as EffectiveSessionRuntime, // 由 broker 注入
				tools: [],
			},
			sender,
		);
		// 等 pump 跑完
		await flushMicrotasks(20);

		const channels = sender.calls.map((c) => c.channel);
		expect(channels.every((c) => c === AGENT_STREAM_CHANNEL)).toBe(true);
		expect(sender.calls).toHaveLength(3);
		const types = sender.calls.map(
			(c) => (c.payload as AgentRuntimeStreamEvent).type,
		);
		expect(types).toEqual(["init", "text.delta", "result"]);

		const traceEntry = trace.get("req-1");
		expect(traceEntry?.status).toBe("completed");
		expect(traceEntry?.events).toHaveLength(3);
	});

	it("on adapter throw: emits fatal error + result(error)", async () => {
		const registry = new AgentRuntimeRegistry();
		registry.register(fakeRuntime({ throwOnFirst: new Error("kaboom") }));
		const trace = new AgentTraceCollector();
		const onError = vi.fn();
		const broker = new AgentRuntimeIpcBroker({
			registry,
			trace,
			resolver: makeResolver(),
			onError,
		});
		const sender = makeSender();
		await broker.createQuery(
			{
				requestId: "req-1",
				conversationId: "conv-1",
				prompt: { kind: "text", text: "" },
				runtime: undefined as unknown as EffectiveSessionRuntime,
				tools: [],
			},
			sender,
		);
		await flushMicrotasks(10);

		const types = sender.calls.map(
			(c) => (c.payload as AgentRuntimeStreamEvent).type,
		);
		expect(types).toEqual(["error", "result"]);
		const errEv = sender.calls[0].payload as AgentRuntimeStreamEvent & {
			type: "error";
		};
		expect(errEv.fatal).toBe(true);
		expect(errEv.message).toBe("kaboom");
		expect(onError).toHaveBeenCalledOnce();
		expect(trace.get("req-1")?.status).toBe("errored");
	});

	it("interrupt aborts inflight and propagates to adapter.interrupt", async () => {
		const onAbort = vi.fn();
		const registry = new AgentRuntimeRegistry();
		// 持续输出，依赖 abort 退出
		const longEvents: AgentRuntimeStreamEvent[] = [
			ev("text.delta", { messageId: "m", delta: "a" }, 0),
			ev("text.delta", { messageId: "m", delta: "b" }, 1),
			ev("text.delta", { messageId: "m", delta: "c" }, 2),
		];
		const rt = fakeRuntime({ events: longEvents, onAbort, delayMs: 10 });
		registry.register(rt);
		const trace = new AgentTraceCollector();
		const broker = new AgentRuntimeIpcBroker({
			registry,
			trace,
			resolver: makeResolver(),
		});
		const sender = makeSender();
		await broker.createQuery(
			{
				requestId: "req-1",
				conversationId: "conv-1",
				prompt: { kind: "text", text: "" },
				runtime: undefined as unknown as EffectiveSessionRuntime,
				tools: [],
			},
			sender,
		);
		await new Promise((r) => setTimeout(r, 5));
		const r = await broker.interrupt("req-1");
		expect(r.ok).toBe(true);
		expect(onAbort).toHaveBeenCalled();
		expect(rt.interrupt).toHaveBeenCalledWith("req-1");
	});

	it("interrupt unknown requestId returns ok:false", async () => {
		const broker = new AgentRuntimeIpcBroker({
			registry: new AgentRuntimeRegistry(),
			trace: new AgentTraceCollector(),
			resolver: makeResolver(),
		});
		const r = await broker.interrupt("nope");
		expect(r).toEqual({ ok: false });
	});

	it("rejects duplicate requestId while first inflight", async () => {
		const registry = new AgentRuntimeRegistry();
		// 延迟事件让第一个 query 还没跑完
		registry.register(
			fakeRuntime({
				events: [ev("text.delta", { messageId: "m", delta: "a" }, 0)],
				delayMs: 50,
			}),
		);
		const broker = new AgentRuntimeIpcBroker({
			registry,
			trace: new AgentTraceCollector(),
			resolver: makeResolver(),
		});
		const sender = makeSender();
		const payload = {
			requestId: "req-1",
			conversationId: "conv-1",
			prompt: { kind: "text" as const, text: "" },
			runtime: undefined as unknown as EffectiveSessionRuntime,
			tools: [],
		};
		await broker.createQuery(payload, sender);
		await expect(broker.createQuery(payload, sender)).rejects.toThrow(
			/Duplicate/,
		);
	});

	it("pump finally emits fallback result(cancelled) when runtime never yields result", async () => {
		// runtime 漏发 result（只产出 text.delta 后正常结束 iterator）。
		// broker.pump 的 finally 应兜底 emit 一个 result(cancelled)，避免 renderer 卡住。
		const events: AgentRuntimeStreamEvent[] = [
			ev("text.delta", { messageId: "m", delta: "a" }, 0),
			ev("text.delta", { messageId: "m", delta: "b" }, 1),
			// 注意：故意不发 result
		];
		const registry = new AgentRuntimeRegistry();
		registry.register(fakeRuntime({ events }));
		const trace = new AgentTraceCollector();
		const broker = new AgentRuntimeIpcBroker({
			registry,
			trace,
			resolver: makeResolver(),
		});
		const sender = makeSender();
		await broker.createQuery(
			{
				requestId: "req-1",
				conversationId: "conv-1",
				prompt: { kind: "text", text: "" },
				runtime: undefined as unknown as EffectiveSessionRuntime,
				tools: [],
			},
			sender,
		);
		await flushMicrotasks(20);

		const types = sender.calls.map(
			(c) => (c.payload as AgentRuntimeStreamEvent).type,
		);
		expect(types).toEqual(["text.delta", "text.delta", "result"]);
		const last = sender.calls[sender.calls.length - 1]
			.payload as AgentRuntimeStreamEvent & { type: "result" };
		expect(last.reason).toBe("cancelled");
		expect(trace.get("req-1")?.status).toBe("cancelled");
	});

	it("interrupt emits fallback result(cancelled) after timeout when stream stalls", async () => {
		vi.useFakeTimers();
		try {
			// runtime 进入流后一直挂着（无任何事件、不响应 interrupt），
			// broker.interrupt 的 2s 兜底定时器应主动 send result(cancelled)。
			const stallingRuntime: AgentRuntime = {
				descriptor: descriptor("claude-sdk"),
				interrupt: vi.fn().mockResolvedValue(undefined),
				resolvePermission: vi.fn().mockResolvedValue(undefined),
				async *createQuery(req: AgentQueryRequest) {
					// 永不收尾——等 abort 触发后再返回（模拟 runtime 漏发 result，
					// 验证 broker 的 2s 兜底定时器路径）。下面那条 `if (false) yield`
					// 仅为安抚 lint 的 require-yield，运行时不会执行。
					await new Promise<void>((resolve) => {
						req.signal.addEventListener("abort", () => resolve(), {
							once: true,
						});
					});
					if (false as boolean) yield undefined as unknown as never;
				},
			};
			const registry = new AgentRuntimeRegistry();
			registry.register(stallingRuntime);
			const broker = new AgentRuntimeIpcBroker({
				registry,
				trace: new AgentTraceCollector(),
				resolver: makeResolver(),
			});
			const sender = makeSender();
			await broker.createQuery(
				{
					requestId: "req-1",
					conversationId: "conv-1",
					prompt: { kind: "text", text: "" },
					runtime: undefined as unknown as EffectiveSessionRuntime,
					tools: [],
				},
				sender,
			);
			// 进入挂起态
			await vi.advanceTimersByTimeAsync(10);
			// 触发 interrupt（abort 信号会让上面 stallingRuntime 的 promise resolve）
			const interruptPromise = broker.interrupt("req-1");
			// 2s 兜底定时器到点
			await vi.advanceTimersByTimeAsync(2100);
			await interruptPromise;

			// 至少有一条 result(cancelled) 被 send 出去（兜底定时器或 pump finally
			// 任一路径，重复时 emitFallbackResult 保证只发一次）
			const resultCalls = sender.calls.filter(
				(c) =>
					(c.payload as AgentRuntimeStreamEvent).type === "result" &&
					(
						c.payload as AgentRuntimeStreamEvent & { type: "result" }
					).reason === "cancelled",
			);
			expect(resultCalls.length).toBeGreaterThanOrEqual(1);
		} finally {
			vi.useRealTimers();
		}
	});

	it("resolvePermission fans out to all inflight runtimes", async () => {
		const registry = new AgentRuntimeRegistry();
		const longEvents: AgentRuntimeStreamEvent[] = [
			ev("text.delta", { messageId: "m", delta: "a" }, 0),
		];
		const rt = fakeRuntime({ events: longEvents, delayMs: 30 });
		registry.register(rt);
		const broker = new AgentRuntimeIpcBroker({
			registry,
			trace: new AgentTraceCollector(),
			resolver: makeResolver(),
		});
		await broker.createQuery(
			{
				requestId: "req-1",
				conversationId: "conv-1",
				prompt: { kind: "text", text: "" },
				runtime: undefined as unknown as EffectiveSessionRuntime,
				tools: [],
			},
			makeSender(),
		);
		await new Promise((r) => setTimeout(r, 5));
		await broker.resolvePermission("appr-1", { approved: true, scope: "once" });
		expect(rt.resolvePermission).toHaveBeenCalledWith("appr-1", {
			approved: true,
			scope: "once",
		});
	});
});
