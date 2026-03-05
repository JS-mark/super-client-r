/**
 * Agent 相关类型定义
 */

/** Agent 会话配置 */
export interface AgentConfig {
	apiKey: string;
	model: string;
	maxTokens?: number;
	systemPrompt?: string;
	tools?: any[];
}

/** Agent 会话状态 */
export interface AgentSession {
	id: string;
	name: string;
	model: string;
	createdAt: number;
	status: "idle" | "running" | "stopped" | "error";
}

/** Agent 消息 */
export interface AgentMessage {
	id: string;
	sessionId: string;
	role: "user" | "assistant" | "system";
	content: string;
	timestamp: number;
	toolUse?: ToolUse[];
}

/** 工具使用信息 */
export interface ToolUse {
	id: string;
	name: string;
	input: Record<string, unknown>;
	result?: unknown;
	status: "pending" | "success" | "error";
}

/** Agent 流式事件 */
export interface AgentStreamEvent {
	type: "text" | "tool_use" | "tool_result" | "error" | "done";
	sessionId: string;
	data: unknown;
}
