/**
 * AgentRuntime Service Client
 *
 * Renderer 侧 AgentRuntime 适配层入口，封装 `window.electron.agentRuntime`。
 * 详见 spec §6 / §7。
 *
 * 与 `agentSDKService.ts` 区别：后者直接调老的 `agent-sdk:*` 通道；本 client
 * 走新的 `agent-runtime:*` 通道，由 `AgentRuntimeIpcBroker` 统一处理多 runtime
 * 路由（claude-sdk / llm-loop / codex / …）。
 *
 * Phase 1 的 useChat 改造尚未启动；本 client 先行落地，便于：
 *   - /debug/agent-traces 页面调试
 *   - 后续 useChat 改造时直接消费
 */

import type {
	AgentQueryRequestPayload,
	AgentRuntimeDescriptor,
	AgentRuntimeId,
	AgentRuntimeStreamEvent,
	CustomAgentRuntimeId,
	NativeSessionInfo,
	PermissionDecision,
} from "@super-client/shared-types/agent-runtime";

function unwrap<T>(r: { success: boolean; data?: T; error?: string }): T {
	if (!r.success) throw new Error(r.error ?? "agent-runtime IPC failed");
	return r.data as T;
}

/**
 * 启动一次查询。事件流通过 `onStreamEvent` 推送；调用方需提前订阅。
 * 返回值仅给出 broker 选定的 runtimeId，便于 UI 标记。
 */
export async function createQuery(
	payload: AgentQueryRequestPayload,
): Promise<{ runtimeId: string }> {
	const r = await window.electron.agentRuntime.createQuery(payload);
	return unwrap(r);
}

/** 用户裁决审批。 */
export async function resolvePermission(
	approvalId: string,
	decision: PermissionDecision,
): Promise<void> {
	const r = await window.electron.agentRuntime.resolvePermission({
		id: approvalId,
		decision,
	});
	unwrap(r);
}

/** 终止某次请求。 */
export async function interrupt(requestId: string): Promise<boolean> {
	const r = await window.electron.agentRuntime.interrupt({ requestId });
	const data = unwrap(r);
	return data.ok;
}

/**
 * 流式事件订阅。返回取消函数。
 *
 * 调用方应自己负责 requestId 过滤（broker 是定向 send，但同一 window 内多
 * 并发请求需要 demux）。
 */
export function onStreamEvent(
	callback: (event: AgentRuntimeStreamEvent) => void,
): () => void {
	return window.electron.agentRuntime.onStreamEvent(callback);
}

/** 列举注册的 runtime descriptors（UI 选择器 / 调试页用）。 */
export async function listRuntimes(): Promise<AgentRuntimeDescriptor[]> {
	const r = await window.electron.agentRuntime.listRuntimes();
	return unwrap(r);
}

/** 列举原生 session（仅 nativeSession=true 的 runtime）。 */
export async function listNativeSessions(
	runtimeId: AgentRuntimeId | CustomAgentRuntimeId,
): Promise<NativeSessionInfo[]> {
	const r = await window.electron.agentRuntime.listNativeSessions({
		runtimeId,
	});
	return unwrap(r);
}

/** Fork 一个原生 session；返回新 sessionId。 */
export async function forkNativeSession(
	runtimeId: AgentRuntimeId | CustomAgentRuntimeId,
	sessionId: string,
	atMessageId?: string,
): Promise<string> {
	const r = await window.electron.agentRuntime.forkNativeSession({
		runtimeId,
		sessionId,
		atMessageId,
	});
	const data = unwrap(r);
	return data.sessionId;
}

export const agentRuntimeClient = {
	createQuery,
	resolvePermission,
	interrupt,
	onStreamEvent,
	listRuntimes,
	listNativeSessions,
	forkNativeSession,
};

export type AgentRuntimeClient = typeof agentRuntimeClient;
