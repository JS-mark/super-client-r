/**
 * IPC 模块入口
 * 统一注册所有 IPC 处理器
 */

// ─── Typed IPC Proxy 自动注册 ───
import { registerProxyHandlers } from "./api-impl";

// ─── 手动注册：需要 event.sender 的 streaming handlers ───
import { registerStreamingHandlers } from "./handlers/streamingHandlers";
import { registerModelHandlers } from "./handlers/modelHandlers";
import { registerPtyHandlers } from "./handlers/ptyHandlers";
import { registerAgentRuntimeHandlers } from "./handlers/agentRuntimeHandlers";
import { registerAgentTraceHandlers } from "./handlers/agentTraceHandlers";

/**
 * 注册所有 IPC 处理器
 */
export function registerIpcHandlers(): void {
	// Proxy handlers: ~25 namespaces, ~160+ methods
	registerProxyHandlers();

	// Streaming handlers: agent sendMessage, agentSDK createQuery (legacy)
	registerStreamingHandlers();

	// LLM streaming handlers: chatCompletion, toolApprovalResponse, stopStream
	registerModelHandlers();

	// PTY handlers: 终端流式输入输出
	registerPtyHandlers();

	// AgentRuntime 适配层（spec: 2026-06-21-agent-runtime-adapter-design）
	registerAgentRuntimeHandlers();

	// AgentTrace 调试通道
	registerAgentTraceHandlers();
}

export * from "./channels";
export * from "./types";
