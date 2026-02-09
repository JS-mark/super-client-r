/**
 * Agent Hook
 * 管理 Agent 会话和消息
 */

import { useCallback, useEffect, useState } from "react";
import { agentClient } from "../services/agent/agentService";
import type {
	AgentConfig,
	AgentMessage,
	AgentSession,
	AgentStreamEvent,
} from "../types/electron";

export function useAgent() {
	const [sessions, setSessions] = useState<AgentSession[]>([]);
	const [currentSession, setCurrentSession] = useState<AgentSession | null>(
		null,
	);
	const [messages, setMessages] = useState<AgentMessage[]>([]);
	const [isStreaming, setIsStreaming] = useState(false);
	const [streamContent, setStreamContent] = useState("");

	// 加载会话列表
	const loadSessions = useCallback(async () => {
		try {
			const data = await agentClient.listAgents();
			setSessions(data);
		} catch (error) {
			console.error("Failed to load sessions:", error);
		}
	}, []);

	// 创建新会话
	const createSession = useCallback(async (config: AgentConfig) => {
		try {
			const session = await agentClient.createSession(config);
			setSessions((prev) => [...prev, session]);
			setCurrentSession(session);
			setMessages([]);
			return session;
		} catch (error: any) {
			throw new Error(error.message || "Failed to create session");
		}
	}, []);

	// 发送消息
	const sendMessage = useCallback(
		async (content: string) => {
			if (!currentSession || isStreaming) {
				return;
			}

			setIsStreaming(true);
			setStreamContent("");

			// 添加用户消息
			const userMessage: AgentMessage = {
				id: `msg_${Date.now()}`,
				sessionId: currentSession.id,
				role: "user",
				content,
				timestamp: Date.now(),
			};
			setMessages((prev) => [...prev, userMessage]);

			try {
				// 订阅流式事件
				const unsubscribe = agentClient.onStreamEvent(
					(event: AgentStreamEvent) => {
						if (event.sessionId === currentSession.id) {
							if (event.type === "text") {
								setStreamContent(
									(prev) => prev + (event.data as { text: string }).text,
								);
							} else if (event.type === "done") {
								// 添加助手消息
								const assistantMessage: AgentMessage = {
									id: `msg_${Date.now()}`,
									sessionId: currentSession.id,
									role: "assistant",
									content: streamContent,
									timestamp: Date.now(),
								};
								setMessages((prev) => [...prev, assistantMessage]);
								setStreamContent("");
							}
						}
					},
				);

				await agentClient.sendMessage(currentSession.id, content);

				// 刷新消息列表
				const updatedMessages = await agentClient.getMessages(
					currentSession.id,
				);
				setMessages(updatedMessages);

				unsubscribe();
			} catch (error: any) {
				console.error("Failed to send message:", error);
				throw error;
			} finally {
				setIsStreaming(false);
			}
		},
		[currentSession, isStreaming, streamContent],
	);

	// 停止 agent
	const stopAgent = useCallback(async () => {
		if (!currentSession) {
			return;
		}

		try {
			await agentClient.stopAgent(currentSession.id);
			setIsStreaming(false);
			setStreamContent("");
		} catch (error) {
			console.error("Failed to stop agent:", error);
		}
	}, [currentSession]);

	// 清除消息
	const clearMessages = useCallback(async () => {
		if (!currentSession) {
			return;
		}

		try {
			await agentClient.clearMessages(currentSession.id);
			setMessages([]);
		} catch (error) {
			console.error("Failed to clear messages:", error);
		}
	}, [currentSession]);

	// 删除会话
	const deleteSession = useCallback(
		async (sessionId: string) => {
			try {
				await agentClient.deleteSession(sessionId);
				setSessions((prev) => prev.filter((s) => s.id !== sessionId));
				if (currentSession?.id === sessionId) {
					setCurrentSession(null);
					setMessages([]);
				}
			} catch (error) {
				console.error("Failed to delete session:", error);
			}
		},
		[currentSession],
	);

	// 初始化时加载会话
	useEffect(() => {
		loadSessions();
	}, [loadSessions]);

	return {
		sessions,
		currentSession,
		messages,
		isStreaming,
		streamContent,
		setCurrentSession,
		createSession,
		sendMessage,
		stopAgent,
		clearMessages,
		deleteSession,
		loadSessions,
	};
}
