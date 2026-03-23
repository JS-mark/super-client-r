import { App } from "antd";
import { t } from "i18next";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SessionSettings } from "../components/chat/ChatSettingsModal";
import { DEFAULT_SESSION_SETTINGS } from "../components/chat/ChatSettingsModal";
import {
	BROWSER_INSTRUCTIONS,
	buildSystemPrompt,
	CLEAR_INSTRUCTIONS,
	type EnvInfo,
	KNOWLEDGE_INSTRUCTIONS,
	TOOLS_INSTRUCTIONS,
	USER_CONFIG_INSTRUCTIONS,
} from "../prompt";
import { agentSDKClient } from "../services/agent/agentSDKService";
import { chatHistoryService } from "../services/chatHistoryService";
import { mcpClient } from "../services/mcp/mcpService";
import { modelService } from "../services/modelService";
import { searchService } from "../services/search/searchService";
import { skillClient } from "../services/skill/skillService";
import { type Message, useChatStore } from "../stores/chatStore";
import { useMcpStore } from "../stores/mcpStore";
import { useModelStore } from "../stores/modelStore";
import type { ActiveModelSelection } from "../types/models";
import type { SearchConfig } from "../types/search";

export type {
	CustomParam,
	SessionSettings,
	ToolCallMode,
	ToolPermissionMode,
} from "../components/chat/ChatSettingsModal";
export { DEFAULT_SESSION_SETTINGS } from "../components/chat/ChatSettingsModal";

export type ChatMode = "direct" | "agent";

export interface ChatOptions {
	mode?: ChatMode;
	agentId?: string;
	skillId?: string;
	commandName?: string;
	searchEngine?: string;
	searchConfigs?: SearchConfig[];
	attachmentIds?: string[];
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

			// Build context-aware tool instructions based on available servers/tools
			const serverIds = new Set(mcpTools.map((t) => t.serverId));
			const allToolNames = new Set(mcpTools.map((t) => t.tool.name));
			const hints: string[] = [
				`\n\nYou have access to the following tools and SHOULD actively use them when the user's request can benefit from them: ${toolNames}. Do not say you cannot access files, databases, or the web if a relevant tool is available — use the tool instead.`,
				CLEAR_INSTRUCTIONS,
				TOOLS_INSTRUCTIONS,
			];
			if (serverIds.has("@scp/browser")) {
				hints.push(BROWSER_INSTRUCTIONS);
			}
			if (allToolNames.has("knowledge_base_search")) {
				hints.push(KNOWLEDGE_INSTRUCTIONS);
			}
			if (allToolNames.has("request_user_config")) {
				hints.push(USER_CONFIG_INSTRUCTIONS);
			}
			const toolHint = hints.join("\n");
			return { tools, toolMapping, toolHint };
		}
	} catch (err) {
		console.warn("[useChat] Failed to fetch MCP tools:", err);
	}
	return { toolHint: "" };
}

/**
 * Fetch tools defined by a specific skill and build function calling format.
 * Uses `skill:{skillId}` as serverId convention to distinguish from MCP tools.
 */
async function fetchSkillTools(skillId: string): Promise<{
	tools: Array<{
		type: "function";
		function: {
			name: string;
			description: string;
			parameters: Record<string, unknown>;
		};
	}>;
	toolMapping: Record<string, { serverId: string; toolName: string }>;
}> {
	try {
		const allSkillTools = await skillClient.getAllTools();
		const skillTools = allSkillTools.filter((t) => t.skillId === skillId);
		const tools: Array<{
			type: "function";
			function: {
				name: string;
				description: string;
				parameters: Record<string, unknown>;
			};
		}> = [];
		const toolMapping: Record<string, { serverId: string; toolName: string }> =
			{};
		for (const { skillId: sid, tool } of skillTools) {
			const prefixedName = `skill-${sid}__${tool.name}`;
			tools.push({
				type: "function",
				function: {
					name: prefixedName,
					description: tool.description || "",
					parameters: tool.inputSchema || { type: "object", properties: {} },
				},
			});
			toolMapping[prefixedName] = {
				serverId: `skill:${sid}`,
				toolName: tool.name,
			};
		}
		return { tools, toolMapping };
	} catch (err) {
		console.warn("[useChat] Failed to fetch skill tools:", err);
		return { tools: [], toolMapping: {} };
	}
}

/**
 * Fetch tools from ALL enabled skills (not filtered by skillId).
 * Used by direct/agent modes so Claude can access skill tools globally.
 */
async function fetchAllSkillTools(): Promise<{
	tools: Array<{
		type: "function";
		function: {
			name: string;
			description: string;
			parameters: Record<string, unknown>;
		};
	}>;
	toolMapping: Record<string, { serverId: string; toolName: string }>;
}> {
	try {
		const allSkillTools = await skillClient.getAllTools();
		const tools: Array<{
			type: "function";
			function: {
				name: string;
				description: string;
				parameters: Record<string, unknown>;
			};
		}> = [];
		const toolMapping: Record<string, { serverId: string; toolName: string }> =
			{};
		for (const { skillId, tool } of allSkillTools) {
			const prefixedName = `skill-${skillId}__${tool.name}`;
			tools.push({
				type: "function",
				function: {
					name: prefixedName,
					description: tool.description || "",
					parameters: tool.inputSchema || { type: "object", properties: {} },
				},
			});
			toolMapping[prefixedName] = {
				serverId: `skill:${skillId}`,
				toolName: tool.name,
			};
		}
		return { tools, toolMapping };
	} catch (err) {
		console.warn("[useChat] Failed to fetch all skill tools:", err);
		return { tools: [], toolMapping: {} };
	}
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
let cachedEnvInfo: EnvInfo | undefined;

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
	const editingMessageIdRef = useRef<string | null>(null);
	const [chatMode, setChatMode] = useState<ChatMode>("direct");
	const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
	const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
	const [selectedCommandName, setSelectedCommandName] = useState<string | null>(
		null,
	);

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
		async (toolCallId: string, approved: boolean, updatedInput?: Record<string, unknown>) => {
			// Optimistic update: immediately reflect in UI
			const toolMsgId = `tool_${toolCallId}`;
			if (approved) {
				updateMessageToolCall(toolMsgId, {
					status: "pending",
					...(updatedInput ? { result: updatedInput } : {}),
				});
			} else {
				updateMessageToolCall(toolMsgId, {
					status: "error",
					error: "Tool call rejected by user",
				});
			}
			try {
				if (isAgentSDKRequestRef.current) {
					await agentSDKClient.resolvePermission(toolCallId, approved, updatedInput);
				} else {
					await window.electron.llm.toolApprovalResponse(
						toolCallId,
						approved,
					);
				}
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

				// Also load skill tools when a skill is selected
				if (selectedSkillId) {
					try {
						const skillTools = await skillClient.getAllTools();
						const filtered = skillTools.filter(
							(t) => t.skillId === selectedSkillId,
						);
						for (const { skillId, tool } of filtered) {
							const prefixedName = `skill-${skillId}__${tool.name}`;
							tools.push({
								prefixedName,
								displayName: `${skillId}/${tool.name}`,
							});
						}
					} catch {
						// Skill tools loading failure is non-fatal
					}
				}

				setAvailableTools(tools);
			} catch {
				setAvailableTools([]);
			}
		};
		loadTools();
	}, [selectedSkillId]);

	const currentRequestIdRef = useRef<string | null>(null);
	const agentSDKSessionIdRef = useRef<string | null>(null);
	const isAgentSDKRequestRef = useRef(false);
	const streamContentRef = useRef("");
	const currentModelInfoRef = useRef<{
		model: string;
		providerPreset: string;
		providerName: string;
	} | null>(null);

	// Restore Agent SDK session when conversation changes
	const currentConversationId = useChatStore(
		(s) => s.currentConversationId,
	);
	useEffect(() => {
		// 从 ConversationSummary 恢复 agentSDKSessionId 和 chatMode
		const conv = useChatStore
			.getState()
			.conversations.find((c) => c.id === currentConversationId);
		agentSDKSessionIdRef.current = conv?.agentSDKSessionId ?? null;
		isAgentSDKRequestRef.current = false;
		// Only restore chatMode when the conversation has a persisted mode.
		// New conversations have no chatMode yet — the caller (handleNewChat /
		// handleNewAgentChat) already sets the desired mode, so we must not
		// overwrite it with a "direct" fallback.
		if (conv?.chatMode) {
			setChatMode(conv.chatMode);
		}
	}, [currentConversationId, setChatMode]);

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

	// Subscribe to Agent SDK stream events (separate channel from LLM events)
	useEffect(() => {
		const unsubscribe = agentSDKClient.onStreamEvent((event) => {
			// Only process events for the current request
			if (event.requestId !== currentRequestIdRef.current) return;
			// Only handle events when the current request is an Agent SDK request
			if (!isAgentSDKRequestRef.current) return;

			switch (event.type) {
				case "init": {
					if (event.sessionId) {
						agentSDKSessionIdRef.current = event.sessionId;
						// Tag the current assistant message with the session ID
						const msgs = useChatStore.getState().messages;
						const lastAssistant = msgs[msgs.length - 1];
						if (lastAssistant?.role === "assistant") {
							updateMessageMetadata(lastAssistant.id, {
								agentSDKSessionId: event.sessionId,
							});
						}
						// 持久化到 conversation metadata
						const convId =
							useChatStore.getState().currentConversationId;
						if (convId) {
							chatHistoryService
								.updateConversationMetadata(convId, {
									agentSDKSessionId: event.sessionId,
								})
								.catch(() => {});
						}
					}
					setSessionStatus("streaming");
					break;
				}

				case "chunk": {
					if (event.content) {
						if (useChatStore.getState().sessionStatus === "preparing") {
							setSessionStatus("streaming");
						}
						streamContentRef.current += event.content;
						appendStreamingContent(event.content);
					}
					break;
				}

				case "assistant": {
					// Full assistant message — update the last message with complete content
					if (event.content) {
						updateLastMessage(event.content);
						streamContentRef.current = "";
						setStreamingContent("");
					}
					// Update usage metadata if provided
					if (event.usage) {
						const msgs = useChatStore.getState().messages;
						const lastAssistant = msgs[msgs.length - 1];
						if (lastAssistant?.role === "assistant") {
							updateMessageMetadata(lastAssistant.id, {
								inputTokens: event.usage.inputTokens,
								outputTokens: event.usage.outputTokens,
							});
						}
					}
					break;
				}

				case "tool_use_summary": {
					// Finalize any accumulated streaming content
					if (streamContentRef.current) {
						updateLastMessage(streamContentRef.current);
						streamContentRef.current = "";
						setStreamingContent("");
					}

					setSessionStatus("tool_calling");

					// Add a tool message showing the summary
					const toolId = `agent_tool_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
					const toolMessage: Message = {
						id: `tool_${toolId}`,
						role: "tool",
						content: event.toolSummary || "Tool execution",
						timestamp: Date.now(),
						type: "tool_use",
						toolCall: {
							id: toolId,
							name: event.toolSummary?.split("(")[0]?.trim() || "tool",
							input: {},
							status: "success",
						},
					};
					addMessage(toolMessage);

					// Add a new empty assistant message for the next stream
					const modelInfo = currentModelInfoRef.current;
					const nextAssistant: Message = {
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
					addMessage(nextAssistant);
					setSessionStatus("streaming");
					break;
				}

				case "permission_request": {
					if (!event.permissionRequest) break;

					// Finalize any accumulated streaming content
					if (streamContentRef.current) {
						updateLastMessage(streamContentRef.current);
						streamContentRef.current = "";
						setStreamingContent("");
					}

					setSessionStatus("tool_calling");

					const perm = event.permissionRequest;
					// Add a tool message with awaiting_approval status
					const permToolMessage: Message = {
						id: `tool_${perm.toolUseId}`,
						role: "tool",
						content: `Permission required: ${perm.displayName || perm.toolName}`,
						timestamp: Date.now(),
						type: "tool_use",
						toolCall: {
							id: perm.toolUseId,
							name: perm.toolName,
							input: perm.toolInput || {},
							status: "awaiting_approval",
						},
					};
					addMessage(permToolMessage);
					break;
				}

				case "result": {
					// Finalize streaming content
					if (streamContentRef.current) {
						updateLastMessage(streamContentRef.current);
					}

					// Update metadata with final result data
					if (event.result) {
						const msgs = useChatStore.getState().messages;
						const lastAssistant = [...msgs]
							.reverse()
							.find((m) => m.role === "assistant");
						if (lastAssistant) {
							updateMessageMetadata(lastAssistant.id, {
								duration: event.result.durationMs,
								totalCostUsd: event.result.totalCostUsd,
								numTurns: event.result.numTurns,
								inputTokens: event.result.usage?.inputTokens,
								outputTokens: event.result.usage?.outputTokens,
								tokens:
									(event.result.usage?.inputTokens || 0) +
									(event.result.usage?.outputTokens || 0),
							});
						}
					}

					// Persist messages
					const { currentConversationId: convId, persistMessages } =
						useChatStore.getState();
					if (convId) persistMessages();

					// Reset state
					setSessionStatus("idle");
					setStreamingContent("");
					streamContentRef.current = "";
					currentRequestIdRef.current = null;
					isAgentSDKRequestRef.current = false;
					break;
				}

				case "error": {
					message.error(`Agent error: ${event.error}`);
					// Finalize any partial content
					if (streamContentRef.current) {
						updateLastMessage(streamContentRef.current);
					}
					setSessionStatus("idle");
					setStreamingContent("");
					streamContentRef.current = "";
					currentRequestIdRef.current = null;
					isAgentSDKRequestRef.current = false;
					break;
				}

				case "rate_limit": {
					message.warning(
						`Rate limited: ${event.error || "Please wait..."}`,
					);
					break;
				}

				case "status": {
					console.debug("[useChat] Agent SDK status:", event.status);
					break;
				}
			}
		});
		return unsubscribe;
	}, [
		addMessage,
		appendStreamingContent,
		setSessionStatus,
		setStreamingContent,
		updateLastMessage,
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
				console.log("[useChat] Search trigger check:", {
					searchEngine: options?.searchEngine,
					hasConfigs: !!options?.searchConfigs?.length,
				});
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
							message.warning(
								t("searchEngine.searchFailed", {
									ns: "chat",
									error:
										searchError instanceof Error
											? searchError.message
											: t("searchEngine.unknownError", { ns: "chat" }),
								}),
							);
						}
					}
				}

				// Fetch MCP tools for function calling (skip if permission mode is "none")
				const isToolsDisabled = sessionSettings.toolPermissionMode === "none";
				const mcpResult = isToolsDisabled
					? { toolHint: "" }
					: await fetchMcpTools();

				// Fetch all enabled skill tools and merge with MCP tools
				const skillResult = isToolsDisabled
					? { tools: [], toolMapping: {} }
					: await fetchAllSkillTools();

				const tools = isToolsDisabled
					? undefined
					: [...(mcpResult.tools || []), ...skillResult.tools];
				const toolMapping = isToolsDisabled
					? undefined
					: { ...(mcpResult.toolMapping || {}), ...skillResult.toolMapping };
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
					tools: tools && tools.length > 0 ? tools : undefined,
					toolMapping:
						toolMapping && Object.keys(toolMapping).length > 0
							? toolMapping
							: undefined,
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
					toolTimeout: sessionSettings.toolTimeout,
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
	 * Send message using Agent mode (via Agent SDK)
	 * Delegates to AgentSDKService which handles multi-turn tool execution,
	 * session management, and streaming internally.
	 */
	const sendAgentMessage = useCallback(
		async (content: string, _agentId?: string) => {
			isAgentSDKRequestRef.current = true;

			setSessionStatus("preparing");
			setStreamingContent("");
			streamContentRef.current = "";

			const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
			currentRequestIdRef.current = requestId;

			try {
				// Get workspace cwd for the current conversation
				const convId = useChatStore.getState().currentConversationId;
				let cwd: string | undefined;
				if (convId) {
					try {
						const res = await window.electron.chat.getWorkspaceDir(convId);
						if (res.success && res.data) cwd = res.data;
					} catch {
						// non-fatal
					}
				}

				// Gather connected MCP server IDs
				const connectedServers = useMcpStore.getState().getConnectedServers();
				const mcpServerNames = connectedServers.map((s) => s.id);

				// Agent SDK uses its own model config chain — do NOT pass chat model
				currentModelInfoRef.current = {
					model: "agent",
					providerPreset: "anthropic",
					providerName: "Agent SDK",
				};

				// Optional custom system prompt
				const customSystemPrompt = sessionSettings.systemPrompt || undefined;

				// Build agents map from selected team (Multi-Agent)
				let agents:
					| Record<
							string,
							{
								description: string;
								prompt: string;
								tools?: string[];
								disallowedTools?: string[];
								model?: string;
								maxTurns?: number;
							}
					  >
					| undefined;
				const teamId = useChatStore.getState().selectedTeamId;
				if (teamId) {
					try {
						const [profiles, teams] = await Promise.all([
							agentSDKClient.getAgentProfiles(),
							agentSDKClient.getAgentTeams(),
						]);
						const team = teams.find((t) => t.id === teamId);
						if (team && team.agents.length > 0) {
							agents = {};
							for (const profileId of team.agents) {
								const profile = profiles.find(
									(p) => p.id === profileId,
								);
								if (profile) {
									agents[profile.name] = {
										description: profile.description,
										prompt: profile.prompt,
										tools: profile.tools,
										disallowedTools:
											profile.disallowedTools,
										model: profile.model,
										maxTurns: profile.maxTurns,
									};
								}
							}
							if (Object.keys(agents).length === 0)
								agents = undefined;
						}
					} catch {
						// non-fatal: proceed without agents
					}
				}

				await agentSDKClient.createQuery(requestId, {
					prompt: content,
					cwd,
					systemPrompt: customSystemPrompt,
					resumeSessionId: agentSDKSessionIdRef.current ?? undefined,
					persistSession: true,
					includePartialMessages: true,
					mcpServerNames:
						mcpServerNames.length > 0 ? mcpServerNames : undefined,
					maxTurns: sessionSettings.maxTokens
						? undefined
						: undefined,
					permissionMode: "default",
					agents,
				});
			} catch (error: unknown) {
				console.error("[useChat] Failed to send agent message:", error);
				const errorMsg = error instanceof Error ? error.message : String(error);
				message.error(`Error: ${errorMsg}`);
				setSessionStatus("idle");
				setStreamingContent("");
				streamContentRef.current = "";
				currentRequestIdRef.current = null;
				isAgentSDKRequestRef.current = false;
			}
		},
		[message, setSessionStatus, setStreamingContent, sessionSettings],
	);

	/**
	 * Send message in skill mode (LLM streaming with skill systemPrompt injection)
	 */
	const sendSkillMessage = useCallback(
		async (content: string, skillId?: string, commandName?: string) => {
			if (!skillId) {
				message.error(t("noSkillSelected", { ns: "chat" }));
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

			// 获取提示词: command prompt > skill system prompt
			let skillSystemPrompt: string | null = null;
			try {
				if (commandName) {
					skillSystemPrompt = await skillClient.getCommandPrompt(
						skillId,
						commandName,
					);
				}
				if (!skillSystemPrompt) {
					skillSystemPrompt = await skillClient.getSystemPrompt(skillId);
				}
			} catch {
				console.warn("[useChat] Failed to load skill/command prompt");
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

				// Fetch skill tools and merge with MCP tools
				const skillToolsResult =
					skillId && !isToolsDisabled
						? await fetchSkillTools(skillId)
						: { tools: [], toolMapping: {} };

				const tools = isToolsDisabled
					? undefined
					: [...(mcpResult.tools || []), ...skillToolsResult.tools];
				const toolMapping = isToolsDisabled
					? undefined
					: {
							...(mcpResult.toolMapping || {}),
							...skillToolsResult.toolMapping,
						};

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
					tools: tools && tools.length > 0 ? tools : undefined,
					toolMapping:
						toolMapping && Object.keys(toolMapping).length > 0
							? toolMapping
							: undefined,
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
					toolTimeout: sessionSettings.toolTimeout,
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

			// Dispatch to the correct send function based on chat mode
			switch (chatMode) {
				case "agent":
					await sendAgentMessage(userContent);
					break;
				case "direct":
				default: {
					// Skill overlay on retry
					const skillId = selectedSkillId || undefined;
					if (skillId) {
						await sendSkillMessage(
							userContent,
							skillId,
							selectedCommandName || undefined,
						);
					} else {
						await sendDirectMessage(userContent);
					}
					break;
				}
			}
		},
		[
			addMessage,
			deleteMessagesFrom,
			sendDirectMessage,
			sendAgentMessage,
			sendSkillMessage,
			getEffectiveModel,
			chatMode,
			selectedSkillId,
			selectedCommandName,
		],
	);

	/**
	 * Edit a user message – populate input and mark for editing.
	 * Messages are only truncated when the user actually sends the edited content.
	 */
	const editMessage = useCallback(
		(messageId: string) => {
			const allMessages = useChatStore.getState().messages;
			const target = allMessages.find((m) => m.id === messageId);
			if (!target || target.role !== "user") return;

			editingMessageIdRef.current = messageId;
			setInput(target.content);
		},
		[setInput],
	);

	/**
	 * Main send message function
	 */
	const sendMessage = useCallback(
		async (options?: ChatOptions) => {
			const content = input.trim();
			if (!content) return;

			const mode = options?.mode || chatMode;

			// If editing a previous message, truncate from that point first
			if (editingMessageIdRef.current) {
				deleteMessagesFrom(editingMessageIdRef.current);
				editingMessageIdRef.current = null;
			}

			// Guard: conversation must exist (eager-created by handleNewConversation)
			const { currentConversationId: convId } = useChatStore.getState();
			if (!convId) return;

			// Persist chatMode to conversation metadata if changed
			const conv = useChatStore
				.getState()
				.conversations.find((c) => c.id === convId);
			if (conv?.chatMode !== mode) {
				chatHistoryService
					.updateConversationMetadata(convId, { chatMode: mode })
					.catch(() => {});
				useChatStore.setState((state) => ({
					conversations: state.conversations.map((c) =>
						c.id === convId ? { ...c, chatMode: mode } : c,
					),
				}));
			}

			const userMessage: Message = {
				id: `user_${Date.now()}`,
				role: "user",
				content,
				timestamp: Date.now(),
				metadata: options?.attachmentIds?.length
					? { attachmentIds: options.attachmentIds }
					: undefined,
			};
			addMessage(userMessage);
			setInput("");

			const activeForMeta = getEffectiveModel();
			const assistantMessage: Message = {
				id: `assistant_${Date.now()}`,
				role: "assistant",
				content: "",
				timestamp: Date.now(),
				metadata:
					mode === "agent"
						? {
								model: "agent",
								providerPreset: "anthropic",
								providerName: "Agent SDK",
							}
						: activeForMeta
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
				case "direct":
				default: {
					// Skill overlay: if a skill is selected, use sendSkillMessage; otherwise direct
					const skillId =
						options?.skillId || selectedSkillId || undefined;
					if (skillId) {
						await sendSkillMessage(
							content,
							skillId,
							options?.commandName ||
								selectedCommandName ||
								undefined,
						);
					} else {
						await sendDirectMessage(content, {
							searchEngine: options?.searchEngine,
							searchConfigs: options?.searchConfigs,
						});
					}
					break;
				}
			}
		},
		[
			input,
			chatMode,
			selectedAgentId,
			selectedSkillId,
			selectedCommandName,
			addMessage,
			deleteMessagesFrom,
			sendDirectMessage,
			sendAgentMessage,
			sendSkillMessage,
			getEffectiveModel,
		],
	);

	const stopCurrentStream = useCallback(() => {
		if (currentRequestIdRef.current) {
			if (isAgentSDKRequestRef.current) {
				agentSDKClient
					.interruptQuery(currentRequestIdRef.current)
					.catch((err) =>
						console.error("[useChat] interruptQuery failed:", err),
					);
			} else {
				modelService.stopStream(currentRequestIdRef.current);
			}
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
		isAgentSDKRequestRef.current = false;
		// Persist messages to disk
		const { currentConversationId, persistMessages } = useChatStore.getState();
		if (currentConversationId) {
			persistMessages();
		}
	}, [setSessionStatus, setStreamingContent, updateLastMessage]);

	// Mode is locked once the conversation has any messages
	const isModeLocked = messages.length > 0;

	return {
		// State
		messages,
		input,
		sessionStatus,
		isStreaming,
		streamingContent,
		chatMode,
		isModeLocked,
		selectedAgentId,
		selectedSkillId,
		selectedCommandName,
		sessionModelOverride,
		sessionSettings,
		availableTools,

		// Setters
		setInput,
		setChatMode,
		setSelectedAgentId,
		setSelectedSkillId,
		setSelectedCommandName,
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
