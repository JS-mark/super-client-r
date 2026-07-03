// @vitest-environment node
//
// Broker orphan `permission.resolved` handling.
//
// If a runtime yields a `permission.resolved` event WITHOUT a preceding
// `permission.request` (e.g. an out-of-order stream, adapter bug, resumed
// session on the runtime side), the broker's persist pipeline must not
// throw or fabricate misleading state — the event still flows to the
// renderer + trace, and the storage.appendEvent call (if any) must be a
// well-formed SessionEvent.

import { describe, expect, it, vi } from "vitest";
import type {
	AgentRuntime,
	AgentRuntimeDescriptor,
	AgentRuntimeStreamEvent,
} from "@super-client/shared-types/agent-runtime";
import type { EffectiveSessionRuntime } from "@super-client/shared-types/chat";
import type { SessionEvent } from "@super-client/shared-types/project";

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
			sessionMeta: { projectId: null, runtimeId: "claude-sdk" },
			effective: effectiveRuntime(),
		}),
	};
}

function makeStorage() {
	const appendEvent = vi.fn<(sessionId: string, event: SessionEvent) => void>();
	return { appendEvent };
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

async function flushMicrotasks(times = 20): Promise<void> {
	for (let i = 0; i < times; i++) {
		await Promise.resolve();
	}
}

function orphanRuntime(events: AgentRuntimeStreamEvent[]): AgentRuntime {
	return {
		descriptor: descriptor("claude-sdk"),
		interrupt: vi.fn().mockResolvedValue(undefined),
		resolvePermission: vi.fn().mockResolvedValue(undefined),
		async *createQuery() {
			for (const e of events) yield e;
		},
	};
}

// ─────────────────────────── tests ───────────────────────────

describe("AgentRuntimeIpcBroker orphan permission.resolved", () => {
	it("does not throw and still forwards the event to sender + trace", async () => {
		// A `permission.resolved` without a preceding `permission.request`.
		// No `approvalContexts` entry, no `approvalRequestToolNames` mapping.
		const events: AgentRuntimeStreamEvent[] = [
			ev("init", { model: "m" }, 0),
			ev(
				"permission.resolved",
				{
					approvalId: "orphan-1",
					// intentionally no `toolName` — this is the orphan path
					decision: { approved: true, scope: "once" },
					source: "user",
				},
				1,
			),
			ev("result", { reason: "completed" }, 2),
		];
		const registry = new AgentRuntimeRegistry();
		registry.register(orphanRuntime(events));
		const trace = new AgentTraceCollector();
		const onError = vi.fn();
		const storage = makeStorage();

		const broker = new AgentRuntimeIpcBroker({
			registry,
			trace,
			resolver: makeResolver(),
			storage,
			onError,
		});

		const sender = makeSender();

		// Must not throw.
		await expect(
			broker.createQuery(
				{
					requestId: "req-1",
					conversationId: "conv-1",
					prompt: { kind: "text", text: "" },
					runtime: undefined as unknown as EffectiveSessionRuntime,
					tools: [],
				},
				sender,
			),
		).resolves.toEqual({ ok: true, runtimeId: "claude-sdk" });

		await flushMicrotasks(30);

		// broker.onError must NOT have been called: orphan resolve is a
		// well-formed input, just missing pre-request context.
		expect(onError).not.toHaveBeenCalled();

		// Every event still flows to the sender in-order.
		const channels = sender.calls.map((c) => c.channel);
		expect(channels.every((c) => c === AGENT_STREAM_CHANNEL)).toBe(true);
		const types = sender.calls.map(
			(c) => (c.payload as AgentRuntimeStreamEvent).type,
		);
		expect(types).toEqual(["init", "permission.resolved", "result"]);

		// The permission.resolved event forwarded to the renderer stays
		// UNMODIFIED — no fabricated `toolName` — because
		// `withApprovalRequestContext` should short-circuit when no context
		// exists. (Sender receives the runtime event as-is; the broker
		// re-projects for storage separately.)
		const forwarded = sender.calls[1].payload as AgentRuntimeStreamEvent & {
			type: "permission.resolved";
		};
		expect(forwarded.approvalId).toBe("orphan-1");
		expect(forwarded.toolName).toBeUndefined();

		// Trace has the event too.
		const traceEntry = trace.get("req-1");
		expect(traceEntry?.status).toBe("completed");
		expect(
			traceEntry?.events.some(
				(record) =>
					record.kind === "event" &&
					record.payload.kind === "event" &&
					record.payload.event.type === "permission.resolved",
			),
		).toBe(true);

		// Storage.appendEvent shape check: for the orphan resolve we expect
		// either (a) 0 approval-shape rows (dedupe) OR (b) a single
		// well-formed `approval` SessionEvent. Never a malformed shape.
		// (The current implementation projects it to `approval.resolved` →
		// `approval` SessionEvent since there's no ask-user-question
		// context/payload.)
		const approvalRows = storage.appendEvent.mock.calls
			.map(([, event]) => event)
			.filter((event) => event.type === "approval");
		expect(approvalRows.length).toBeLessThanOrEqual(1);
		for (const row of approvalRows) {
			expect(row).toMatchObject({
				type: "approval",
				toolCallId: "orphan-1",
				decision: "allow_once",
			});
			expect(typeof (row as { ts: unknown }).ts).toBe("number");
		}

		// Sanity: run.started + run.completed session markers must have
		// been appended alongside the (optional) approval row — the pump
		// finished normally.
		const markerKeys = storage.appendEvent.mock.calls
			.map(([, event]) => event)
			.filter((event) => event.type === "session_marker")
			.map(
				(event) =>
					(event as Extract<SessionEvent, { type: "session_marker" }>).key,
			);
		expect(markerKeys).toContain("run.started");
		expect(markerKeys).toContain("run.completed");
	});

	it("does not throw when orphan resolve arrives with no storage attached", async () => {
		// Same shape, but no `storage` dep. Broker must still forward the
		// event to sender and trace, and not throw when the persist path
		// short-circuits on missing storage.
		const events: AgentRuntimeStreamEvent[] = [
			ev("init", { model: "m" }, 0),
			ev(
				"permission.resolved",
				{
					approvalId: "orphan-2",
					decision: { approved: false, scope: "once", reason: "n/a" },
					source: "user",
				},
				1,
			),
			ev("result", { reason: "completed" }, 2),
		];
		const registry = new AgentRuntimeRegistry();
		registry.register(orphanRuntime(events));
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
		await flushMicrotasks(30);

		expect(onError).not.toHaveBeenCalled();
		const forwarded = sender.calls.find(
			(c) =>
				(c.payload as AgentRuntimeStreamEvent).type === "permission.resolved",
		);
		expect(forwarded).toBeDefined();
		expect(
			(forwarded!.payload as AgentRuntimeStreamEvent & {
				type: "permission.resolved";
			}).toolName,
		).toBeUndefined();
		expect(trace.get("req-1")?.status).toBe("completed");
	});
});
