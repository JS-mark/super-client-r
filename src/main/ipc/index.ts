/**
 * IPC 模块入口
 * 统一注册所有 IPC 处理器
 */

// ─── 旧架构：手动注册（逐步迁移到 Typed IPC Proxy） ───
import { registerAgentHandlers } from "./handlers/agentHandlers";
import { registerAgentSDKHandlers } from "./handlers/agentSDKHandlers";
import { registerApiHandlers } from "./handlers/apiHandlers";
import { registerAppHandlers } from "./handlers/appHandlers";
import { registerFileHandlers } from "./handlers/fileHandlers";
import { registerLogHandlers } from "./handlers/logHandlers";
import { registerModelHandlers } from "./handlers/modelHandlers";
import { registerFloatWidgetHandlers } from "./handlers/floatWidgetHandlers";
import { registerMcpHandlers } from "./handlers/mcpHandlers";
import { registerPluginHandlers } from "./handlers/pluginHandlers";
import { registerWindowControlHandlers } from "./handlers/windowHandlers";
import { registerIMBotHandlers } from "./handlers/imbotHandlers";
import { registerRemoteDeviceHandlers } from "./handlers/remoteDeviceHandlers";
import { registerRemoteControlHandlers } from "./handlers/remoteControlHandlers";
import { registerRemoteChatHandlers } from "./handlers/remoteChatHandlers";

// ─── 新架构：Typed IPC Proxy 自动注册 ───
import { registerProxyHandlers } from "./api-impl";

/**
 * 注册所有 IPC 处理器
 */
export function registerIpcHandlers(): void {
	// 旧架构 handlers（待迁移）
	registerAgentHandlers();
	registerAgentSDKHandlers();
	registerMcpHandlers();
	registerAppHandlers();
	registerApiHandlers();
	registerWindowControlHandlers();
	registerFloatWidgetHandlers();
	registerPluginHandlers();
	registerFileHandlers();
	registerLogHandlers();
	registerModelHandlers(); // 仅 LLM streaming，Model CRUD 已迁移
	registerIMBotHandlers();
	registerRemoteDeviceHandlers();
	registerRemoteControlHandlers();
	registerRemoteChatHandlers();

	// 新架构：webhook, auth, appConfig, search, skill, chat, network, model(CRUD)
	registerProxyHandlers();
}

export * from "./channels";
export * from "./types";
