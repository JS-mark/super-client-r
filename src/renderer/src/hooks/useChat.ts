import { App } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";
import { buildSystemPrompt } from "../prompt";
import { agentClient } from "../services/agent/agentService";
import { mcpClient } from "../services/mcp/mcpService";
import { modelService } from "../services/modelService";
import { searchService } from "../services/search/searchService";
import { skillClient } from "../services/skill/skillService";
import { type Message, useChatStore } from "../stores/chatStore";
import { useModelStore } from "../stores/modelStore";
import type { SearchConfig } from "../types/search";

export type ChatMode = "direct" | "agent" | "skill";

export interface ChatOptions {
	mode?: ChatMode;
	agentId?: string;
	skillId?: string;
	searchEngine?: string;
	searchConfigs?: SearchConfig[];
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

	const currentRequestIdRef = useRef<string | null>(null);
	const streamContentRef = useRef("");

	// Subscribe to LLM stream events
	useEffect(() => {
		const unsubscribe = modelService.onStreamEvent((event) => {
			if (event.requestId !== currentRequestIdRef.current) return;

			if (event.type === "chunk" && event.content) {
				streamContentRef.current += event.content;
				appendStreamingContent(event.content);
			} else if (event.type === "tool_call" && event.toolCall) {
				// Model is calling a tool — show a tool message in the chat
				const toolMessage: Message = {
					id: `tool_${event.toolCall.id}`,
					role: "tool",
					content: `Calling tool: ${event.toolCall.name}`,
					timestamp: Date.now(),
					type: "tool_use",
					toolCall: {
						id: event.toolCall.id,
						name: event.toolCall.name,
						input: (() => {
							try {
								return JSON.parse(event.toolCall!.arguments || "{}");
							} catch {
								return {};
							}
						})(),
						status: "pending",
					},
				};
				addMessage(toolMessage);

				// Finalize any accumulated assistant content before tool calls
				if (streamContentRef.current) {
					updateLastMessage(streamContentRef.current);
					streamContentRef.current = "";
					setStreamingContent("");
				}
			} else if (event.type === "tool_result" && event.toolResult) {
				// Tool execution completed — update the tool message
				const toolMsgId = `tool_${event.toolResult.toolCallId}`;
				updateMessageToolCall(toolMsgId, {
					status: event.toolResult.isError ? "error" : "success",
					result: event.toolResult.result,
					error: event.toolResult.isError ? String(event.toolResult.result) : undefined,
					duration: event.toolResult.duration,
				});

				// After tool results, model will stream more — add a new assistant message
				const assistantMessage: Message = {
					id: `assistant_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
					role: "assistant",
					content: "",
					timestamp: Date.now(),
				};
				addMessage(assistantMessage);
			} else if (event.type === "done") {
				// Persist the accumulated streaming content to the last message
				if (streamContentRef.current) {
					updateLastMessage(streamContentRef.current);
				}
				// Persist the complete assistant message to disk
				const { currentConversationId, persistMessages } = useChatStore.getState();
				if (currentConversationId) {
					persistMessages();
				}
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
	}, [addMessage, appendStreamingContent, setStreaming, setStreamingContent, updateLastMessage, updateMessageToolCall, updateMessageMetadata, message]);

	/**
	 * Send message in direct chat mode (via IPC to main process)
	 * Automatically includes MCP tools when servers are connected.
	 */
	const sendDirectMessage = useCallback(
		async (content: string, options?: { searchEngine?: string; searchConfigs?: SearchConfig[] }) => {
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
				const history: Array<{ role: "user" | "assistant" | "system"; content: string }> = currentMessages
					.filter((m) => (m.role === "user" || m.role === "assistant") && m.content.length > 0)
					.map((m) => ({
						role: m.role as "user" | "assistant",
						content: m.content,
					}));

				// Inject system prompt: global default + model custom system prompt
				const systemPrompt = buildSystemPrompt(model.systemPrompt);
				history.unshift({
					role: "system",
					content: systemPrompt,
				});

				// Search augmentation: if a search engine is selected, execute search and prepend results
				if (options?.searchEngine && options.searchConfigs) {
					const searchConfig = options.searchConfigs.find(
						(c) => c.provider === options.searchEngine && c.enabled,
					);
					if (searchConfig) {
						try {
							const searchResult = await searchService.execute({
								provider: searchConfig.provider,
								query: content,
								apiKey: searchConfig.apiKey,
								apiUrl: searchConfig.apiUrl,
								maxResults: 5,
								config: searchConfig.config,
							});
							if (searchResult.success && searchResult.data && searchResult.data.results.length > 0) {
								const searchContext = searchResult.data.results
									.map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.snippet}`)
									.join("\n\n");
								// Insert after system prompt (index 0) so global prompt stays first
								history.splice(1, 0, {
									role: "system",
									content: `The following are web search results for the user's query "${content}" (searched via ${searchResult.data.provider} in ${searchResult.data.searchTimeMs}ms). Use these results to provide an informed, up-to-date response. Cite sources when relevant.\n\n${searchContext}`,
								});
							}
						} catch (searchError) {
							console.warn("[useChat] Search failed, continuing without search results:", searchError);
						}
					}
				}

				// Auto-fetch MCP tools from all connected servers
				let tools: Array<{
					type: "function";
					function: { name: string; description: string; parameters: Record<string, unknown> };
				}> | undefined;
				let toolMapping: Record<string, { serverId: string; toolName: string }> | undefined;

				try {
					const mcpTools = await mcpClient.getAllTools();
					if (mcpTools.length > 0) {
						tools = [];
						toolMapping = {};
						for (const { serverId, tool } of mcpTools) {
							const prefixedName = `${serverId}__${tool.name}`;
							tools.push({
								type: "function",
								function: {
									name: prefixedName,
									description: tool.description || "",
									parameters: tool.inputSchema || { type: "object", properties: {} },
								},
							});
							toolMapping[prefixedName] = { serverId, toolName: tool.name };
						}
					}
				} catch (err) {
					console.warn("[useChat] Failed to fetch MCP tools, continuing without tools:", err);
				}

				await modelService.chatCompletion({
					requestId,
					baseUrl: provider.baseUrl,
					apiKey: provider.apiKey,
					model: model.id,
					messages: history,
					tools,
					toolMapping,
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
	 * Send message in skill mode (LLM streaming with skill systemPrompt injection)
	 */
	const sendSkillMessage = useCallback(
		async (content: string, skillId?: string) => {
			if (!skillId) {
				message.error("No skill selected");
				return;
			}

			const active = useModelStore.getState().getActiveProviderModel();
			if (!active) {
				message.error("No active model selected. Please configure a model in Settings → Models.");
				return;
			}

			const { provider, model } = active;

			// 获取 skill 的系统提示词
			let skillSystemPrompt: string | null = null;
			try {
				skillSystemPrompt = await skillClient.getSystemPrompt(skillId);
			} catch {
				console.warn("[useChat] Failed to load skill system prompt");
			}

			setStreaming(true);
			setStreamingContent("");
			streamContentRef.current = "";

			const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
			currentRequestIdRef.current = requestId;

			try {
				const currentMessages = useChatStore.getState().messages;
				const history: { role: "user" | "assistant" | "system"; content: string }[] = currentMessages
					.filter((m) => (m.role === "user" || m.role === "assistant") && m.content.length > 0)
					.map((m) => ({
						role: m.role as "user" | "assistant",
						content: m.content,
					}));

				// 构建系统提示词: 全局默认 + Skill 上下文 + 模型自定义
				const basePrompt = buildSystemPrompt(model.systemPrompt);
				const systemPrompt = skillSystemPrompt
					? `${basePrompt}\n\n--- Skill Context ---\n${skillSystemPrompt}`
					: basePrompt;

				history.unshift({
					role: "system",
					content: systemPrompt,
				});

				await modelService.chatCompletion({
					requestId,
					baseUrl: provider.baseUrl,
					apiKey: provider.apiKey,
					model: model.id,
					messages: history,
				});
			} catch (error: unknown) {
				console.error("[useChat] Failed to send skill message:", error);
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

			// Auto-create conversation if none exists
			const { currentConversationId, createConversation } = useChatStore.getState();
			if (!currentConversationId) {
				const name = content.slice(0, 50);
				await createConversation(name);
			}

			const userMessage: Message = {
				id: `user_${Date.now()}`,
				role: "user",
				content,
				timestamp: Date.now(),
			};
			addMessage(userMessage);
			setInput("");

			const assistantMessage: Message = {
				id: `assistant_${Date.now()}`,
				role: "assistant",
				content: "",
				timestamp: Date.now(),
			};
			addMessage(assistantMessage);

			switch (mode) {
				case "agent":
					await sendAgentMessage(
						content,
						options?.agentId || selectedAgentId || undefined,
					);
					break;
				case "skill":
					await sendSkillMessage(
						content,
						options?.skillId || selectedSkillId || undefined,
					);
					break;
				case "direct":
				default:
					await sendDirectMessage(content, {
						searchEngine: options?.searchEngine,
						searchConfigs: options?.searchConfigs,
					});
					break;
			}
		},
		[
			input,
			chatMode,
			selectedAgentId,
			selectedSkillId,
			addMessage,
			sendDirectMessage,
			sendAgentMessage,
			sendSkillMessage,
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

		// Setters
		setInput,
		setChatMode,
		setSelectedAgentId,
		setSelectedSkillId,

		// Actions
		sendMessage,
		clearMessages,
		stopCurrentStream,
		retryMessage,
		editMessage,
		deleteMessage,
	};
}
