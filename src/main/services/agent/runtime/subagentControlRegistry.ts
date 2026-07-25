/**
 * subagentControlRegistry — 进程内的「运行中 subagent → 取消句柄」注册表。
 *
 * subagent 最小版（SUP-16）的「停止」能力落点：`Task` 内置工具经本地 HTTP
 * 递归拉起一次子 agent 流（见 `agentBuiltinsServer.ts` 的 `taskHandler`），
 * 从外部看没有独立 OS 进程，只有一条挂在 `LLMService` 上的 AbortController
 * 流。要「停止且无残留」，就需要一个由 `subagentRunId` 索引的取消句柄，
 * 让 IPC handler 能定向 abort 对应的那条子流。
 *
 * 与 `subagentBridgeRegistry`（生命周期事件发射）平行但职责不同：
 *   - bridge   负责 spawned/updated/completed/failed/cancelled 事件外发。
 *   - control  负责持有「怎么把这个 run 停掉」的回调。
 *
 * 注册表刻意保持极简：`taskHandler` 在 spawn 后 `register`，在流结束
 * （无论成功 / 失败 / 被取消）后 `unregister`；IPC 层 `cancel` 时查表并
 * 调用回调。回调本身要求幂等 —— 重复 cancel、cancel 已结束的 run 都是 no-op。
 */

/**
 * 单个运行中 subagent 的取消契约。`cancel()` 必须：
 *   - abort 在途的子流（触发底层 `LLMService.stopStream`，释放工具审批 /
 *     子进程，保证无残留）。
 *   - 幂等：多次调用只生效一次。
 */
export interface SubagentControlHandle {
	subagentRunId: string;
	/** 归属会话，便于按会话批量取消（如会话销毁时兜底清理）。 */
	sessionId?: string;
	cancel: () => void;
}

const handles = new Map<string, SubagentControlHandle>();

/** 注册一个运行中 subagent 的取消句柄。相同 id 覆盖旧句柄。 */
export function registerSubagentControl(handle: SubagentControlHandle): void {
	handles.set(handle.subagentRunId, handle);
}

/** 注销（流结束后调用）。不存在时静默返回。 */
export function unregisterSubagentControl(subagentRunId: string): void {
	handles.delete(subagentRunId);
}

/**
 * 取消一个运行中的 subagent。返回是否命中了一个已注册的运行。
 * 命中后调用其 `cancel()` 并注销，避免 cancel 与自然结束竞态时重复触发。
 */
export function cancelSubagentControl(subagentRunId: string): boolean {
	const handle = handles.get(subagentRunId);
	if (!handle) return false;
	handles.delete(subagentRunId);
	try {
		handle.cancel();
	} catch {
		// cancel 回调幂等且不应抛错；即便抛了也不能阻断注销。
	}
	return true;
}

/** 诊断 / 测试用：某个 run 是否仍被跟踪。 */
export function hasSubagentControl(subagentRunId: string): boolean {
	return handles.has(subagentRunId);
}

/** 测试用：清空注册表。 */
export function _resetSubagentControlRegistryForTest(): void {
	handles.clear();
}
