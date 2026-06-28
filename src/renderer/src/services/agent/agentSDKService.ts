/**
 * Agent SDK Service Client
 *
 * Renderer 侧 Agent SDK 客户端。
 *
 * **流式聊天链路（createQuery / interruptQuery / resolvePermission /
 * onStreamEvent）已迁移到本地 HTTP 服务**：
 *   - SSE  `POST /v1/agent/query`
 *   - POST `/v1/agent/interrupt`
 *   - POST `/v1/agent/approval`
 *
 * SSE 帧由 in-renderer dispatcher fan-out 给所有 `onStreamEvent` 订阅者，
 * 旧的 `agent-sdk:stream-event` IPC 订阅不再发起。
 *
 * 其余 settings 类 RPC（sessions / profiles / teams / config 等）仍走 IPC，
 * 因为它们不在热点路径上，迁移收益低。
 *
 * Preload `window.electron.agentSDK.*` 接口完整保留作为回滚兜底。
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
import { httpJson, sseStream } from "../localApiClient";

// ─── In-renderer SSE dispatcher for /v1/agent/query ─────────────────────────

type StreamListener = (event: AgentSDKStreamEvent) => void;

const streamListeners = new Set<StreamListener>();
const activeStreams = new Map<string, AbortController>();

function dispatchStreamEvent(event: AgentSDKStreamEvent): void {
	for (const cb of streamListeners) {
		try {
			cb(event);
		} catch (err) {
			console.error("[agentSDKService] stream listener threw:", err);
		}
	}
}

function errorMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

/**
 * 创建查询（启动 agent）。
 *
 * 走本地 HTTP SSE：`POST /v1/agent/query`。`fire-and-forget` 语义，立即
 * 返回 `{requestId}`；事件通过 in-renderer dispatcher 推送给
 * `onStreamEvent` 订阅者。任何流式错误都会被合成为 `type:"error"` 事件，
 * 不会以异常的形式抛回调用方（与原 IPC 行为一致）。
 */
export async function createQuery(
	requestId: string,
	request: AgentSDKQueryRequest,
): Promise<{ requestId: string }> {
	// 重入保护：若同 requestId 已有在飞流，先 abort。
	const prior = activeStreams.get(requestId);
	if (prior) {
		try {
			prior.abort();
		} catch {
			// ignore
		}
	}

	const controller = new AbortController();
	activeStreams.set(requestId, controller);

	void (async () => {
		try {
			for await (const event of sseStream<AgentSDKStreamEvent>(
				"/v1/agent/query",
				{ requestId, request },
				controller.signal,
			)) {
				dispatchStreamEvent(event);
			}
		} catch (err) {
			if (controller.signal.aborted) return;
			dispatchStreamEvent({
				requestId,
				type: "error",
				error: errorMessage(err),
			} as AgentSDKStreamEvent);
		} finally {
			// 只在自己仍是当前活跃 controller 时才删；并发重入已替换它的话不动。
			if (activeStreams.get(requestId) === controller) {
				activeStreams.delete(requestId);
			}
		}
	})();

	return { requestId };
}

/**
 * 中断查询。
 *
 * 双保险：(1) 本地 abort 当前 SSE fetch（让 server 端 `ctx.req.on("close")`
 * 触发 `runtime.interrupt`），(2) 显式 POST `/v1/agent/interrupt` 兜底。
 */
export async function interruptQuery(requestId: string): Promise<boolean> {
	const controller = activeStreams.get(requestId);
	if (controller) {
		try {
			controller.abort();
		} catch (err) {
			console.error("[agentSDKService] abort threw:", err);
		}
		activeStreams.delete(requestId);
	}

	try {
		const data = await httpJson<{ interrupted: boolean }>(
			"/v1/agent/interrupt",
			{
				method: "POST",
				body: { requestId },
			},
		);
		return data?.interrupted ?? !!controller;
	} catch (err) {
		console.error("[agentSDKService] interrupt HTTP failed:", err);
		return !!controller; // local abort already happened
	}
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
 * 解决权限请求。
 *
 * 走本地 HTTP：`POST /v1/agent/approval`。`updatedInput` 透传到主进程，
 * 一路传到 `LLMService.resolveToolApproval` 的 `payload` 形参；这是
 * `AskUserQuestion` 这种需要回传结构化结果（`{questions, answers}`）的
 * 工具拿到用户答案的唯一通道。`updatedPermissions` 主进程目前还没消费，
 * 保留签名以便未来扩展。
 */
export async function resolvePermission(
	toolUseId: string,
	allowed: boolean,
	updatedInput?: Record<string, unknown>,
	_updatedPermissions?: Array<Record<string, unknown>>,
): Promise<boolean> {
	try {
		await httpJson("/v1/agent/approval", {
			method: "POST",
			body: { toolUseId, approved: allowed, payload: updatedInput },
		});
		return true;
	} catch (err) {
		console.error("[agentSDKService] approval HTTP failed:", err);
		throw err instanceof Error ? err : new Error(String(err));
	}
}

/**
 * 订阅流式事件。
 *
 * 订阅源是 in-renderer dispatcher（由 `createQuery` 的 SSE 消费循环喂事件），
 * 不再监听 `agent-sdk:stream-event` IPC 推送。
 *
 * @returns 取消订阅函数
 */
export function onStreamEvent(
	callback: (event: AgentSDKStreamEvent) => void,
): () => void {
	streamListeners.add(callback);
	return () => {
		streamListeners.delete(callback);
	};
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
