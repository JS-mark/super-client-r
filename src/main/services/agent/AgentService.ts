/**
 * Agent 服务
 * 封装 @anthropic-ai/claude-agent-sdk 的功能
 */

import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam, Tool } from "@anthropic-ai/sdk/resources/messages";
import { EventEmitter } from "events";
import type {
	AgentMessage,
	AgentSession,
	AgentStreamEvent,
} from "../../ipc/types";

export interface AgentConfig {
	apiKey: string;
	model: string;
	maxTokens?: number;
	systemPrompt?: string;
	tools?: Tool[];
}

export class AgentService extends EventEmitter {
	private sessions: Map<string, AgentSession> = new Map();
	private sessionMessages: Map<string, AgentMessage[]> = new Map();
	private activeSessions: Set<string> = new Set();

	/**
	 * 创建新的 agent 会话
	 */
	createSession(config: AgentConfig): AgentSession {
		const sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

		const session: AgentSession = {
			id: sessionId,
			name: `Session ${this.sessions.size + 1}`,
			model: config.model,
			createdAt: Date.now(),
			status: "idle",
		};

		this.sessions.set(sessionId, session);
		this.sessionMessages.set(sessionId, []);

		// 存储配置
		(session as any).config = config;

		return session;
	}

	/**
	 * 获取会话
	 */
	getSession(sessionId: string): AgentSession | undefined {
		return this.sessions.get(sessionId);
	}

	/**
	 * 获取所有会话
	 */
	listSessions(): AgentSession[] {
		return Array.from(this.sessions.values());
	}

	/**
	 * 发送消息到 agent
	 */
	async sendMessage(
		sessionId: string,
		content: string,
		onEvent?: (event: AgentStreamEvent) => void,
	): Promise<void> {
		const session = this.sessions.get(sessionId);
		if (!session) {
			throw new Error(`Session ${sessionId} not found`);
		}

		const config = (session as any).config as AgentConfig;
		if (!config) {
			throw new Error(`Session ${sessionId} has no config`);
		}

		// 添加用户消息
		const userMessage: AgentMessage = {
			id: `msg_${Date.now()}`,
			sessionId,
			role: "user",
			content,
			timestamp: Date.now(),
		};
		this.addMessage(sessionId, userMessage);

		// 更新状态
		session.status = "running";
		this.activeSessions.add(sessionId);

		try {
			// 获取历史消息
			const messages = this.sessionMessages.get(sessionId) || [];
			const history: MessageParam[] = messages
				.filter((m) => m.role !== "system")
				.map((m) => ({
					role: m.role as MessageParam["role"],
					content: m.content,
				}));

			// 这里应该调用 Claude Agent SDK
			// 由于 SDK 需要实际的 API 调用，这里提供模拟实现
			await this.simulateAgentResponse(sessionId, history, config, onEvent);

			session.status = "idle";
		} catch (error) {
			session.status = "error";
			this.emit("error", { sessionId, error });
			throw error;
		} finally {
			this.activeSessions.delete(sessionId);
		}
	}

	/**
	 * 停止 agent
	 */
	stopAgent(sessionId: string): void {
		const session = this.sessions.get(sessionId);
		if (session) {
			session.status = "stopped";
			this.activeSessions.delete(sessionId);
			this.emit("stopped", { sessionId });
		}
	}

	/**
	 * 获取会话消息
	 */
	getMessages(sessionId: string): AgentMessage[] {
		return this.sessionMessages.get(sessionId) || [];
	}

	/**
	 * 清除会话消息
	 */
	clearMessages(sessionId: string): void {
		this.sessionMessages.set(sessionId, []);
	}

	/**
	 * 删除会话
	 */
	deleteSession(sessionId: string): void {
		this.sessions.delete(sessionId);
		this.sessionMessages.delete(sessionId);
		this.activeSessions.delete(sessionId);
	}

	/**
	 * 添加消息到会话
	 */
	private addMessage(sessionId: string, message: AgentMessage): void {
		const messages = this.sessionMessages.get(sessionId) || [];
		messages.push(message);
		this.sessionMessages.set(sessionId, messages);
	}

	/**
	 * 使用 Claude API 进行实际的 agent 响应
	 */
	private async simulateAgentResponse(
		sessionId: string,
		messages: MessageParam[],
		config: AgentConfig,
		onEvent?: (event: AgentStreamEvent) => void,
	): Promise<void> {
		const emitEvent = (event: AgentStreamEvent) => {
			this.emit("stream-event", event);
			onEvent?.(event);
		};

		const assistantMessage: AgentMessage = {
			id: `msg_${Date.now()}`,
			sessionId,
			role: "assistant",
			content: "",
			timestamp: Date.now(),
		};

		try {
			const anthropic = new Anthropic({
				apiKey: config.apiKey,
				dangerouslyAllowBrowser: false,
			});

			const stream = await anthropic.messages.create({
				model: config.model,
				max_tokens: config.maxTokens || 4096,
				system: config.systemPrompt,
				messages,
				tools: config.tools,
				stream: true,
			});

			for await (const event of stream) {
				switch (event.type) {
					case "content_block_start":
						if (event.content_block.type === "text") {
							emitEvent({
								type: "text",
								sessionId,
								data: { text: "" },
							});
						} else if (event.content_block.type === "tool_use") {
							emitEvent({
								type: "tool_use",
								sessionId,
								data: {
									toolName: event.content_block.name,
									toolInput: event.content_block.input,
								},
							});
						}
						break;

					case "content_block_delta":
						if (event.delta.type === "text_delta") {
							assistantMessage.content += event.delta.text;
							emitEvent({
								type: "text",
								sessionId,
								data: { text: event.delta.text },
							});
						}
						break;

					case "content_block_stop":
						// Content block completed
						break;

					case "message_stop":
						this.addMessage(sessionId, assistantMessage);
						emitEvent({
							type: "done",
							sessionId,
							data: { messageId: assistantMessage.id },
						});
						break;
				}
			}
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error occurred";
			emitEvent({
				type: "error",
				sessionId,
				data: { error: errorMessage },
			});
			throw error;
		}
	}

	/**
	 * 检查会话是否活跃
	 */
	isSessionActive(sessionId: string): boolean {
		return this.activeSessions.has(sessionId);
	}

	/**
	 * 获取活跃会话数量
	 */
	getActiveSessionCount(): number {
		return this.activeSessions.size;
	}
}

// 单例实例
export const agentService = new AgentService();
