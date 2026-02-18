import { App } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";
import { agentClient } from "../services/agent/agentService";
import { mcpClient } from "../services/mcp/mcpService";
import { modelService } from "../services/modelService";
import { skillClient } from "../services/skill/skillService";
import { type Message, useChatStore } from "../stores/chatStore";
import { useModelStore } from "../stores/modelStore";

export type ChatMode = "direct" | "agent" | "skill" | "mcp";

export interface ChatOptions {
	mode?: ChatMode;
	agentId?: string;
	skillId?: string;
	skillToolName?: string;
	mcpServerId?: string;
	mcpToolName?: string;
}

export function useChat() {
	const { message } = App.useApp();
	const {
		messages,
		isStreaming,
		streamingContent,
		addMessage,
		updateLastMessage,
		updateMessageToolCall,
		updateMessageMetadata,
		setStreaming,
		setStreamingContent,
		appendStreamingContent,
		clearMessages,
		deleteMessage,
		deleteMessagesFrom,
	} = useChatStore();

	const [input, setInput] = useState("");
	const [chatMode, setChatMode] = useState<ChatMode>("direct");
	const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
	const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
	const [selectedMcpServerId, setSelectedMcpServerId] = useState<string | null>(
		null,
	);

	const currentRequestIdRef = useRef<string | null>(null);
	const streamContentRef = useRef("");

	// Subscribe to LLM stream events
	useEffect(() => {
		const unsubscribe = modelService.onStreamEvent((event) => {
			if (event.requestId !== currentRequestIdRef.current) return;

			if (event.type === "chunk" && event.content) {
				streamContentRef.current += event.content;
				appendStreamingContent(event.content);
			} else if (event.type === "done") {
				// Persist the accumulated streaming content to the last message
				updateLastMessage(streamContentRef.current);
				// Store token usage and timing if available
				const allMessages = useChatStore.getState().messages;
				const lastAssistant = allMessages[allMessages.length - 1];
				if (lastAssistant?.role === "assistant") {
					const outputTokens = event.usage?.outputTokens;
					const totalMs = event.timing?.totalMs;
					const tps = outputTokens && totalMs && totalMs > 0
						? Math.round((outputTokens / totalMs) * 1000)
						: undefined;
					updateMessageMetadata(lastAssistant.id, {
						tokens: event.usage?.totalTokens,
						inputTokens: event.usage?.inputTokens,
						outputTokens: event.usage?.outputTokens,
						duration: totalMs,
						firstTokenMs: event.timing?.firstTokenMs,
						tokensPerSecond: tps,
					});
					// Also store input tokens on the preceding user message
					if (event.usage?.inputTokens) {
						const userMsg = [...allMessages].reverse().find(
							(m) => m.role === "user" && m.id !== lastAssistant.id,
						);
						if (userMsg) {
							updateMessageMetadata(userMsg.id, {
								inputTokens: event.usage.inputTokens,
							});
						}
					}
				}
				setStreaming(false);
				setStreamingContent("");
				streamContentRef.current = "";
				currentRequestIdRef.current = null;
			} else if (event.type === "error") {
				message.error(`Stream error: ${event.error}`);
				setStreaming(false);
				setStreamingContent("");
				streamContentRef.current = "";
				currentRequestIdRef.current = null;
			}
		});
		return unsubscribe;
	}, [appendStreamingContent, setStreaming, setStreamingContent, updateLastMessage, updateMessageMetadata, message]);

	/**
	 * Send message in direct chat mode (via IPC to main process)
	 */
	const sendDirectMessage = useCallback(
		async (content: string) => {
			const active = useModelStore.getState().getActiveProviderModel();
			if (!active) {
				message.error("No active model selected. Please configure a model in Settings → Models.");
				return;
			}

			const { provider, model } = active;

			setStreaming(true);
			setStreamingContent("");
			streamContentRef.current = "";

			const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
			currentRequestIdRef.current = requestId;

			try {
				// Read latest messages from store (not closure) to handle retry correctly
				const currentMessages = useChatStore.getState().messages;
				const history = currentMessages
					.filter((m) => (m.role === "user" || m.role === "assistant") && m.content.length > 0)
					.map((m) => ({
						role: m.role as "user" | "assistant",
						content: m.content,
					}));

				await modelService.chatCompletion({
					requestId,
					baseUrl: provider.baseUrl,
					apiKey: provider.apiKey,
					model: model.id,
					messages: history,
				});
			} catch (error: unknown) {
				console.error("[useChat] Failed to send direct message:", error);
				const errorMsg = error instanceof Error ? error.message : String(error);
				message.error(`Error: ${errorMsg}`);
				setStreaming(false);
				setStreamingContent("");
				streamContentRef.current = "";
				currentRequestIdRef.current = null;
			}
		},
		[message, setStreaming, setStreamingContent],
	);

	/**
	 * Send message using Agent
	 */
	const sendAgentMessage = useCallback(
		async (content: string, agentId?: string) => {
			if (!agentId) {
				message.error("No agent selected");
				return;
			}

			setStreaming(true);
			setStreamingContent("");

			try {
				const session = await agentClient.createSession({
					apiKey: "",
					model: "claude-3-5-sonnet-20241022",
				});

				await agentClient.sendMessage(session.id, content);

				const unsubscribe = agentClient.onStreamEvent((event) => {
					if (event.type === "text") {
						appendStreamingContent(String(event.data));
					} else if (event.type === "tool_use") {
						const toolData = event.data as {
							id: string;
							name: string;
							input: Record<string, unknown>;
						};
						const toolMessage: Message = {
							id: `tool_${Date.now()}`,
							role: "tool",
							content: `Using tool: ${toolData.name}`,
							timestamp: Date.now(),
							type: "tool_use",
							toolCall: {
								id: toolData.id,
								name: toolData.name,
								input: toolData.input,
								status: "pending",
							},
						};
						addMessage(toolMessage);
					} else if (event.type === "tool_result") {
						const resultData = event.data as {
							tool_use_id: string;
							content: unknown;
							is_error?: boolean;
						};
						const toolMsg = messages.find(
							(m) => m.toolCall?.id === resultData.tool_use_id,
						);
						if (toolMsg) {
							updateMessageToolCall(toolMsg.id, {
								status: resultData.is_error ? "error" : "success",
								result: resultData.content,
							});
						}
					} else if (event.type === "done") {
						unsubscribe();
						setStreaming(false);
					}
				});

				setTimeout(() => {
					unsubscribe();
					setStreaming(false);
				}, 60000);
			} catch (error: unknown) {
				console.error("[useChat] Failed to send agent message:", error);
				const errorMsg = error instanceof Error ? error.message : String(error);
				message.error(`Error: ${errorMsg}`);
				setStreaming(false);
			}
		},
		[
			message,
			messages,
			addMessage,
			updateMessageToolCall,
			appendStreamingContent,
			setStreaming,
			setStreamingContent,
		],
	);

	/**
	 * Execute Skill
	 */
	const executeSkill = useCallback(
		async (content: string, skillId?: string, toolName?: string) => {
			if (!skillId) {
				message.error("No skill selected");
				return;
			}

			const skill = await skillClient.getSkill(skillId).catch(() => null);
			if (!skill) {
				message.error("Skill not found");
				return;
			}

			if (!toolName && skill.tools && skill.tools.length > 0) {
				toolName = skill.tools[0].name;
			}

			if (!toolName) {
				message.error("No tool available for this skill");
				return;
			}

			const toolMessage: Message = {
				id: `skill_${Date.now()}`,
				role: "tool",
				content: `Executing skill: ${skill.name}`,
				timestamp: Date.now(),
				type: "tool_use",
				toolCall: {
					id: `skill_${Date.now()}`,
					name: `${skill.name}.${toolName}`,
					input: { content },
					status: "pending",
				},
			};
			addMessage(toolMessage);

			try {
				const startTime = Date.now();
				const result = await skillClient.executeSkill(skillId, toolName, {
					content,
					timestamp: Date.now(),
				});

				const duration = Date.now() - startTime;

				updateMessageToolCall(toolMessage.id, {
					status: result.success ? "success" : "error",
					result: result.output,
					error: result.error,
					duration,
				});

				if (!result.success) {
					message.error(`Skill execution failed: ${result.error}`);
				}
			} catch (error: unknown) {
				console.error("[useChat] Failed to execute skill:", error);
				const errorMsg = error instanceof Error ? error.message : String(error);
				updateMessageToolCall(toolMessage.id, {
					status: "error",
					error: errorMsg,
				});
				message.error(`Error: ${errorMsg}`);
			}
		},
		[addMessage, updateMessageToolCall, message],
	);

	/**
	 * Execute MCP Tool
	 */
	const executeMcpTool = useCallback(
		async (content: string, serverId?: string, toolName?: string) => {
			if (!serverId) {
				message.error("No MCP server selected");
				return;
			}

			const tools = await mcpClient.getTools(serverId).catch(() => []);
			if (!toolName && tools.length > 0) {
				toolName = tools[0].name;
			}

			if (!toolName) {
				message.error("No tool available");
				return;
			}

			const toolMessage: Message = {
				id: `mcp_${Date.now()}`,
				role: "tool",
				content: `Calling MCP tool: ${toolName}`,
				timestamp: Date.now(),
				type: "tool_use",
				toolCall: {
					id: `mcp_${Date.now()}`,
					name: toolName,
					input: { content },
					status: "pending",
				},
			};
			addMessage(toolMessage);

			try {
				const startTime = Date.now();
				const result = await mcpClient.callTool(serverId, toolName, {
					content,
				});

				const duration = Date.now() - startTime;

				updateMessageToolCall(toolMessage.id, {
					status: "success",
					result,
					duration,
				});
			} catch (error: unknown) {
				console.error("[useChat] Failed to execute MCP tool:", error);
				const errorMsg = error instanceof Error ? error.message : String(error);
				updateMessageToolCall(toolMessage.id, {
					status: "error",
					error: errorMsg,
				});
				message.error(`Error: ${errorMsg}`);
			}
		},
		[addMessage, updateMessageToolCall, message],
	);

	/**
	 * Retry a message – resend from a given user or assistant message
	 */
	const retryMessage = useCallback(
		async (messageId: string) => {
			const allMessages = useChatStore.getState().messages;
			const idx = allMessages.findIndex((m) => m.id === messageId);
			if (idx === -1) return;

			const target = allMessages[idx];
			let userContent: string;

			if (target.role === "user") {
				userContent = target.content;
				// Delete everything from this user message onward (inclusive)
				deleteMessagesFrom(messageId);
			} else if (target.role === "assistant") {
				// Find the preceding user message
				const precedingUser = [...allMessages.slice(0, idx)]
					.reverse()
					.find((m) => m.role === "user");
				if (!precedingUser) return;
				userContent = precedingUser.content;
				// Delete from the preceding user message onward
				deleteMessagesFrom(precedingUser.id);
			} else {
				return;
			}

			// Re-add user message + empty assistant message, then send
			const userMessage: Message = {
				id: `user_${Date.now()}`,
				role: "user",
				content: userContent,
				timestamp: Date.now(),
			};
			addMessage(userMessage);

			const assistantMessage: Message = {
				id: `assistant_${Date.now()}`,
				role: "assistant",
				content: "",
				timestamp: Date.now(),
			};
			addMessage(assistantMessage);

			await sendDirectMessage(userContent);
		},
		[addMessage, deleteMessagesFrom, sendDirectMessage],
	);

	/**
	 * Edit a user message – populate input and remove messages from that point
	 */
	const editMessage = useCallback(
		(messageId: string) => {
			const allMessages = useChatStore.getState().messages;
			const target = allMessages.find((m) => m.id === messageId);
			if (!target || target.role !== "user") return;

			setInput(target.content);
			deleteMessagesFrom(messageId);
		},
		[setInput, deleteMessagesFrom],
	);

	/**
	 * Main send message function
	 */
	const sendMessage = useCallback(
		async (options?: ChatOptions) => {
			if (!input.trim()) return;

			const mode = options?.mode || chatMode;
			const content = input.trim();

			const userMessage: Message = {
				id: `user_${Date.now()}`,
				role: "user",
				content,
				timestamp: Date.now(),
			};
			addMessage(userMessage);
			setInput("");

			if (mode === "direct" || mode === "agent") {
				const assistantMessage: Message = {
					id: `assistant_${Date.now()}`,
					role: "assistant",
					content: "",
					timestamp: Date.now(),
				};
				addMessage(assistantMessage);
			}

			switch (mode) {
				case "agent":
					await sendAgentMessage(
						content,
						options?.agentId || selectedAgentId || undefined,
					);
					break;
				case "skill":
					await executeSkill(
						content,
						options?.skillId || selectedSkillId || undefined,
						options?.skillToolName,
					);
					break;
				case "mcp":
					await executeMcpTool(
						content,
						options?.mcpServerId || selectedMcpServerId || undefined,
						options?.mcpToolName,
					);
					break;
				case "direct":
				default:
					await sendDirectMessage(content);
					break;
			}
		},
		[
			input,
			chatMode,
			selectedAgentId,
			selectedSkillId,
			selectedMcpServerId,
			addMessage,
			sendDirectMessage,
			sendAgentMessage,
			executeSkill,
			executeMcpTool,
		],
	);

	const stopCurrentStream = useCallback(() => {
		if (currentRequestIdRef.current) {
			modelService.stopStream(currentRequestIdRef.current);
			currentRequestIdRef.current = null;
		}
	}, []);

	return {
		// State
		messages,
		input,
		isStreaming,
		streamingContent,
		chatMode,
		selectedAgentId,
		selectedSkillId,
		selectedMcpServerId,

		// Setters
		setInput,
		setChatMode,
		setSelectedAgentId,
		setSelectedSkillId,
		setSelectedMcpServerId,

		// Actions
		sendMessage,
		clearMessages,
		stopCurrentStream,
		retryMessage,
		editMessage,
		deleteMessage,
	};
}
