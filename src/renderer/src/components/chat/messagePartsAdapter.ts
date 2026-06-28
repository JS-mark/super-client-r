import type {
	CodeBlockMessagePart,
	DiffMessagePart,
	Message,
	MessagePart,
	MessagePartState,
	TextMessagePart,
	ToolCall,
	ToolMessagePart,
} from "@super-client/shared-types/chat";
import { sanitizeAssistantContent } from "../../lib/assistantContent";

const RAW_PROTOCOL_PATTERNS = [
	/<\|eom\|>/g,
	/^\s*tool_call>\s?.*$/gm,
];

export function stripRawProtocolText(content: string): string {
	let next = sanitizeAssistantContent(content);
	for (const pattern of RAW_PROTOCOL_PATTERNS) {
		next = next.replace(pattern, "");
	}
	return next.trim();
}

function nowFromMessage(message: Message): number {
	return message.timestamp || Date.now();
}

export function isAskUserQuestionToolCall(toolCall: ToolCall): boolean {
	// `toolCall.name` may arrive with an internal-MCP prefix (e.g.
	// `scp-agent-builtins__AskUserQuestion`) when invoked through the
	// unified LLM loop, or with a bare name when emitted by the Agent SDK
	// path. Strip the prefix before matching, and fall back to the
	// approval kind we stamp in `useChat.ts`.
	const lower = toolCall.name.toLowerCase();
	const bare = lower.includes("__") ? (lower.split("__").pop() ?? lower) : lower;
	return (
		bare === "askuserquestion" ||
		bare === "ask_user_question" ||
		toolCall.approval?.kind === "ask-user-question"
	);
}

function textPartsFromMessage(message: Message): MessagePart[] {
	const content = stripRawProtocolText(message.content || "");
	if (!content) return [];
	const ts = nowFromMessage(message);
	const state = message.type === "error" ? "error" : "complete";
	return splitFencedContentToParts(message.id, content, ts, state);
}

function stateFromToolCall(toolCall: ToolCall): MessagePartState {
	switch (toolCall.status) {
		case "awaiting_approval":
			return "requires-approval";
		case "pending":
			return "executing";
		case "success":
			return "complete";
		case "error":
			return "error";
		default:
			return "complete";
	}
}

function toolPartFromMessage(message: Message): ToolMessagePart | null {
	if (!message.toolCall) return null;
	const { toolCall } = message;
	const ts = nowFromMessage(message);
	return {
		id: `${message.id}:tool:${toolCall.id}`,
		type: "tool",
		state: stateFromToolCall(toolCall),
		createdAt: ts,
		updatedAt: ts,
		toolUseId: toolCall.id,
		name: toolCall.name,
		input: toolCall.input,
		output: toolCall.result,
		duration: toolCall.duration,
		approval: toolCall.approval,
		...(toolCall.error
			? {
					error: {
						messageKey: "runtime.toolError",
						details: toolCall.error,
					},
				}
			: {}),
	};
}

export function messageToParts(message: Message): MessagePart[] {
	if (message.parts?.length) return message.parts;

	const parts: MessagePart[] = [];

	parts.push(...textPartsFromMessage(message));

	const toolPart = toolPartFromMessage(message);
	if (toolPart) parts.push(toolPart);

	return parts;
}

function splitFencedContentToParts(
	messageId: string,
	content: string,
	ts: number,
	state: MessagePartState,
): MessagePart[] {
	const fencePattern = /```([^\n`]*)\n([\s\S]*?)```/g;
	const parts: MessagePart[] = [];
	let cursor = 0;
	let index = 0;
	for (const match of content.matchAll(fencePattern)) {
		const start = match.index ?? 0;
		const before = content.slice(cursor, start).trim();
		if (before) {
			parts.push(textPart(messageId, index++, before, ts, state));
		}
		const info = (match[1] || "").trim();
		const code = match[2] ?? "";
		if (isDiffLanguage(info)) {
			parts.push(diffPart(messageId, index++, code, ts, state));
		} else {
			parts.push(codePart(messageId, index++, info, code, ts, state));
		}
		cursor = start + match[0].length;
	}

	const tail = content.slice(cursor).trim();
	if (tail) {
		parts.push(textPart(messageId, index++, tail, ts, state));
	}
	if (parts.length === 0) {
		parts.push(textPart(messageId, 0, content, ts, state));
	}
	return parts;
}

function textPart(
	messageId: string,
	index: number,
	content: string,
	ts: number,
	state: MessagePartState,
): TextMessagePart {
	return {
		id: `${messageId}:text:${index}`,
		type: "text",
		state,
		createdAt: ts,
		updatedAt: ts,
		content,
	};
}

function codePart(
	messageId: string,
	index: number,
	info: string,
	content: string,
	ts: number,
	state: MessagePartState,
): CodeBlockMessagePart {
	const language = info.split(/\s+/)[0] || undefined;
	return {
		id: `${messageId}:code:${index}`,
		type: "code_block",
		state,
		createdAt: ts,
		updatedAt: ts,
		language,
		content,
		completeFence: true,
		lineCount: content ? content.split(/\r?\n/).length : 0,
	};
}

function diffPart(
	messageId: string,
	index: number,
	content: string,
	ts: number,
	state: MessagePartState,
): DiffMessagePart {
	const lines = content.split(/\r?\n/);
	return {
		id: `${messageId}:diff:${index}`,
		type: "diff",
		state,
		createdAt: ts,
		updatedAt: ts,
		valid: true,
		files: [
			{
				path: "changes.diff",
				status: "unknown",
				hunks: [
					{
						lines: lines.map((line) => ({
							type: line.startsWith("+")
								? "add"
								: line.startsWith("-")
									? "remove"
									: "context",
							content: line.replace(/^[+-]/, ""),
						})),
					},
				],
			},
		],
	};
}

function isDiffLanguage(info: string): boolean {
	const language = info.toLowerCase().split(/\s+/)[0];
	return language === "diff" || language === "patch";
}
