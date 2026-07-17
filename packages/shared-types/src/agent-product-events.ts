import type {
	AgentRuntimeId,
	AgentRuntimeStreamEvent,
	CustomAgentRuntimeId,
	PermissionDecision,
	ToolResultContent,
} from "./agent-runtime";
import type {
	LLMErrorContext,
	MessageContextStrategy,
	ProjectRulesSnapshotDto,
} from "./chat";
import type {
	PlanDecisionRecord,
	PlanExecuteTurnLink,
} from "./plan-execute";
import type { SubagentRunSummary } from "./subagent";

export type AgentProductEventType =
	| "run.started"
	| "run.status"
	| "run.usage"
	| "run.rate_limit"
	| "run.completed"
	| "run.stopped"
	| "run.error"
	| "message.delta"
	| "message.completed"
	| "structured_part.delta"
	| "tool.call"
	| "tool.result"
	| "tool.error"
	| "approval.requested"
	| "approval.resolved"
	| "ask.requested"
	| "ask.answered"
	| "context.compacted"
	| "plan.decision"
	| "execute.turn.created"
	| "subagent.spawned"
	| "subagent.updated"
	| "subagent.completed"
	| "subagent.failed"
	| "unknown";

export type AgentProductEventStatus =
	| "pending"
	| "streaming"
	| "requires_action"
	| "completed"
	| "stopped"
	| "error";

export type AgentProductEventSource = "runtime" | "product";

export interface AgentProductEventBase<
	TType extends AgentProductEventType = AgentProductEventType,
	TPayload extends Record<string, unknown> = Record<string, unknown>,
> {
	v: 1;
	type: TType;
	/**
	 * Deterministic event id derived from the runtime event or product action.
	 * Storage may replace this with the JSONL writer id when materializing
	 * persisted SessionEvents.
	 */
	eventId: string;
	sourceEventId?: string;
	sessionId: string;
	projectId?: string | null;
	runId?: string;
	turnId?: string;
	requestId?: string;
	runtime?: AgentRuntimeId | CustomAgentRuntimeId;
	runtimeSeq?: number;
	ts: number;
	status?: AgentProductEventStatus;
	source: AgentProductEventSource;
	/** Whether this product event should be materialized beyond in-memory UI state. */
	persist: boolean;
	transient?: boolean;
	/**
	 * Multi-Agent Round 6：主 Agent 的 requestId / runId。仅子代理运行时
	 * 携带；主 Agent 直接产生的 event 不带此字段。
	 */
	parentRunId?: string;
	/**
	 * Multi-Agent Round 6：本 event 所属子代理的运行 id。主 Agent 直接产生
	 * 的 event 不带此字段；storage 层据此把 tool/tool_result 归入父转录里
	 * 对应的 `SubagentMessagePart`。
	 */
	subagentRunId?: string;
	payload: TPayload;
}

export type AgentProductEvent =
	| AgentProductEventBase<
			"run.started",
			{
				nativeSessionId?: string;
				model?: string;
				projectRulesSnapshot?: ProjectRulesSnapshotDto;
			}
	  >
	| AgentProductEventBase<"run.status", { status: string }>
	| AgentProductEventBase<
			"run.usage",
			{
				inputTokens: number;
				outputTokens: number;
				cacheReadTokens?: number;
				cacheWriteTokens?: number;
			}
	  >
	| AgentProductEventBase<
			"run.rate_limit",
			{ retryAfterMs?: number; message?: string }
	  >
	| AgentProductEventBase<
			"run.completed",
			{ finalMessageId?: string; reason: string }
	  >
	| AgentProductEventBase<"run.stopped", { reason: string }>
	| AgentProductEventBase<
			"run.error",
			{
				fatal?: boolean;
				code?: string;
				message?: string;
				errorContext?: LLMErrorContext;
				reason?: string;
			}
	  >
	| AgentProductEventBase<"message.delta", { messageId: string; delta: string }>
	| AgentProductEventBase<
			"message.completed",
			{ messageId: string; text: string; reasoning?: string }
	  >
	| AgentProductEventBase<
			"structured_part.delta",
			{ messageId: string; kind: "reasoning"; delta: string }
	  >
	| AgentProductEventBase<
			"tool.call",
			{ callId: string; toolName: string; input: unknown }
	  >
	| AgentProductEventBase<
			"tool.result",
			{ callId: string; content: ToolResultContent }
	  >
	| AgentProductEventBase<
			"tool.error",
			{ callId: string; content: ToolResultContent }
	  >
	| AgentProductEventBase<
			"approval.requested",
			{ approvalId: string; toolName: string; input: unknown }
	  >
	| AgentProductEventBase<
			"approval.resolved",
			{ approvalId: string; decision: PermissionDecision; source: string }
	  >
	| AgentProductEventBase<
			"ask.requested",
			{ askId: string; toolName: string; input: unknown }
	  >
	| AgentProductEventBase<
			"ask.answered",
			{
				askId: string;
				decision: PermissionDecision;
				source: string;
				payload?: Record<string, unknown>;
			}
	  >
	| AgentProductEventBase<
			"context.compacted",
			{
				summaryMessageId: string;
				summary: string;
				originalCount: number;
				compactedAt: number;
				strategy: MessageContextStrategy;
				originalMessageIds?: string[];
				estimatedTokens?: number;
				summarySource?: "llm" | "fallback";
				model?: string;
			}
	  >
	| AgentProductEventBase<"plan.decision", { record: PlanDecisionRecord }>
	| AgentProductEventBase<
			"execute.turn.created",
			{ link: PlanExecuteTurnLink }
	  >
	| AgentProductEventBase<"subagent.spawned", { run: SubagentRunSummary }>
	| AgentProductEventBase<
			"subagent.updated",
			{ subagentRunId: string; patch: Partial<SubagentRunSummary> }
	  >
	| AgentProductEventBase<
			"subagent.completed",
			{
				subagentRunId: string;
				endedAt: number;
				summary?: string;
				tokenUsage?: { input?: number; output?: number };
				toolCallCount?: number;
				resultRef?: string;
			}
	  >
	| AgentProductEventBase<
			"subagent.failed",
			{ subagentRunId: string; errorMessage: string; endedAt: number }
	  >
	| AgentProductEventBase<
			"unknown",
			{ runtimeType: string; summary: string; raw?: unknown }
	  >;

export interface AgentProductEventProjectionContext {
	projectId?: string | null;
	turnId?: string;
}

export interface PlanProductEventContext {
	sessionId: string;
	projectId?: string | null;
	runId?: string;
	turnId?: string;
	requestId?: string;
	runtime?: AgentRuntimeId | CustomAgentRuntimeId;
	runtimeSeq?: number;
	ts?: number;
	eventIdPrefix?: string;
}

export interface ContextCompactedProductEventContext {
	sessionId: string;
	projectId?: string | null;
	runId?: string;
	turnId?: string;
	requestId?: string;
	runtime?: AgentRuntimeId | CustomAgentRuntimeId;
	runtimeSeq?: number;
	ts?: number;
	eventIdPrefix?: string;
}

export interface ContextCompactedProductEventInput {
	summaryMessageId: string;
	summary: string;
	originalCount: number;
	compactedAt: number;
	strategy: MessageContextStrategy;
	originalMessageIds?: string[];
	estimatedTokens?: number;
	summarySource?: "llm" | "fallback";
	model?: string;
}

export function createContextCompactedProductEvent(
	input: ContextCompactedProductEventInput,
	context: ContextCompactedProductEventContext,
): AgentProductEvent {
	const eventId = buildContextProductEventId(context, input);
	return {
		v: 1,
		type: "context.compacted",
		eventId,
		sourceEventId: eventId,
		sessionId: context.sessionId,
		projectId: context.projectId,
		runId: context.runId,
		turnId: context.turnId,
		requestId: context.requestId,
		runtime: context.runtime,
		runtimeSeq: context.runtimeSeq,
		ts: context.ts ?? input.compactedAt,
		status: "completed",
		source: "product",
		persist: true,
		payload: input,
	};
}

export function createPlanDecisionProductEvent(
	record: PlanDecisionRecord,
	context: PlanProductEventContext,
): AgentProductEvent {
	const decisionId = record.decision.id ?? record.createdAt;
	const eventId = buildPlanProductEventId(
		context,
		"plan.decision",
		[
			record.sourcePlanId,
			String(record.sourcePlanVersion),
			record.action,
			decisionId,
		],
	);

	return {
		v: 1,
		type: "plan.decision",
		eventId,
		sourceEventId: eventId,
		sessionId: context.sessionId,
		projectId: context.projectId,
		runId: context.runId,
		turnId: context.turnId ?? record.sourcePlanTurnId,
		requestId: context.requestId,
		runtime: context.runtime,
		runtimeSeq: context.runtimeSeq,
		ts: context.ts ?? Date.parse(record.createdAt),
		status: record.action === "cancel" ? "stopped" : "completed",
		source: "product",
		persist: true,
		payload: { record },
	};
}

export function createExecuteTurnCreatedProductEvent(
	link: PlanExecuteTurnLink,
	context: PlanProductEventContext,
): AgentProductEvent {
	const eventId = buildPlanProductEventId(
		context,
		"execute.turn.created",
		[
			link.sourcePlanId,
			String(link.sourcePlanVersion),
			link.decisionId ?? link.createdAt,
			link.userMessageId ?? "",
			link.assistantMessageId ?? "",
		],
	);

	return {
		v: 1,
		type: "execute.turn.created",
		eventId,
		sourceEventId: eventId,
		sessionId: context.sessionId,
		projectId: context.projectId,
		runId: context.runId,
		turnId: context.turnId ?? link.userMessageId,
		requestId: context.requestId,
		runtime: context.runtime,
		runtimeSeq: context.runtimeSeq,
		ts: context.ts ?? Date.parse(link.createdAt),
		status: "completed",
		source: "product",
		persist: true,
		payload: { link },
	};
}

export function createPlanExecuteProductEvents(
	record: PlanDecisionRecord,
	context: PlanProductEventContext,
	link?: PlanExecuteTurnLink,
): AgentProductEvent[] {
	const events = [createPlanDecisionProductEvent(record, context)];
	if (link) events.push(createExecuteTurnCreatedProductEvent(link, context));
	return events;
}

export function projectAgentRuntimeEvent(
	event: AgentRuntimeStreamEvent,
	context: AgentProductEventProjectionContext = {},
): AgentProductEvent[] {
	const build = <
		TType extends AgentProductEventType,
		TPayload extends Record<string, unknown>,
	>(
		type: TType,
		payload: TPayload,
		options: {
			status?: AgentProductEventStatus;
			persist?: boolean;
			transient?: boolean;
		} = {},
	): AgentProductEventBase<TType, TPayload> => ({
		v: 1,
		type,
		eventId: buildProductEventId(event, type),
		sourceEventId: buildRuntimeEventId(event),
		sessionId: event.conversationId,
		projectId: context.projectId,
		runId: event.requestId,
		turnId: context.turnId,
		requestId: event.requestId,
		runtime: event.runtime,
		runtimeSeq: event.seq,
		ts: event.timestamp,
		status: options.status,
		source: "runtime",
		persist: options.persist ?? true,
		transient: options.transient,
		// Multi-Agent Round 6：透传子代理归属字段（若 runtime event 携带）。
		// 主 Agent 事件不带，subagent runtime 会填充。
		...(event.parentRunId ? { parentRunId: event.parentRunId } : {}),
		...(event.subagentRunId ? { subagentRunId: event.subagentRunId } : {}),
		payload,
	});

	switch (event.type) {
		case "init":
			return [
				build(
					"run.started",
					{
						nativeSessionId: event.nativeSessionId,
						model: event.model,
						projectRulesSnapshot: event.projectRulesSnapshot,
					},
					{ status: "streaming" },
				),
			];
		case "text.delta":
			return [
				build(
					"message.delta",
					{ messageId: event.messageId, delta: event.delta },
					{ status: "streaming", persist: false, transient: true },
				),
			];
		case "reasoning.delta":
			return [
				build(
					"structured_part.delta",
					{
						messageId: event.messageId,
						kind: "reasoning" as const,
						delta: event.delta,
					},
					{ status: "streaming", persist: false, transient: true },
				),
			];
		case "message.final":
			return [
				build(
					"message.completed",
					{
						messageId: event.messageId,
						text: event.text,
						reasoning: event.reasoning,
					},
					{ status: "completed" },
				),
			];
		case "tool.call":
			return [
				build(
					"tool.call",
					{
						callId: event.callId,
						toolName: event.toolName,
						input: event.input,
					},
					{ status: "pending" },
				),
			];
		case "tool.result":
			if (event.isError) {
				return [
					build(
						"tool.error",
						{ callId: event.callId, content: event.content },
						{ status: "error" },
					),
				];
			}
			return [
				build(
					"tool.result",
					{ callId: event.callId, content: event.content },
					{ status: "completed" },
				),
			];
		case "permission.request":
			if (isAskUserQuestionToolName(event.toolName)) {
				return [
					build(
						"ask.requested",
						{
							askId: event.approvalId,
							toolName: event.toolName,
							input: event.input,
						},
						{ status: "requires_action" },
					),
				];
			}
			return [
				build(
					"approval.requested",
					{
						approvalId: event.approvalId,
						toolName: event.toolName,
						input: event.input,
					},
					{ status: "requires_action" },
				),
			];
		case "permission.resolved":
			if (
				(event.toolName && isAskUserQuestionToolName(event.toolName)) ||
				isAskUserQuestionPayload(event.decision.payload)
			) {
				return [
					build(
						"ask.answered",
						{
							askId: event.approvalId,
							decision: event.decision,
							source: event.source,
							payload: event.decision.payload,
						},
						{ status: event.decision.approved ? "completed" : "stopped" },
					),
				];
			}
			return [
				build(
					"approval.resolved",
					{
						approvalId: event.approvalId,
						decision: event.decision,
						source: event.source,
					},
					{ status: event.decision.approved ? "completed" : "stopped" },
				),
			];
		case "status":
			return [
				build(
					"run.status",
					{ status: event.status },
					{
						status: event.status === "idle" ? "completed" : "streaming",
						persist: false,
						transient: true,
					},
				),
			];
		case "usage":
			// Per-tick usage is UI-only telemetry: it fires on every runtime
			// `usage` event (often several per turn) and would otherwise flood the
			// JSONL audit log. Treated the same way as `run.status` / message
			// deltas — projected for live UI consumption but never materialized
			// into a session_marker. If a terminal usage snapshot is needed for
			// audit/replay, the runtime should attach usage totals to the
			// terminal `result` event and a dedicated projection can persist
			// them then; today `AgentResultEvent` does not carry usage fields.
			return [
				build(
					"run.usage",
					{
						inputTokens: event.inputTokens,
						outputTokens: event.outputTokens,
						cacheReadTokens: event.cacheReadTokens,
						cacheWriteTokens: event.cacheWriteTokens,
					},
					{ persist: false, transient: true },
				),
			];
		case "rate_limit":
			return [
				build("run.rate_limit", {
					retryAfterMs: event.retryAfterMs,
					message: event.message,
				}),
			];
		case "result":
			switch (event.reason) {
				case "completed":
				case "max_turns":
					return [
						build(
							"run.completed",
							{ finalMessageId: event.finalMessageId, reason: event.reason },
							{ status: "completed" },
						),
					];
				case "cancelled":
					return [
						build(
							"run.stopped",
							{ reason: event.reason },
							{ status: "stopped" },
						),
					];
				case "error":
					return [
						build("run.error", { reason: event.reason }, { status: "error" }),
					];
			}
			return [];
		case "error":
			return [
				build(
					"run.error",
					{
						fatal: event.fatal,
						code: event.code,
						message: event.message,
						errorContext: event.errorContext,
					},
					{ status: "error" },
				),
			];
	}
	// Runtime safety net: never reached when the AgentRuntimeStreamEvent union
	// is exhaustively covered above (`event` is narrowed to `never`). Loose
	// runtime adapters (e.g. plugin runtimes) may still emit event kinds we
	// don't yet know at compile time. Surface them as a transient debug event
	// rather than throwing or returning undefined so the broker and renderer
	// can degrade gracefully.
	return [buildUnknownProductEvent(event as unknown, context)];
}

/**
 * Emit a transient `unknown` product event for a runtime stream shape we
 * couldn't classify. Never persisted; safe to ignore in materializer/reducers.
 * Exported for tests and for runtimes that want to hand-craft such events.
 */
export function buildUnknownProductEvent(
	rawEvent: unknown,
	context: AgentProductEventProjectionContext = {},
): AgentProductEvent {
	const source = (rawEvent ?? {}) as Record<string, unknown>;
	const runtimeType =
		typeof source.type === "string"
			? source.type
			: String(source.type ?? "unknown");
	const summary = summarizeUnknownRuntimeEvent(source);
	const seq = typeof source.seq === "number" ? source.seq : 0;
	const requestId =
		typeof source.requestId === "string" ? source.requestId : undefined;
	const eventId = `${requestId ?? "unknown"}:${seq}:unknown:${runtimeType}`;
	const sessionId =
		typeof source.conversationId === "string" ? source.conversationId : "";
	const runtime = source.runtime as
		| AgentRuntimeId
		| CustomAgentRuntimeId
		| undefined;
	const timestamp =
		typeof source.timestamp === "number" ? source.timestamp : Date.now();
	return {
		v: 1,
		type: "unknown",
		eventId,
		sourceEventId: requestId ? `${requestId}:${seq}:${runtimeType}` : eventId,
		sessionId,
		projectId: context.projectId,
		runId: requestId,
		turnId: context.turnId,
		requestId,
		runtime,
		runtimeSeq: seq,
		ts: timestamp,
		status: "streaming",
		source: "runtime",
		persist: false,
		transient: true,
		payload: {
			runtimeType,
			summary,
		},
	};
}

function summarizeUnknownRuntimeEvent(event: unknown): string {
	if (!event || typeof event !== "object") return String(event);
	try {
		const record = event as Record<string, unknown>;
		const keys = Object.keys(record).filter((k) => k !== "raw");
		const parts: string[] = [];
		for (const key of keys.slice(0, 8)) {
			const value = record[key];
			if (typeof value === "string") {
				parts.push(`${key}=${value.slice(0, 80)}`);
			} else if (typeof value === "number" || typeof value === "boolean") {
				parts.push(`${key}=${value}`);
			} else if (value == null) {
				parts.push(`${key}=null`);
			} else {
				parts.push(`${key}=[${typeof value}]`);
			}
		}
		return parts.join(" ");
	} catch {
		return "<unserializable>";
	}
}

/**
 * Multi-Agent Round 6：子代理生产事件的构造上下文。
 *
 * 与 `PlanProductEventContext` 平行，但 eventId 由 `subagentRunId + phase`
 * 决定，天然去重（同一 subagent + 同一 phase 重复投递保持稳定 id）。
 */
export interface SubagentProductEventContext {
	sessionId: string;
	projectId?: string | null;
	runId?: string;
	turnId?: string;
	requestId?: string;
	runtime?: AgentRuntimeId | CustomAgentRuntimeId;
	runtimeSeq?: number;
	ts?: number;
	/** 父 Agent 的 requestId / runId；填入后会同时写入 base + payload/run.parentRunId */
	parentRunId?: string;
	/** eventId 前缀；默认使用 `subagent`。 */
	eventIdPrefix?: string;
}

function buildSubagentEventId(
	context: SubagentProductEventContext,
	phase: "spawned" | "updated" | "completed" | "failed",
	subagentRunId: string,
	discriminator?: string,
): string {
	const prefix = context.eventIdPrefix ?? "subagent";
	const parts = [prefix, phase, subagentRunId];
	if (discriminator) parts.push(discriminator);
	return parts.join(":");
}

function subagentEventBase<
	TType extends AgentProductEventType,
	TPayload extends Record<string, unknown>,
>(
	type: TType,
	eventId: string,
	subagentRunId: string,
	context: SubagentProductEventContext,
	payload: TPayload,
	status: AgentProductEventStatus,
): AgentProductEventBase<TType, TPayload> {
	return {
		v: 1,
		type,
		eventId,
		sourceEventId: eventId,
		sessionId: context.sessionId,
		projectId: context.projectId,
		runId: context.runId,
		turnId: context.turnId,
		requestId: context.requestId,
		runtime: context.runtime,
		runtimeSeq: context.runtimeSeq,
		ts: context.ts ?? Date.now(),
		status,
		source: "product",
		persist: true,
		...(context.parentRunId ? { parentRunId: context.parentRunId } : {}),
		subagentRunId,
		payload,
	};
}

export function createSubagentSpawnedProductEvent(
	run: SubagentRunSummary,
	context: SubagentProductEventContext,
): AgentProductEvent {
	const eventId = buildSubagentEventId(context, "spawned", run.subagentRunId);
	return subagentEventBase(
		"subagent.spawned",
		eventId,
		run.subagentRunId,
		{ ...context, parentRunId: context.parentRunId ?? run.parentRunId },
		{ run },
		"streaming",
	);
}

export function createSubagentUpdatedProductEvent(
	subagentRunId: string,
	patch: Partial<SubagentRunSummary>,
	context: SubagentProductEventContext,
): AgentProductEvent {
	// updated 可能一 run 内多次投递；用 runtimeSeq / ts 参与 discriminator，
	// 避免多次 update 产出同一个 eventId 被 dedupe 掉。
	const discriminator = String(
		context.runtimeSeq ?? context.ts ?? Date.now(),
	);
	const eventId = buildSubagentEventId(
		context,
		"updated",
		subagentRunId,
		discriminator,
	);
	return subagentEventBase(
		"subagent.updated",
		eventId,
		subagentRunId,
		context,
		{ subagentRunId, patch },
		"streaming",
	);
}

export function createSubagentCompletedProductEvent(
	subagentRunId: string,
	details: {
		endedAt: number;
		summary?: string;
		tokenUsage?: { input?: number; output?: number };
		toolCallCount?: number;
		resultRef?: string;
	},
	context: SubagentProductEventContext,
): AgentProductEvent {
	const eventId = buildSubagentEventId(context, "completed", subagentRunId);
	return subagentEventBase(
		"subagent.completed",
		eventId,
		subagentRunId,
		context,
		{ subagentRunId, ...details },
		"completed",
	);
}

export function createSubagentFailedProductEvent(
	subagentRunId: string,
	details: { errorMessage: string; endedAt: number },
	context: SubagentProductEventContext,
): AgentProductEvent {
	const eventId = buildSubagentEventId(context, "failed", subagentRunId);
	return subagentEventBase(
		"subagent.failed",
		eventId,
		subagentRunId,
		context,
		{ subagentRunId, ...details },
		"error",
	);
}

export function shouldPersistAgentProductEvent(
	event: AgentProductEvent,
): boolean {
	return event.persist && !event.transient;
}

export function buildRuntimeEventId(event: AgentRuntimeStreamEvent): string {
	return `${event.requestId}:${event.seq}:${event.type}`;
}

export function buildProductEventId(
	event: AgentRuntimeStreamEvent,
	type: AgentProductEventType,
): string {
	return `${event.requestId}:${event.seq}:${type}`;
}

function buildPlanProductEventId(
	context: PlanProductEventContext,
	type: AgentProductEventType,
	parts: string[],
): string {
	const prefix = context.eventIdPrefix ?? context.requestId ?? context.sessionId;
	return [prefix, type, ...parts].filter(Boolean).join(":");
}

function buildContextProductEventId(
	context: ContextCompactedProductEventContext,
	input: ContextCompactedProductEventInput,
): string {
	const prefix = context.eventIdPrefix ?? context.requestId ?? context.sessionId;
	return [
		prefix,
		"context.compacted",
		input.summaryMessageId,
		String(input.compactedAt),
		String(input.originalCount),
	]
		.filter(Boolean)
		.join(":");
}

function bareToolName(name: string): string {
	const lower = name.toLowerCase();
	if (lower.includes("__")) return lower.split("__").pop() ?? lower;
	if (lower.includes(":")) return lower.split(":").pop() ?? lower;
	return lower;
}

function isAskUserQuestionToolName(toolName: string): boolean {
	const bare = bareToolName(toolName);
	return bare === "askuserquestion" || bare === "ask_user_question";
}

function isAskUserQuestionPayload(
	payload: PermissionDecision["payload"],
): payload is Record<string, unknown> {
	return Boolean(
		payload &&
			typeof payload === "object" &&
			("answers" in payload ||
				"user_answers" in payload ||
				"questions" in payload),
	);
}
