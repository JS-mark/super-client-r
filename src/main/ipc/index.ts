/**
 * IPC 模块入口
 * 统一注册所有 IPC 处理器
 */

import { setupAgentHandlers } from "../services/agent";
import { registerAgentHandlers } from "./handlers/agentHandlers";
import { registerApiHandlers } from "./handlers/apiHandlers";
import { registerAppHandlers } from "./handlers/appHandlers";
import { registerMcpHandlers } from "./handlers/mcpHandlers";
import { registerSkillHandlers } from "./handlers/skillHandlers";

/**
 * 注册所有 IPC 处理器
 */
export function registerIpcHandlers(): void {
	registerAgentHandlers();
	registerSkillHandlers();
	registerMcpHandlers();
	registerAppHandlers();
	registerApiHandlers();
	setupAgentHandlers();
}

export * from "./channels";
export * from "./types";
