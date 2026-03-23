/**
 * Agent SDK Service Client
 *
 * Renderer 侧 Agent SDK 客户端，通过 preload 安全桥接调用 Main Process
 */

import type {
	AgentSDKConfig,
	AgentSDKQueryRequest,
	AgentSDKSessionInfo,
	AgentSDKSessionMessage,
	AgentSDKStreamEvent,
	AgentProfile,
	AgentTeam,
} from "@super-client/shared-types/agent-sdk";

/**
 * 创建查询（启动 agent）
 */
export async function createQuery(
	requestId: string,
	request: AgentSDKQueryRequest,
): Promise<{ requestId: string }> {
	const response = await window.electron.agentSDK.createQuery(
		requestId,
		request,
	);
	if (!response.success) {
		throw new Error(response.error || "Failed to create query");
	}
	return response.data;
}

/**
 * 中断查询
 */
export async function interruptQuery(requestId: string): Promise<boolean> {
	const response = await window.electron.agentSDK.interrupt(requestId);
	if (!response.success) {
		throw new Error(response.error || "Failed to interrupt query");
	}
	return response.data;
}

/**
 * 关闭查询
 */
export async function closeQuery(requestId: string): Promise<boolean> {
	const response = await window.electron.agentSDK.close(requestId);
	if (!response.success) {
		throw new Error(response.error || "Failed to close query");
	}
	return response.data;
}

/**
 * 列出 Agent SDK sessions
 */
export async function listSDKSessions(
	dir?: string,
): Promise<AgentSDKSessionInfo[]> {
	const response = await window.electron.agentSDK.listSessions(dir);
	if (!response.success) {
		throw new Error(response.error || "Failed to list sessions");
	}
	return response.data;
}

/**
 * 获取 session 详情
 */
export async function getSDKSessionInfo(
	sessionId: string,
): Promise<AgentSDKSessionInfo | null> {
	const response = await window.electron.agentSDK.getSessionInfo(sessionId);
	if (!response.success) {
		throw new Error(response.error || "Failed to get session info");
	}
	return response.data;
}

/**
 * 切换模型
 */
export async function setModel(
	requestId: string,
	model: string,
): Promise<boolean> {
	const response = await window.electron.agentSDK.setModel(requestId, model);
	if (!response.success) {
		throw new Error(response.error || "Failed to set model");
	}
	return response.data;
}

/**
 * 解决权限请求
 */
export async function resolvePermission(
	toolUseId: string,
	allowed: boolean,
): Promise<boolean> {
	const response = await window.electron.agentSDK.resolvePermission(
		toolUseId,
		allowed,
	);
	if (!response.success) {
		throw new Error(response.error || "Failed to resolve permission");
	}
	return response.data;
}

/**
 * 订阅流式事件
 * @returns 取消订阅函数
 */
export function onStreamEvent(
	callback: (event: AgentSDKStreamEvent) => void,
): () => void {
	return window.electron.agentSDK.onStreamEvent(callback);
}

/**
 * Fork 一个已有 session
 */
export async function forkSession(
	sessionId: string,
	dir?: string,
): Promise<{ sessionId: string } | null> {
	const response = await window.electron.agentSDK.forkSession(sessionId, dir);
	if (!response.success) {
		throw new Error(response.error || "Failed to fork session");
	}
	return response.data;
}

/**
 * 重命名 session
 */
export async function renameSession(
	sessionId: string,
	title: string,
	dir?: string,
): Promise<boolean> {
	const response = await window.electron.agentSDK.renameSession(
		sessionId,
		title,
		dir,
	);
	if (!response.success) {
		throw new Error(response.error || "Failed to rename session");
	}
	return response.data;
}

/**
 * 给 session 打标签
 */
export async function tagSession(
	sessionId: string,
	tag: string,
	dir?: string,
): Promise<boolean> {
	const response = await window.electron.agentSDK.tagSession(
		sessionId,
		tag,
		dir,
	);
	if (!response.success) {
		throw new Error(response.error || "Failed to tag session");
	}
	return response.data;
}

/**
 * 获取 session 消息列表
 */
export async function getSessionMessages(
	sessionId: string,
	dir?: string,
): Promise<AgentSDKSessionMessage[]> {
	const response = await window.electron.agentSDK.getSessionMessages(
		sessionId,
		dir,
	);
	if (!response.success) {
		throw new Error(response.error || "Failed to get session messages");
	}
	return response.data;
}

/**
 * 获取 Agent SDK 配置
 */
export async function getAgentSDKConfig(): Promise<AgentSDKConfig> {
	const response = await window.electron.agentSDK.getConfig();
	if (!response.success) {
		throw new Error(response.error || "Failed to get agent SDK config");
	}
	return response.data;
}

/**
 * 保存 Agent SDK 配置
 */
export async function setAgentSDKConfig(
	config: AgentSDKConfig,
): Promise<boolean> {
	const response = await window.electron.agentSDK.setConfig(config);
	if (!response.success) {
		throw new Error(response.error || "Failed to set agent SDK config");
	}
	return response.data;
}

/**
 * 获取 Agent Profiles
 */
export async function getAgentProfiles(): Promise<AgentProfile[]> {
	const response = await window.electron.agentSDK.getProfiles();
	if (!response.success) {
		throw new Error(response.error || "Failed to get agent profiles");
	}
	return response.data;
}

/**
 * 保存 Agent Profiles
 */
export async function setAgentProfiles(
	profiles: AgentProfile[],
): Promise<boolean> {
	const response = await window.electron.agentSDK.setProfiles(profiles);
	if (!response.success) {
		throw new Error(response.error || "Failed to set agent profiles");
	}
	return response.data;
}

/**
 * 获取 Agent Teams
 */
export async function getAgentTeams(): Promise<AgentTeam[]> {
	const response = await window.electron.agentSDK.getTeams();
	if (!response.success) {
		throw new Error(response.error || "Failed to get agent teams");
	}
	return response.data;
}

/**
 * 保存 Agent Teams
 */
export async function setAgentTeams(teams: AgentTeam[]): Promise<boolean> {
	const response = await window.electron.agentSDK.setTeams(teams);
	if (!response.success) {
		throw new Error(response.error || "Failed to set agent teams");
	}
	return response.data;
}

/** 命名空间导出 */
export const agentSDKClient = {
	createQuery,
	interruptQuery,
	closeQuery,
	listSDKSessions,
	getSDKSessionInfo,
	setModel,
	resolvePermission,
	onStreamEvent,
	forkSession,
	renameSession,
	tagSession,
	getSessionMessages,
	getAgentSDKConfig,
	setAgentSDKConfig,
	getAgentProfiles,
	setAgentProfiles,
	getAgentTeams,
	setAgentTeams,
};
