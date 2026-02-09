/**
 * Agent 服务（渲染进程）
 * 封装与主进程的 Agent 通信
 */

import type {
	AgentConfig,
	AgentMessage,
	AgentSession,
	AgentStreamEvent,
} from "../../types/electron";

export class AgentClient {
	/**
	 * 创建新的 agent 会话
	 */
	async createSession(config: AgentConfig): Promise<AgentSession> {
		const response = await window.electron.agent.createSession(config);
		if (!response.success || !response.data) {
			throw new Error(response.error || "Failed to create session");
		}
		return response.data;
	}

	/**
	 * 发送消息到 agent
	 */
	async sendMessage(sessionId: string, content: string): Promise<void> {
		const response = await window.electron.agent.sendMessage(
			sessionId,
			content,
		);
		if (!response.success) {
			throw new Error(response.error || "Failed to send message");
		}
	}

	/**
	 * 获取会话状态
	 */
	async getStatus(sessionId: string): Promise<AgentSession> {
		const response = await window.electron.agent.getStatus(sessionId);
		if (!response.success || !response.data) {
			throw new Error(response.error || "Failed to get status");
		}
		return response.data;
	}

	/**
	 * 停止 agent
	 */
	async stopAgent(sessionId: string): Promise<void> {
		const response = await window.electron.agent.stopAgent(sessionId);
		if (!response.success) {
			throw new Error(response.error || "Failed to stop agent");
		}
	}

	/**
	 * 列出所有会话
	 */
	async listAgents(): Promise<AgentSession[]> {
		const response = await window.electron.agent.listAgents();
		if (!response.success || !response.data) {
			throw new Error(response.error || "Failed to list agents");
		}
		return response.data;
	}

	/**
	 * 获取会话消息
	 */
	async getMessages(sessionId: string): Promise<AgentMessage[]> {
		const response = await window.electron.agent.getMessages(sessionId);
		if (!response.success || !response.data) {
			throw new Error(response.error || "Failed to get messages");
		}
		return response.data;
	}

	/**
	 * 清除会话消息
	 */
	async clearMessages(sessionId: string): Promise<void> {
		const response = await window.electron.agent.clearMessages(sessionId);
		if (!response.success) {
			throw new Error(response.error || "Failed to clear messages");
		}
	}

	/**
	 * 删除会话
	 */
	async deleteSession(sessionId: string): Promise<void> {
		const response = await window.electron.agent.deleteSession(sessionId);
		if (!response.success) {
			throw new Error(response.error || "Failed to delete session");
		}
	}

	/**
	 * 订阅流式事件
	 */
	onStreamEvent(callback: (event: AgentStreamEvent) => void): () => void {
		return window.electron.agent.onStreamEvent(callback);
	}
}

// 单例实例
export const agentClient = new AgentClient();
