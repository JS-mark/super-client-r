/**
 * IPC 模块入口
 * 统一注册所有 IPC 处理器
 */

// ─── Typed IPC Proxy 自动注册 ───
import { registerProxyHandlers } from "./api-impl";

// ─── 手动注册：需要 event.sender 的 streaming handlers ───
import { registerStreamingHandlers } from "./handlers/streamingHandlers";
import { registerModelHandlers } from "./handlers/modelHandlers";

/**
 * 注册所有 IPC 处理器
 */
export function registerIpcHandlers(): void {
	// Proxy handlers: ~25 namespaces, ~160+ methods
	registerProxyHandlers();

	// Streaming handlers: agent sendMessage, agentSDK createQuery
	registerStreamingHandlers();

	// LLM streaming handlers: chatCompletion, toolApprovalResponse, stopStream
	registerModelHandlers();
}

export * from "./channels";
export * from "./types";
