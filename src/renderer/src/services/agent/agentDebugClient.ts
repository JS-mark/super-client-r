/**
 * AgentDebug Service Client（trace 调试通道）
 *
 * Renderer 侧 `window.electron.agentDebug` 封装。详见 spec §17.4。
 * 主要消费者：`/debug/agent-traces` 页面。
 */

import type {
	AgentTraceConfig,
	AgentTraceEntry,
	AgentTraceFilter,
	AgentTraceSummary,
} from "@super-client/shared-types/agent-trace";

function unwrap<T>(r: { success: boolean; data?: T; error?: string }): T {
	if (!r.success) throw new Error(r.error ?? "agent-debug IPC failed");
	return r.data as T;
}

export async function listTraces(
	filter?: AgentTraceFilter,
): Promise<AgentTraceSummary[]> {
	const r = await window.electron.agentDebug.listTraces(filter);
	return unwrap(r);
}

export async function getTrace(
	requestId: string,
): Promise<AgentTraceEntry | null> {
	const r = await window.electron.agentDebug.getTrace(requestId);
	return unwrap(r);
}

export async function clearTraces(): Promise<void> {
	const r = await window.electron.agentDebug.clearTraces();
	unwrap(r);
}

export async function exportTrace(requestId: string): Promise<string> {
	const r = await window.electron.agentDebug.exportTrace(requestId);
	const data = unwrap(r);
	return data.path;
}

export async function getConfig(): Promise<AgentTraceConfig> {
	const r = await window.electron.agentDebug.getConfig();
	return unwrap(r);
}

export async function setConfig(
	patch: Partial<AgentTraceConfig>,
): Promise<AgentTraceConfig> {
	const r = await window.electron.agentDebug.setConfig(patch);
	return unwrap(r);
}

/** 实时订阅；返回取消函数。 */
export function onTraceUpdated(
	callback: (summary: AgentTraceSummary) => void,
): () => void {
	return window.electron.agentDebug.onTraceUpdated(callback);
}

export const agentDebugClient = {
	listTraces,
	getTrace,
	clearTraces,
	exportTrace,
	getConfig,
	setConfig,
	onTraceUpdated,
};

export type AgentDebugClient = typeof agentDebugClient;
