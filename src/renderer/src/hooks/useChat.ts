import { App } from "antd";
import { useCallback, useState } from "react";
import { useChatStore, type Message, type ToolCall } from "../stores/chatStore";
import { useModelStore } from "../stores/modelStore";
import { agentClient } from "../services/agent/agentService";
import { skillClient } from "../services/skill/skillService";
import { mcpClient } from "../services/mcp/mcpService";
import { ClaudeService } from "../services/llm/claude";

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
		setStreaming,
		setStreamingContent,
		appendStreamingContent,
		clearMessages,
	} = useChatStore();

	const { models } = useModelStore();

	const [input, setInput] = useState("");
	const [chatMode, setChatMode] = useState<ChatMode>("direct");
	const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
	const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
	const [selectedMcpServerId, setSelectedMcpServerId] = useState<string | null>(null);

	/**
	 * Send message in direct chat mode (Claude API)
	 */
	const sendDirectMessage = useCallback(async (content: string) => {
		const activeModel = models.find((m) => m.enabled);
		if (!activeModel) {
			message.error("No enabled model found. Please configure a model first.");
			return;
		}

		if (!activeModel.config.apiKey) {
			message.error("API Key missing for the selected model.");
			return;
		}

		setStreaming(true);
		setStreamingContent("");

		try {
			const claude = new ClaudeService(activeModel.config.apiKey);
			const history = messages.map((m) => ({
				role: m.role as "user" | "assistant",
				content: m.content,
			}));

			await claude.streamMessage(
				[...history, { role: "user", content }],
				activeModel.name || "claude-3-5-sonnet-20241022",
				(text) => {
					appendStreamingContent(text);
				},
			);
		} catch (error: any) {
			console.error("[useChat] Failed to send direct message:", error);
			message.error(`Error: ${error.message}`);
		} finally {
			setStreaming(false);
		}
	}, [models, messages, message, appendStreamingContent, setStreaming, setStreamingContent]);

	/**
	 * Send message using Agent
	 */
	const sendAgentMessage = useCallback(async (content: string, agentId?: string) => {
		if (!agentId) {
			message.error("No agent selected");
			return;
		}

		setStreaming(true);
		setStreamingContent("");

		try {
			// Create agent session
			const session = await agentClient.createSession({
				apiKey: "", // Will be configured in settings
				model: "claude-3-5-sonnet-20241022",
			});

			// Send message
			await agentClient.sendMessage(session.id, content);

			// Listen for stream events
			const unsubscribe = agentClient.onStreamEvent((event) => {
				if (event.type === "text") {
					appendStreamingContent(String(event.data));
				} else if (event.type === "tool_use") {
					const toolData = event.data as { id: string; name: string; input: Record<string, unknown> };
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
					const resultData = event.data as { tool_use_id: string; content: unknown; is_error?: boolean };
					const toolMsg = messages.find((m) => m.toolCall?.id === resultData.tool_use_id);
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

			// Timeout to cleanup
			setTimeout(() => {
				unsubscribe();
				setStreaming(false);
			}, 60000);
		} catch (error: any) {
			console.error("[useChat] Failed to send agent message:", error);
			message.error(`Error: ${error.message}`);
			setStreaming(false);
		}
	}, [message, messages, addMessage, updateMessageToolCall, appendStreamingContent, setStreaming, setStreamingContent]);

	/**
	 * Execute Skill
	 */
	const executeSkill = useCallback(async (content: string, skillId?: string, toolName?: string) => {
		if (!skillId) {
			message.error("No skill selected");
			return;
		}

		// Get skill info
		const skill = await skillClient.getSkill(skillId).catch(() => null);
		if (!skill) {
			message.error("Skill not found");
			return;
		}

		// If no tool name, use first available
		if (!toolName && skill.tools && skill.tools.length > 0) {
			toolName = skill.tools[0].name;
		}

		if (!toolName) {
			message.error("No tool available for this skill");
			return;
		}

		// Add tool use message
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

			// Update with result
			updateMessageToolCall(toolMessage.id, {
				status: result.success ? "success" : "error",
				result: result.output,
				error: result.error,
				duration,
			});

			if (!result.success) {
				message.error(`Skill execution failed: ${result.error}`);
			}
		} catch (error: any) {
			console.error("[useChat] Failed to execute skill:", error);
			updateMessageToolCall(toolMessage.id, {
				status: "error",
				error: error.message,
			});
			message.error(`Error: ${error.message}`);
		}
	}, [addMessage, updateMessageToolCall, message]);

	/**
	 * Execute MCP Tool
	 */
	const executeMcpTool = useCallback(async (content: string, serverId?: string, toolName?: string) => {
		if (!serverId) {
			message.error("No MCP server selected");
			return;
		}

		// Get server tools
		const tools = await mcpClient.getTools(serverId).catch(() => []);
		if (!toolName && tools.length > 0) {
			toolName = tools[0].name;
		}

		if (!toolName) {
			message.error("No tool available");
			return;
		}

		// Add tool use message
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

			// Update with result
			updateMessageToolCall(toolMessage.id, {
				status: "success",
				result,
				duration,
			});
		} catch (error: any) {
			console.error("[useChat] Failed to execute MCP tool:", error);
			updateMessageToolCall(toolMessage.id, {
				status: "error",
				error: error.message,
			});
			message.error(`Error: ${error.message}`);
		}
	}, [addMessage, updateMessageToolCall, message]);

	/**
	 * Main send message function
	 */
	const sendMessage = useCallback(async (options?: ChatOptions) => {
		if (!input.trim()) return;

		const mode = options?.mode || chatMode;
		const content = input.trim();

		// Add user message
		const userMessage: Message = {
			id: `user_${Date.now()}`,
			role: "user",
			content,
			timestamp: Date.now(),
		};
		addMessage(userMessage);
		setInput("");

		// Add assistant message placeholder for streaming modes
		if (mode === "direct" || mode === "agent") {
			const assistantMessage: Message = {
				id: `assistant_${Date.now()}`,
				role: "assistant",
				content: "",
				timestamp: Date.now(),
			};
			addMessage(assistantMessage);
		}

		// Route to appropriate handler
		switch (mode) {
			case "agent":
				await sendAgentMessage(content, options?.agentId || selectedAgentId || undefined);
				break;
			case "skill":
				await executeSkill(
					content,
					options?.skillId || selectedSkillId || undefined,
					options?.skillToolName
				);
				break;
			case "mcp":
				await executeMcpTool(
					content,
					options?.mcpServerId || selectedMcpServerId || undefined,
					options?.mcpToolName
				);
				break;
			case "direct":
			default:
				await sendDirectMessage(content);
				break;
		}
	}, [
		input,
		chatMode,
		selectedAgentId,
		selectedSkillId,
		selectedMcpServerId,
		addMessage,
		setInput,
		sendDirectMessage,
		sendAgentMessage,
		executeSkill,
		executeMcpTool,
	]);

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
	};
}
