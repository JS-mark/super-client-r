/**
 * Chat 相关类型定义
 */

/** 聊天消息 */
export interface ChatMessage {
	id: string;
	role: "user" | "assistant" | "system";
	content: string;
	timestamp: number;
	model?: string;
}

/** 聊天历史 */
export interface ChatHistory {
	sessionId: string;
	messages: ChatMessage[];
	createdAt: number;
	updatedAt: number;
}

/** 持久化的聊天消息 */
export interface ChatMessagePersist {
	id: string;
	role: "user" | "assistant" | "system" | "tool";
	content: string;
	timestamp: number;
	type?: "text" | "tool_use" | "tool_result" | "error";
	toolCall?: {
		id: string;
		name: string;
		input: Record<string, unknown>;
		status: "pending" | "awaiting_approval" | "success" | "error";
		result?: unknown;
		error?: string;
		duration?: number;
	};
	metadata?: {
		model?: string;
		tokens?: number;
		inputTokens?: number;
		outputTokens?: number;
		duration?: number;
		firstTokenMs?: number;
		tokensPerSecond?: number;
		attachmentIds?: string[];
	};
}

/** 远程绑定 */
export interface RemoteBinding {
	botId: string;
	chatId: string;
	botName: string;
	platform: IMPlatform;
	boundAt: number;
}

/** 绑定远程请求 */
export interface BindRemoteRequest {
	conversationId: string;
	botId: string;
	chatId: string;
}

/** 远程 IM 消息 */
export interface RemoteIMMessage {
	conversationId: string;
	content: string;
	sender: { id: string; name: string };
	platform: IMPlatform;
	chatId: string;
	timestamp: number;
}

/** 远程聊天消息 */
export interface RemoteChatMessage {
	id: string;
	direction: "incoming" | "outgoing";
	content: string;
	sender: { id: string; name: string };
	platform: IMPlatform;
	timestamp: number;
}

/** 发送远程消息请求 */
export interface SendRemoteMessageRequest {
	conversationId: string;
	content: string;
}

/** 对话摘要 */
export interface ConversationSummary {
	id: string;
	name: string;
	createdAt: number;
	updatedAt: number;
	messageCount: number;
	preview: string;
	remote?: RemoteBinding;
}

/** 对话数据 */
export interface ConversationData extends ConversationSummary {
	messages: ChatMessagePersist[];
}

/** 追加消息请求 */
export interface AppendMessageRequest {
	conversationId: string;
	message: ChatMessagePersist;
}

/** 更新消息请求 */
export interface UpdateMessageRequest {
	conversationId: string;
	messageId: string;
	updates: Partial<ChatMessagePersist>;
}

/** 保存消息请求 */
export interface SaveMessagesRequest {
	conversationId: string;
	messages: ChatMessagePersist[];
}

/** 重命名对话请求 */
export interface RenameConversationRequest {
	conversationId: string;
	name: string;
}

/** IM 平台 */
export type IMPlatform = "dingtalk" | "lark" | "telegram";
