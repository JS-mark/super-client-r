import { App } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SessionSettings } from "../components/chat/ChatSettingsModal";
import { DEFAULT_SESSION_SETTINGS } from "../components/chat/ChatSettingsModal";
import { type EnvInfo, buildSystemPrompt } from "../prompt";
import { mcpClient } from "../services/mcp/mcpService";
import { modelService } from "../services/modelService";
import { searchService } from "../services/search/searchService";
import { skillClient } from "../services/skill/skillService";
import { type Message, useChatStore } from "../stores/chatStore";
import { useModelStore } from "../stores/modelStore";
import type { ActiveModelSelection } from "../types/models";
import type { SearchConfig } from "../types/search";

export type {
	SessionSettings,
	ToolCallMode,
	ToolPermissionMode,
	CustomParam,
} from "../components/chat/ChatSettingsModal";
export { DEFAULT_SESSION_SETTINGS } from "../components/chat/ChatSettingsModal";

export type ChatMode = "direct" | "agent" | "skill";

export interface ChatOptions {
	mode?: ChatMode;
	agentId?: string;
	skillId?: string;
	searchEngine?: string;
	searchConfigs?: SearchConfig[];
}

/**
 * Fetch MCP tools from all connected servers and build tool awareness prompt.
 * Returns tools array, toolMapping, and a tool hint string for the system prompt.
 */
/**
 * 将 serverId 转换为合法的 OpenAI 函数名前缀
 * OpenAI 要求: ^[a-zA-Z0-9_-]+$
 * 例如: "@scp/fetch" → "scp-fetch", "@mcp/browser" → "mcp-browser"
 */
function sanitizeServerId(serverId: string): string {
	return serverId.replace(/^@/, "").replace(/[^a-zA-Z0-9_-]/g, "-");
}

async function fetchMcpTools(): Promise<{
	tools?: Array<{
		type: "function";
		function: {
			name: string;
			description: string;
			parameters: Record<string, unknown>;
		};
	}>;
	toolMapping?: Record<string, { serverId: string; toolName: string }>;
	toolHint: string;
}> {
	try {
		const mcpTools = await mcpClient.getAllTools();
		if (mcpTools.length > 0) {
			const tools: Array<{
				type: "function";
				function: {
					name: string;
					description: string;
					parameters: Record<string, unknown>;
				};
			}> = [];
			const toolMapping: Record<
				string,
				{ serverId: string; toolName: string }
			> = {};
			for (const { serverId, tool } of mcpTools) {
				const safePrefix = sanitizeServerId(serverId);
				const prefixedName = `${safePrefix}__${tool.name}`;
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
			const toolNames = tools
				.map((t) => t.function.name.split("__").pop())
				.join(", ");
			const toolHint = `\n\nYou have access to the following tools and SHOULD actively use them when the user's request can benefit from them: ${toolNames}. Do not say you cannot access files, databases, or the web if a relevant tool is available — use the tool instead.`;
			return { tools, toolMapping, toolHint };
		}
	} catch (err) {
		console.warn("[useChat] Failed to fetch MCP tools:", err);
	}
	return { toolHint: "" };
}

/**
 * Parse custom params from SessionSettings into a Record.
 */
function parseCustomParams(
	params: Array<{ name: string; type: string; value: string }>,
): Record<string, unknown> | undefined {
	const valid = params.filter((p) => p.name.trim());
	if (valid.length === 0) return undefined;
	const result: Record<string, unknown> = {};
	for (const p of valid) {
		const key = p.name.trim();
		switch (p.type) {
			case "number":
				result[key] = Number(p.value) || 0;
				break;
			case "boolean":
				result[key] = p.value.toLowerCase() === "true";
				break;
			case "json":
				try {
					result[key] = JSON.parse(p.value);
				} catch {
					result[key] = p.value;
				}
				break;
			default:
				result[key] = p.value;
		}
	}
	return result;
}

// 缓存环境信息（静态数据，应用生命周期内不变）
let cachedEnvInfo: EnvInfo | null = null;

async function getEnvInfo(): Promise<EnvInfo | undefined> {
	if (cachedEnvInfo) return cachedEnvInfo;
	try {
		const res = await window.electron.system.getEnvInfo();
		if (res.success && res.data) {
			cachedEnvInfo = res.data;
			return cachedEnvInfo;
		}
	} catch (err) {
		console.warn("[useChat] Failed to fetch env info:", err);
	}
	return undefined;
}

/**
 * Get env info for system prompt injection.
 * The cwd defaults to the user's home directory (set by the main process).
 * Attaches the per-conversation workspace directory when available.
 */
async function getEnvInfoForPrompt(): Promise<EnvInfo | undefined> {
	const envInfo = await getEnvInfo();
	if (!envInfo) return undefined;

	const conversationId = useChatStore.getState().currentConversationId;
	if (!conversationId) return envInfo;

	try {
		const res = await window.electron.chat.getWorkspaceDir(conversationId);
		if (res.success && res.data) {
			return { ...envInfo, workspaceDir: res.data };
		}
	} catch (err) {
		console.warn("[useChat] getWorkspaceDir failed:", err);
	}
	return envInfo;
}

export function useChat() {
	const { message } = App.useApp();
	const {
		messages,
		sessionStatus,
		isStreaming,
		streamingContent,
		addMessage,
		updateLastMessage,
		updateMessageToolCall,
		updateMessageMetadata,
		setSessionStatus,
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

	// Pending tool approval state
	const [pendingApproval, setPendingApproval] = useState<{
		toolCallId: string;
		name: string;
		arguments: string;
	} | null>(null);

	// Session-scoped model override (does not affect global setting)
	const [sessionModelOverride, setSessionModelOverride] =
		useState<ActiveModelSelection | null>(null);

	// Session-scoped settings (tools, temperature, maxTokens, systemPrompt)
	const [sessionSettings, setSessionSettings] = useState<SessionSettings>(
		DEFAULT_SESSION_SETTINGS,
	);

	// Available MCP tools for permission settings UI
	const [availableTools, setAvailableTools] = useState<
		Array<{ prefixedName: string; displayName: string }>
	>([]);

	const respondToApproval = useCallback(
		async (toolCallId: string, approved: boolean) => {
			// Optimistic update: immediately reflect in UI
			const toolMsgId = `tool_${toolCallId}`;
			if (approved) {
				updateMessageToolCall(toolMsgId, { status: "pending" });
			} else {
				updateMessageToolCall(toolMsgId, {
					status: "error",
					error: "Tool call rejected by user",
				});
			}
			try {
				await window.electron.llm.toolApprovalResponse(toolCallId, approved);
			} catch (err) {
				console.error("[useChat] toolApprovalResponse failed:", err);
			}
			setPendingApproval(null);
		},
		[updateMessageToolCall],
	);

	// Fetch available tools list for settings UI
	useEffect(() => {
		const loadTools = async () => {
			try {
				const mcpTools = await mcpClient.getAllTools();
				const tools = mcpTools.map(({ serverId, tool }) => {
					const safePrefix = sanitizeServerId(serverId);
					const prefixedName = `${safePrefix}__${tool.name}`;
					return { prefixedName, displayName: tool.name };
				});
				setAvailableTools(tools);
			} catch {
				setAvailableTools([]);
			}
		};
		loadTools();
	}, []);

	const currentRequestIdRef = useRef<string | null>(null);
	const streamContentRef = useRef("");
	const currentModelInfoRef = useRef<{
		model: string;
		providerPreset: string;
		providerName: string;
	} | null>(null);

	/**
	 * Get the effective model for the current session.
	 * Uses sessionModelOverride if set, otherwise falls back to global active model.
	 */
	const getEffectiveModel = useCallback(() => {
		if (sessionModelOverride) {
			const { providers } = useModelStore.getState();
			const provider = providers.find(
				(p) => p.id === sessionModelOverride.providerId,
			);
			const model = provider?.models.find(
				(m) => m.id === sessionModelOverride.modelId,
			);
			if (provider && model) return { provider, model };
		}
		return useModelStore.getState().getActiveProviderModel();
	}, [sessionModelOverride]);

	// Subscribe to LLM stream events
	useEffect(() => {
		const unsubscribe = modelService.onStreamEvent((event) => {
			if (event.requestId !== currentRequestIdRef.current) return;

			if (event.type === "chunk" && event.content) {
				// Transition preparing → streaming on first chunk
				if (useChatStore.getState().sessionStatus === "preparing") {
					setSessionStatus("streaming");
				}
				streamContentRef.current += event.content;
				appendStreamingContent(event.content);
			} else if (event.type === "tool_call" && event.toolCall) {
				setSessionStatus("tool_calling");

				// Finalize any accumulated assistant content BEFORE adding the tool message
				// (updateLastMessage targets messages[last], which is still the assistant here)
				if (streamContentRef.current) {
					updateLastMessage(streamContentRef.current);
					streamContentRef.current = "";
					setStreamingContent("");
				}

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
			} else if (event.type === "tool_result" && event.toolResult) {
				setSessionStatus("streaming");
				// Tool execution completed — update the tool message
				const toolMsgId = `tool_${event.toolResult.toolCallId}`;
				updateMessageToolCall(toolMsgId, {
					status: event.toolResult.isError ? "error" : "success",
					result: event.toolResult.result,
					error: event.toolResult.isError
						? String(event.toolResult.result)
						: undefined,
					duration: event.toolResult.duration,
				});

				// After tool results, model will stream more — add a new assistant message
				const modelInfo = currentModelInfoRef.current;
				const assistantMessage: Message = {
					id: `assistant_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
					role: "assistant",
					content: "",
					timestamp: Date.now(),
					metadata: modelInfo
						? {
								model: modelInfo.model,
								providerPreset: modelInfo.providerPreset,
								providerName: modelInfo.providerName,
							}
						: undefined,
				};
				addMessage(assistantMessage);
			} else if (event.type === "tool_approval_request" && event.toolApproval) {
				// Update tool message to show inline approval UI
				const toolMsgId = `tool_${event.toolApproval.toolCallId}`;
				updateMessageToolCall(toolMsgId, {
					status: "awaiting_approval",
				});
			} else if (event.type === "tool_rejected" && event.toolResult) {
				// Update tool message to show rejection
				const toolMsgId = `tool_${event.toolResult.toolCallId}`;
				updateMessageToolCall(toolMsgId, {
					status: "error",
					error: String(event.toolResult.result),
				});
			} else if (event.type === "done") {
				// Persist the accumulated streaming content to the last message
				if (streamContentRef.current) {
					updateLastMessage(streamContentRef.current);
				}
				// Persist the complete assistant message to disk
				const { currentConversationId, persistMessages } =
					useChatStore.getState();
				if (currentConversationId) {
					persistMessages();
				}
				// Store token usage and timing if available
				const allMessages = useChatStore.getState().messages;
				const lastAssistant = allMessages[allMessages.length - 1];
				if (lastAssistant?.role === "assistant") {
					const outputTokens = event.usage?.outputTokens;
					const totalMs = event.timing?.totalMs;
					const tps =
						outputTokens && totalMs && totalMs > 0
							? Math.round((outputTokens / totalMs) * 1000)
							: undefined;
					const modelInfo = currentModelInfoRef.current;
					updateMessageMetadata(lastAssistant.id, {
						model: modelInfo?.model,
						providerPreset: modelInfo?.providerPreset,
						providerName: modelInfo?.providerName,
						tokens: event.usage?.totalTokens,
						inputTokens: event.usage?.inputTokens,
						outputTokens: event.usage?.outputTokens,
						duration: totalMs,
						firstTokenMs: event.timing?.firstTokenMs,
						tokensPerSecond: tps,
					});
					// Also store input tokens on the preceding user message
					if (event.usage?.inputTokens) {
						const userMsg = [...allMessages]
							.reverse()
							.find((m) => m.role === "user" && m.id !== lastAssistant.id);
						if (userMsg) {
							updateMessageMetadata(userMsg.id, {
								inputTokens: event.usage.inputTokens,
							});
						}
					}
				}
				setSessionStatus("idle");
				setStreamingContent("");
				streamContentRef.current = "";
				currentRequestIdRef.current = null;
			} else if (event.type === "error") {
				message.error(`Stream error: ${event.error}`);
				setSessionStatus("idle");
				setStreamingContent("");
				streamContentRef.current = "";
				currentRequestIdRef.current = null;
			}
		});
		return unsubscribe;
	}, [
		addMessage,
		appendStreamingContent,
		setSessionStatus,
		setStreamingContent,
		updateLastMessage,
		updateMessageToolCall,
		updateMessageMetadata,
		message,
	]);

	/**
	 * Send message in direct chat mode (via IPC to main process)
	 * Automatically includes MCP tools when servers are connected.
	 */
	const sendDirectMessage = useCallback(
		async (
			content: string,
			options?: { searchEngine?: string; searchConfigs?: SearchConfig[] },
		) => {
			const active = getEffectiveModel();
			if (!active) {
				message.error(
					"No active model selected. Please configure a model in Settings → Models.",
				);
				return;
			}

			const { provider, model } = active;
			currentModelInfoRef.current = {
				model: model.id,
				providerPreset: provider.preset,
				providerName: provider.name,
			};

			setSessionStatus("preparing");
			setStreamingContent("");
			streamContentRef.current = "";

			const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
			currentRequestIdRef.current = requestId;

			try {
				// Read latest messages from store (not closure) to handle retry correctly
				const currentMessages = useChatStore.getState().messages;
				let chatHistory = currentMessages
					.filter(
						(m) =>
							(m.role === "user" || m.role === "assistant") &&
							m.content.length > 0,
					)
					.map((m) => ({
						role: m.role as "user" | "assistant",
						content: m.content,
					}));

				// Apply context count limit
				if (
					sessionSettings.contextCount !== -1 &&
					chatHistory.length > sessionSettings.contextCount
				) {
					chatHistory = chatHistory.slice(-sessionSettings.contextCount);
				}

				const history: Array<{
					role: "user" | "assistant" | "system";
					content: string;
				}> = chatHistory;

				// Inject system prompt: session override > model custom > global default
				const envInfo = await getEnvInfoForPrompt();
				console.debug("[useChat] System prompt cwd:", envInfo?.cwd);
				const baseSystemPrompt = sessionSettings.systemPrompt
					? sessionSettings.systemPrompt
					: model.systemPrompt;
				const systemPrompt = buildSystemPrompt(baseSystemPrompt, envInfo);
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
							if (
								searchResult.success &&
								searchResult.data &&
								searchResult.data.results.length > 0
							) {
								const searchContext = searchResult.data.results
									.map(
										(r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.snippet}`,
									)
									.join("\n\n");
								// Insert after system prompt (index 0) so global prompt stays first
								history.splice(1, 0, {
									role: "system",
									content: `The following are web search results for the user's query "${content}" (searched via ${searchResult.data.provider} in ${searchResult.data.searchTimeMs}ms). Use these results to provide an informed, up-to-date response. Cite sources when relevant.\n\n${searchContext}`,
								});
							}
						} catch (searchError) {
							console.warn(
								"[useChat] Search failed, continuing without search results:",
								searchError,
							);
						}
					}
				}

				// Fetch MCP tools for function calling (skip if permission mode is "none")
				const isToolsDisabled = sessionSettings.toolPermissionMode === "none";
				const mcpResult = isToolsDisabled
					? { toolHint: "" }
					: await fetchMcpTools();
				const tools = isToolsDisabled ? undefined : mcpResult.tools;
				const toolMapping = isToolsDisabled ? undefined : mcpResult.toolMapping;
				if (mcpResult.toolHint) {
					history[0].content += mcpResult.toolHint;
				}

				const toolPermission = isToolsDisabled
					? undefined
					: {
							mode: sessionSettings.toolPermissionMode,
							authorizedTools: sessionSettings.authorizedTools,
						};

				await modelService.chatCompletion({
					requestId,
					baseUrl: provider.baseUrl,
					apiKey: provider.apiKey,
					model: model.id,
					messages: history,
					tools,
					toolMapping,
					toolPermission,
					toolCallMode:
						sessionSettings.toolCallMode === "prompt" ? "prompt" : "function",
					temperature: sessionSettings.temperatureEnabled
						? sessionSettings.temperature
						: undefined,
					maxTokens: sessionSettings.maxTokens,
					topP: sessionSettings.topPEnabled ? sessionSettings.topP : undefined,
					stream: sessionSettings.streamingEnabled,
					providerPreset: provider.preset,
					extraParams: parseCustomParams(sessionSettings.customParams),
					conversationId:
						useChatStore.getState().currentConversationId ?? undefined,
				});
			} catch (error: unknown) {
				console.error("[useChat] Failed to send direct message:", error);
				const errorMsg = error instanceof Error ? error.message : String(error);
				message.error(`Error: ${errorMsg}`);
				setSessionStatus("idle");
				setStreamingContent("");
				streamContentRef.current = "";
				currentRequestIdRef.current = null;
			}
		},
		[
			message,
			setSessionStatus,
			setStreamingContent,
			getEffectiveModel,
			sessionSettings,
		],
	);

	/**
	 * Send message using Agent mode
	 * Uses the active model with MCP tools and an agentic system prompt.
	 * The LLM service handles multi-round tool execution automatically.
	 */
	const sendAgentMessage = useCallback(
		async (_content: string, _agentId?: string) => {
			const active = getEffectiveModel();
			if (!active) {
				message.error(
					"No active model selected. Please configure a model in Settings → Models.",
				);
				return;
			}

			const { provider, model } = active;
			currentModelInfoRef.current = {
				model: model.id,
				providerPreset: provider.preset,
				providerName: provider.name,
			};

			setSessionStatus("preparing");
			setStreamingContent("");
			streamContentRef.current = "";

			const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
			currentRequestIdRef.current = requestId;

			try {
				const currentMessages = useChatStore.getState().messages;
				let chatHistory = currentMessages
					.filter(
						(m) =>
							(m.role === "user" || m.role === "assistant") &&
							m.content.length > 0,
					)
					.map((m) => ({
						role: m.role as "user" | "assistant",
						content: m.content,
					}));

				// Apply context count limit
				if (
					sessionSettings.contextCount !== -1 &&
					chatHistory.length > sessionSettings.contextCount
				) {
					chatHistory = chatHistory.slice(-sessionSettings.contextCount);
				}

				const history: {
					role: "user" | "assistant" | "system";
					content: string;
				}[] = chatHistory;

				// Build agentic system prompt
				const envInfo = await getEnvInfoForPrompt();
				const baseAgentPrompt = sessionSettings.systemPrompt
					? sessionSettings.systemPrompt
					: model.systemPrompt;
				const basePrompt = buildSystemPrompt(baseAgentPrompt, envInfo);
				const agentPrompt = `${basePrompt}\n\n--- Agent Mode ---\nYou are operating in Agent mode. You have access to tools and should proactively use them to accomplish the user's task. Break down complex tasks into steps, use available tools as needed, and provide comprehensive results. Think step by step and take action autonomously.`;

				history.unshift({
					role: "system",
					content: agentPrompt,
				});

				// Fetch MCP tools for function calling (skip if permission mode is "none")
				const isToolsDisabled = sessionSettings.toolPermissionMode === "none";
				const mcpResult = isToolsDisabled
					? { toolHint: "" }
					: await fetchMcpTools();
				const tools = isToolsDisabled ? undefined : mcpResult.tools;
				const toolMapping = isToolsDisabled ? undefined : mcpResult.toolMapping;
				if (mcpResult.toolHint) {
					history[0].content += mcpResult.toolHint;
				}

				const toolPermission = isToolsDisabled
					? undefined
					: {
							mode: sessionSettings.toolPermissionMode,
							authorizedTools: sessionSettings.authorizedTools,
						};

				await modelService.chatCompletion({
					requestId,
					baseUrl: provider.baseUrl,
					apiKey: provider.apiKey,
					model: model.id,
					messages: history,
					tools,
					toolMapping,
					toolPermission,
					toolCallMode:
						sessionSettings.toolCallMode === "prompt" ? "prompt" : "function",
					temperature: sessionSettings.temperatureEnabled
						? sessionSettings.temperature
						: undefined,
					maxTokens: sessionSettings.maxTokens,
					topP: sessionSettings.topPEnabled ? sessionSettings.topP : undefined,
					stream: sessionSettings.streamingEnabled,
					providerPreset: provider.preset,
					extraParams: parseCustomParams(sessionSettings.customParams),
					conversationId:
						useChatStore.getState().currentConversationId ?? undefined,
				});
			} catch (error: unknown) {
				console.error("[useChat] Failed to send agent message:", error);
				const errorMsg = error instanceof Error ? error.message : String(error);
				message.error(`Error: ${errorMsg}`);
				setSessionStatus("idle");
				setStreamingContent("");
				streamContentRef.current = "";
				currentRequestIdRef.current = null;
			}
		},
		[
			message,
			setSessionStatus,
			setStreamingContent,
			getEffectiveModel,
			sessionSettings,
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

			const active = getEffectiveModel();
			if (!active) {
				message.error(
					"No active model selected. Please configure a model in Settings → Models.",
				);
				return;
			}

			const { provider, model } = active;
			currentModelInfoRef.current = {
				model: model.id,
				providerPreset: provider.preset,
				providerName: provider.name,
			};

			// 获取 skill 的系统提示词
			let skillSystemPrompt: string | null = null;
			try {
				skillSystemPrompt = await skillClient.getSystemPrompt(skillId);
			} catch {
				console.warn("[useChat] Failed to load skill system prompt");
			}

			setSessionStatus("preparing");
			setStreamingContent("");
			streamContentRef.current = "";

			const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
			currentRequestIdRef.current = requestId;

			try {
				const currentMessages = useChatStore.getState().messages;
				let chatHistory = currentMessages
					.filter(
						(m) =>
							(m.role === "user" || m.role === "assistant") &&
							m.content.length > 0,
					)
					.map((m) => ({
						role: m.role as "user" | "assistant",
						content: m.content,
					}));

				// Apply context count limit
				if (
					sessionSettings.contextCount !== -1 &&
					chatHistory.length > sessionSettings.contextCount
				) {
					chatHistory = chatHistory.slice(-sessionSettings.contextCount);
				}

				const history: {
					role: "user" | "assistant" | "system";
					content: string;
				}[] = chatHistory;

				// 构建系统提示词: 会话自定义 > 模型自定义 > 全局默认 + 环境上下文 + Skill 上下文
				const envInfo = await getEnvInfoForPrompt();
				const baseSkillPrompt = sessionSettings.systemPrompt
					? sessionSettings.systemPrompt
					: model.systemPrompt;
				const basePrompt = buildSystemPrompt(baseSkillPrompt, envInfo);
				const systemPrompt = skillSystemPrompt
					? `${basePrompt}\n\n--- Skill Context ---\n${skillSystemPrompt}`
					: basePrompt;

				history.unshift({
					role: "system",
					content: systemPrompt,
				});

				// Fetch MCP tools for function calling (skip if permission mode is "none")
				const isToolsDisabled = sessionSettings.toolPermissionMode === "none";
				const mcpResult = isToolsDisabled
					? { toolHint: "" }
					: await fetchMcpTools();
				const tools = isToolsDisabled ? undefined : mcpResult.tools;
				const toolMapping = isToolsDisabled ? undefined : mcpResult.toolMapping;
				if (mcpResult.toolHint) {
					history[0].content += mcpResult.toolHint;
				}

				const toolPermission = isToolsDisabled
					? undefined
					: {
							mode: sessionSettings.toolPermissionMode,
							authorizedTools: sessionSettings.authorizedTools,
						};

				await modelService.chatCompletion({
					requestId,
					baseUrl: provider.baseUrl,
					apiKey: provider.apiKey,
					model: model.id,
					messages: history,
					tools,
					toolMapping,
					toolPermission,
					toolCallMode:
						sessionSettings.toolCallMode === "prompt" ? "prompt" : "function",
					temperature: sessionSettings.temperatureEnabled
						? sessionSettings.temperature
						: undefined,
					maxTokens: sessionSettings.maxTokens,
					topP: sessionSettings.topPEnabled ? sessionSettings.topP : undefined,
					stream: sessionSettings.streamingEnabled,
					providerPreset: provider.preset,
					extraParams: parseCustomParams(sessionSettings.customParams),
					conversationId:
						useChatStore.getState().currentConversationId ?? undefined,
				});
			} catch (error: unknown) {
				console.error("[useChat] Failed to send skill message:", error);
				const errorMsg = error instanceof Error ? error.message : String(error);
				message.error(`Error: ${errorMsg}`);
				setSessionStatus("idle");
				setStreamingContent("");
				streamContentRef.current = "";
				currentRequestIdRef.current = null;
			}
		},
		[
			message,
			setSessionStatus,
			setStreamingContent,
			getEffectiveModel,
			sessionSettings,
		],
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
				const precedingUser = allMessages
					.slice(0, idx)
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

			const retryActive = getEffectiveModel();
			const assistantMessage: Message = {
				id: `assistant_${Date.now()}`,
				role: "assistant",
				content: "",
				timestamp: Date.now(),
				metadata: retryActive
					? {
							model: retryActive.model.id,
							providerPreset: retryActive.provider.preset,
							providerName: retryActive.provider.name,
						}
					: undefined,
			};
			addMessage(assistantMessage);

			await sendDirectMessage(userContent);
		},
		[addMessage, deleteMessagesFrom, sendDirectMessage, getEffectiveModel],
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
			const { currentConversationId, createConversation } =
				useChatStore.getState();
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

			const activeForMeta = getEffectiveModel();
			const assistantMessage: Message = {
				id: `assistant_${Date.now()}`,
				role: "assistant",
				content: "",
				timestamp: Date.now(),
				metadata: activeForMeta
					? {
							model: activeForMeta.model.id,
							providerPreset: activeForMeta.provider.preset,
							providerName: activeForMeta.provider.name,
						}
					: undefined,
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
			getEffectiveModel,
		],
	);

	const stopCurrentStream = useCallback(() => {
		if (currentRequestIdRef.current) {
			modelService.stopStream(currentRequestIdRef.current);
			currentRequestIdRef.current = null;
		}
		// Save any accumulated streaming content to the last message
		if (streamContentRef.current) {
			updateLastMessage(streamContentRef.current);
		}
		// Reset all streaming state — critical: the main process abort is silent
		// (no "done" event broadcast), so we must clean up here
		setSessionStatus("idle");
		setStreamingContent("");
		streamContentRef.current = "";
		// Persist messages to disk
		const { currentConversationId, persistMessages } = useChatStore.getState();
		if (currentConversationId) {
			persistMessages();
		}
	}, [setSessionStatus, setStreamingContent, updateLastMessage]);

	return {
		// State
		messages,
		input,
		sessionStatus,
		isStreaming,
		streamingContent,
		chatMode,
		selectedAgentId,
		selectedSkillId,
		sessionModelOverride,
		sessionSettings,
		availableTools,

		// Setters
		setInput,
		setChatMode,
		setSelectedAgentId,
		setSelectedSkillId,
		setSessionModelOverride,
		setSessionSettings,

		// Actions
		sendMessage,
		clearMessages,
		stopCurrentStream,
		retryMessage,
		editMessage,
		deleteMessage,
		getEffectiveModel,
		respondToApproval,
	};
}
