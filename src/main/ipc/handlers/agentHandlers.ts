/**
 * Agent IPC 处理器
 * 处理来自渲染进程的 agent 相关请求
 */

import type { IpcMainInvokeEvent } from "electron";
import { ipcMain } from "electron";
import type { AgentConfig } from "../../services/agent/AgentService";
import { agentService } from "../../services/agent/AgentService";
import { AGENT_CHANNELS } from "../channels";
import type { AgentStreamEvent } from "../types";

/**
 * 注册 Agent IPC 处理器
 */
export function registerAgentHandlers(): void {
	// 创建会话
	ipcMain.handle(
		AGENT_CHANNELS.CREATE_SESSION,
		(_event: IpcMainInvokeEvent, config: AgentConfig) => {
			const session = agentService.createSession(config);
			return { success: true, data: session };
		},
	);

	// 发送消息
	ipcMain.handle(
		AGENT_CHANNELS.SEND_MESSAGE,
		async (_event: IpcMainInvokeEvent, sessionId: string, content: string) => {
			try {
				// 创建一个 Promise 来等待流式事件
				const events: AgentStreamEvent[] = [];

				const eventListener = (event: AgentStreamEvent) => {
					if (event.sessionId === sessionId) {
						events.push(event);
						// 发送事件到渲染进程
						_event.sender.send(AGENT_CHANNELS.STREAM_EVENT, event);
					}
				};

				agentService.on("stream-event", eventListener);

				await agentService.sendMessage(sessionId, content);

				agentService.off("stream-event", eventListener);

				return { success: true, data: { sessionId, events } };
			} catch (error: any) {
				return { success: false, error: error.message };
			}
		},
	);

	// 获取状态
	ipcMain.handle(
		AGENT_CHANNELS.GET_STATUS,
		(_event: IpcMainInvokeEvent, sessionId: string) => {
			const session = agentService.getSession(sessionId);
			if (!session) {
				return { success: false, error: "Session not found" };
			}
			return { success: true, data: session };
		},
	);

	// 停止 agent
	ipcMain.handle(
		AGENT_CHANNELS.STOP_AGENT,
		(_event: IpcMainInvokeEvent, sessionId: string) => {
			agentService.stopAgent(sessionId);
			return { success: true };
		},
	);

	// 列出所有 agents
	ipcMain.handle(AGENT_CHANNELS.LIST_AGENTS, () => {
		const sessions = agentService.listSessions();
		return { success: true, data: sessions };
	});

	// 获取会话消息
	ipcMain.handle(
		"agent:get-messages",
		(_event: IpcMainInvokeEvent, sessionId: string) => {
			const messages = agentService.getMessages(sessionId);
			return { success: true, data: messages };
		},
	);

	// 清除会话消息
	ipcMain.handle(
		"agent:clear-messages",
		(_event: IpcMainInvokeEvent, sessionId: string) => {
			agentService.clearMessages(sessionId);
			return { success: true };
		},
	);

	// 删除会话
	ipcMain.handle(
		"agent:delete-session",
		(_event: IpcMainInvokeEvent, sessionId: string) => {
			agentService.deleteSession(sessionId);
			return { success: true };
		},
	);
}
