/**
 * IPC 模块入口
 * 统一注册所有 IPC 处理器
 */

import { registerAgentHandlers } from "./handlers/agentHandlers";
import { registerAgentSDKHandlers } from "./handlers/agentSDKHandlers";
import { registerApiHandlers } from "./handlers/apiHandlers";
import { registerAppHandlers } from "./handlers/appHandlers";
import { registerAuthHandlers } from "./handlers/authHandlers";
import { registerChatHandlers } from "./handlers/chatHandlers";
import { registerFileHandlers } from "./handlers/fileHandlers";
import { registerLogHandlers } from "./handlers/logHandlers";
import { registerModelHandlers } from "./handlers/modelHandlers";
import { registerFloatWidgetHandlers } from "./handlers/floatWidgetHandlers";
import { registerMcpHandlers } from "./handlers/mcpHandlers";
import { registerPluginHandlers } from "./handlers/pluginHandlers";
import { registerSearchHandlers } from "./handlers/searchHandlers";
import { registerSkillHandlers } from "./handlers/skillHandlers";
import { registerWebhookHandlers } from "./handlers/webhookHandlers";
import { registerWindowControlHandlers } from "./handlers/windowHandlers";
import { registerIMBotHandlers } from "./handlers/imbotHandlers";
import { registerRemoteDeviceHandlers } from "./handlers/remoteDeviceHandlers";
import { registerRemoteControlHandlers } from "./handlers/remoteControlHandlers";
import { registerRemoteChatHandlers } from "./handlers/remoteChatHandlers";
import { registerNetworkHandlers } from "./handlers/networkHandlers";
import { registerAppConfigHandlers } from "./handlers/appConfigHandler";

/**
 * 注册所有 IPC 处理器
 */
export function registerIpcHandlers(): void {
	registerAgentHandlers();
	registerAgentSDKHandlers();
	registerAuthHandlers();
	registerChatHandlers();
	registerSkillHandlers();
	registerMcpHandlers();
	registerAppHandlers();
	registerApiHandlers();
	registerWindowControlHandlers();
	registerFloatWidgetHandlers();
	registerSearchHandlers();
	registerPluginHandlers();
	registerFileHandlers();
	registerLogHandlers();
	registerModelHandlers();
	registerWebhookHandlers();
	registerIMBotHandlers();
	registerRemoteDeviceHandlers();
	registerRemoteControlHandlers();
	registerRemoteChatHandlers();
	registerNetworkHandlers();
	registerAppConfigHandlers();
}

export * from "./channels";
export * from "./types";
