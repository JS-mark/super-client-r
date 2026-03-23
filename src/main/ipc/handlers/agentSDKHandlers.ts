/**
 * Agent SDK IPC Handlers
 *
 * 基于 @anthropic-ai/claude-agent-sdk 的 IPC 处理器
 */

import { type IpcMainInvokeEvent, ipcMain } from "electron";
import { AGENT_SDK_CHANNELS } from "../channels";
import type {
	AgentSDKQueryRequest,
	AgentSDKStreamEvent,
	AgentSDKConfig,
	AgentProfile,
	AgentTeam,
} from "../types";
import { agentSDKService } from "../../services/agent/AgentSDKService";
import {
	BUILTIN_PROFILES,
	BUILTIN_TEAMS,
	BUILTIN_VERSION,
} from "../../services/agent/builtinTeams";
import { storeManager } from "../../store/StoreManager";

/**
 * 合并内置预设：更新 builtin_* 项，保留用户自建项
 */
function mergeBuiltinPresets(): void {
	const storedVersion = storeManager.getBuiltinAgentVersion();
	if (storedVersion >= BUILTIN_VERSION) return;

	// 合并 Profiles
	const existingProfiles = storeManager.getAgentProfiles();
	const builtinIds = new Set(BUILTIN_PROFILES.map((p) => p.id));
	const userProfiles = existingProfiles.filter((p) => !builtinIds.has(p.id));
	storeManager.setAgentProfiles([...BUILTIN_PROFILES, ...userProfiles]);

	// 合并 Teams
	const existingTeams = storeManager.getAgentTeams();
	const builtinTeamIds = new Set(BUILTIN_TEAMS.map((t) => t.id));
	const userTeams = existingTeams.filter((t) => !builtinTeamIds.has(t.id));
	storeManager.setAgentTeams([...BUILTIN_TEAMS, ...userTeams]);

	storeManager.setBuiltinAgentVersion(BUILTIN_VERSION);
}

/**
 * 注册 Agent SDK IPC 处理器
 */
export function registerAgentSDKHandlers(): void {
	// 启动时合并内置预设
	mergeBuiltinPresets();

	// 创建查询
	ipcMain.handle(
		AGENT_SDK_CHANNELS.CREATE_QUERY,
		async (
			_event: IpcMainInvokeEvent,
			{
				requestId,
				request,
			}: { requestId: string; request: AgentSDKQueryRequest },
		) => {
			try {
				// 监听流式事件并转发到 renderer
				const onStreamEvent = (event: AgentSDKStreamEvent) => {
					if (event.requestId === requestId) {
						_event.sender.send(
							AGENT_SDK_CHANNELS.STREAM_EVENT,
							event,
						);
					}
				};

				agentSDKService.on("stream-event", onStreamEvent);

				// 异步执行查询（不等待完成）
				agentSDKService
					.createQuery(requestId, request)
					.finally(() => {
						agentSDKService.removeListener(
							"stream-event",
							onStreamEvent,
						);
					});

				return { success: true, data: { requestId } };
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: "Failed to create query";
				return { success: false, error: message };
			}
		},
	);

	// 中断查询
	ipcMain.handle(
		AGENT_SDK_CHANNELS.INTERRUPT,
		async (
			_event: IpcMainInvokeEvent,
			{ requestId }: { requestId: string },
		) => {
			try {
				const result =
					await agentSDKService.interruptQuery(requestId);
				return { success: true, data: result };
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: "Failed to interrupt query";
				return { success: false, error: message };
			}
		},
	);

	// 关闭查询
	ipcMain.handle(
		AGENT_SDK_CHANNELS.CLOSE,
		async (
			_event: IpcMainInvokeEvent,
			{ requestId }: { requestId: string },
		) => {
			try {
				const result = agentSDKService.closeQuery(requestId);
				return { success: true, data: result };
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: "Failed to close query";
				return { success: false, error: message };
			}
		},
	);

	// 列出 SDK sessions
	ipcMain.handle(
		AGENT_SDK_CHANNELS.LIST_SESSIONS,
		async (
			_event: IpcMainInvokeEvent,
			{ dir }: { dir?: string } = {},
		) => {
			try {
				const sessions =
					await agentSDKService.listSDKSessions(dir);
				return { success: true, data: sessions };
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: "Failed to list sessions";
				return { success: false, error: message };
			}
		},
	);

	// 获取 session 信息
	ipcMain.handle(
		AGENT_SDK_CHANNELS.GET_SESSION_INFO,
		async (
			_event: IpcMainInvokeEvent,
			{ sessionId }: { sessionId: string },
		) => {
			try {
				const info =
					await agentSDKService.getSDKSessionInfo(sessionId);
				return { success: true, data: info };
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: "Failed to get session info";
				return { success: false, error: message };
			}
		},
	);

	// 切换模型
	ipcMain.handle(
		AGENT_SDK_CHANNELS.SET_MODEL,
		async (
			_event: IpcMainInvokeEvent,
			{ requestId, model }: { requestId: string; model: string },
		) => {
			try {
				const result = await agentSDKService.setModel(
					requestId,
					model,
				);
				return { success: true, data: result };
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: "Failed to set model";
				return { success: false, error: message };
			}
		},
	);

	// 权限审批响应
	ipcMain.handle(
		AGENT_SDK_CHANNELS.PERMISSION_RESPONSE,
		async (
			_event: IpcMainInvokeEvent,
			{
				toolUseId,
				allowed,
			}: { toolUseId: string; allowed: boolean },
		) => {
			try {
				const result = agentSDKService.resolvePermission(
					toolUseId,
					allowed,
				);
				return { success: true, data: result };
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: "Failed to resolve permission";
				return { success: false, error: message };
			}
		},
	);

	// Fork session
	ipcMain.handle(
		AGENT_SDK_CHANNELS.FORK_SESSION,
		async (
			_event: IpcMainInvokeEvent,
			{
				sessionId,
				dir,
			}: { sessionId: string; dir?: string },
		) => {
			try {
				const result = await agentSDKService.forkSDKSession(
					sessionId,
					dir ? { dir } : undefined,
				);
				return { success: true, data: result };
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: "Failed to fork session";
				return { success: false, error: message };
			}
		},
	);

	// Rename session
	ipcMain.handle(
		AGENT_SDK_CHANNELS.RENAME_SESSION,
		async (
			_event: IpcMainInvokeEvent,
			{
				sessionId,
				title,
				dir,
			}: { sessionId: string; title: string; dir?: string },
		) => {
			try {
				const result = await agentSDKService.renameSDKSession(
					sessionId,
					title,
					dir ? { dir } : undefined,
				);
				return { success: true, data: result };
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: "Failed to rename session";
				return { success: false, error: message };
			}
		},
	);

	// Tag session
	ipcMain.handle(
		AGENT_SDK_CHANNELS.TAG_SESSION,
		async (
			_event: IpcMainInvokeEvent,
			{
				sessionId,
				tag,
				dir,
			}: { sessionId: string; tag: string; dir?: string },
		) => {
			try {
				const result = await agentSDKService.tagSDKSession(
					sessionId,
					tag,
					dir ? { dir } : undefined,
				);
				return { success: true, data: result };
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: "Failed to tag session";
				return { success: false, error: message };
			}
		},
	);

	// Get session messages
	ipcMain.handle(
		AGENT_SDK_CHANNELS.GET_SESSION_MESSAGES,
		async (
			_event: IpcMainInvokeEvent,
			{
				sessionId,
				dir,
			}: { sessionId: string; dir?: string },
		) => {
			try {
				const messages =
					await agentSDKService.getSDKSessionMessages(
						sessionId,
						dir ? { dir } : undefined,
					);
				return { success: true, data: messages };
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: "Failed to get session messages";
				return { success: false, error: message };
			}
		},
	);

	// 获取 Agent SDK 配置
	ipcMain.handle(
		AGENT_SDK_CHANNELS.GET_CONFIG,
		async () => {
			try {
				const config = storeManager.getAgentSDKConfig();
				return { success: true, data: config };
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: "Failed to get agent SDK config";
				return { success: false, error: message };
			}
		},
	);

	// 设置 Agent SDK 配置
	ipcMain.handle(
		AGENT_SDK_CHANNELS.SET_CONFIG,
		async (
			_event: IpcMainInvokeEvent,
			{ config }: { config: AgentSDKConfig },
		) => {
			try {
				storeManager.setAgentSDKConfig(config);
				return { success: true, data: true };
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: "Failed to set agent SDK config";
				return { success: false, error: message };
			}
		},
	);

	// 获取 Agent Profiles
	ipcMain.handle(
		AGENT_SDK_CHANNELS.GET_PROFILES,
		async () => {
			try {
				const profiles = storeManager.getAgentProfiles();
				return { success: true, data: profiles };
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: "Failed to get agent profiles";
				return { success: false, error: message };
			}
		},
	);

	// 保存 Agent Profiles
	ipcMain.handle(
		AGENT_SDK_CHANNELS.SET_PROFILES,
		async (
			_event: IpcMainInvokeEvent,
			{ profiles }: { profiles: AgentProfile[] },
		) => {
			try {
				storeManager.setAgentProfiles(profiles);
				return { success: true, data: true };
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: "Failed to set agent profiles";
				return { success: false, error: message };
			}
		},
	);

	// 获取 Agent Teams
	ipcMain.handle(
		AGENT_SDK_CHANNELS.GET_TEAMS,
		async () => {
			try {
				const teams = storeManager.getAgentTeams();
				return { success: true, data: teams };
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: "Failed to get agent teams";
				return { success: false, error: message };
			}
		},
	);

	// 保存 Agent Teams
	ipcMain.handle(
		AGENT_SDK_CHANNELS.SET_TEAMS,
		async (
			_event: IpcMainInvokeEvent,
			{ teams }: { teams: AgentTeam[] },
		) => {
			try {
				storeManager.setAgentTeams(teams);
				return { success: true, data: true };
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: "Failed to set agent teams";
				return { success: false, error: message };
			}
		},
	);

}
