import type {
	AgentHistoryMessage,
	PromptPart,
} from "@super-client/shared-types/agent-runtime";
import type { Message } from "../stores/chatMessageStore";
import { estimateTokensSync } from "./tokenizer";

export type ContextMode = "auto" | "compact" | "full";

export interface ContextBudgetInput {
	contextWindow: number | null;
	systemPromptTokens?: number;
	toolsTokens?: number;
	reserveRatio?: number;
}

export interface ContextBudgetResult {
	contextWindow: number | null;
	reserveTokens: number;
	overheadTokens: number;
	availableForMessages: number | null;
}

export interface ContextStrategyInput {
	messages: Message[];
	contextCount: number;
	contextMode: ContextMode;
	budget?: ContextBudgetInput;
	estimateTokens?: (text: string) => number;
	now?: () => number;
}

export interface ContextStrategyResult {
	messages: Message[];
	history: AgentHistoryMessage[];
	mode: ContextMode;
	strategy: "full" | "sliding" | "compact" | "summarized";
	estimatedTokens: number;
	budget: ContextBudgetResult;
	needsSummarization: boolean;
	summaryMessage?: Message;
	summaryInput?: string;
	omittedCount: number;
}

const DEFAULT_RESERVE_RATIO = 0.1;
const SUMMARY_MAX_CHARS = 12_000;

export function computeContextBudget(
	input: ContextBudgetInput,
): ContextBudgetResult {
	const contextWindow =
		typeof input.contextWindow === "number" && input.contextWindow > 0
			? Math.floor(input.contextWindow)
			: null;
	const systemPromptTokens = Math.max(0, input.systemPromptTokens ?? 0);
	const toolsTokens = Math.max(0, input.toolsTokens ?? 0);
	const overheadTokens = systemPromptTokens + toolsTokens;
	if (!contextWindow) {
		return {
			contextWindow: null,
			reserveTokens: 0,
			overheadTokens,
			availableForMessages: null,
		};
	}
	const reserveRatio = Math.min(
		0.9,
		Math.max(0, input.reserveRatio ?? DEFAULT_RESERVE_RATIO),
	);
	const reserveTokens = Math.ceil(contextWindow * reserveRatio);
	return {
		contextWindow,
		reserveTokens,
		overheadTokens,
		availableForMessages: Math.max(
			0,
			contextWindow - reserveTokens - overheadTokens,
		),
	};
}

function textFromMessage(message: Message): string {
	if (message.parts?.length) {
		const text = message.parts
			.filter((part) => !part.transient && part.type === "text")
			.map((part) => ("content" in part ? part.content : ""))
			.join("");
		if (text.trim()) return text;
	}
	return message.content ?? "";
}

export function summarizeMessagesText(
	messages: Message[],
	opts?: { maxChars?: number },
): string {
	const maxChars = Math.max(1, opts?.maxChars ?? SUMMARY_MAX_CHARS);
	const lines = messages
		.map((message) => {
			const text = textFromMessage(message).trim();
			if (!text) return "";
			return `${message.role}: ${text}`;
		})
		.filter(Boolean);
	const joined = lines.join("\n\n");
	if (joined.length <= maxChars) return joined;
	return `${joined.slice(0, maxChars).trimEnd()}\n[truncated]`;
}

export function messageToAgentHistory(
	message: Message,
): AgentHistoryMessage | null {
	if (message.role !== "user" && message.role !== "assistant") return null;
	const text = textFromMessage(message).trim();
	if (!text) return null;
	const content: PromptPart[] = [{ type: "text", text }];
	return { role: message.role, content };
}

export function messagesToAgentHistory(
	messages: Message[],
): AgentHistoryMessage[] {
	return messages
		.map((message) => messageToAgentHistory(message))
		.filter((message): message is AgentHistoryMessage => Boolean(message));
}

export function createSummaryMessage(
	summary: string,
	originalCount: number,
	originals: Message[],
	now: () => number = () => Date.now(),
): Message {
	const ts = now();
	const firstId = originals[0]?.id ?? "none";
	return {
		id: `context_summary_${ts}_${firstId}`,
		role: "assistant",
		type: "text",
		content: summary,
		timestamp: ts,
		metadata: {
			contextCompacted: {
				compacted: true,
				summary,
				originalCount,
				compactedAt: ts,
			},
		},
	};
}

function estimateMessagesTokens(
	messages: Message[],
	estimateTokens: (text: string) => number,
): number {
	return estimateTokens(summarizeMessagesText(messages));
}

function applyContextCount(messages: Message[], contextCount: number): Message[] {
	if (contextCount < 0) return messages;
	if (contextCount === 0) return [];
	return messages.slice(-contextCount);
}

function compactMessages(
	messages: Message[],
	now: () => number,
): {
	messages: Message[];
	summaryMessage?: Message;
	summaryInput?: string;
	omittedCount: number;
} {
	if (messages.length <= 2) {
		return { messages, omittedCount: 0 };
	}
	const keepCount = Math.max(2, Math.ceil(messages.length / 2));
	const originals = messages.slice(0, -keepCount);
	const recent = messages.slice(-keepCount);
	const summary = summarizeMessagesText(originals);
	const summaryMessage = createSummaryMessage(
		`Summary of ${originals.length} earlier messages:\n${summary}`,
		originals.length,
		originals,
		now,
	);
	return {
		messages: [summaryMessage, ...recent],
		summaryMessage,
		summaryInput: summary,
		omittedCount: originals.length,
	};
}

export function applyContextStrategy(
	input: ContextStrategyInput,
): ContextStrategyResult {
	const estimateTokens = input.estimateTokens ?? estimateTokensSync;
	const now = input.now ?? (() => Date.now());
	const budget = computeContextBudget(input.budget ?? { contextWindow: null });

	const countedMessages = applyContextCount(
		input.messages,
		input.contextCount,
	);
	const contextCountLimited = countedMessages.length !== input.messages.length;

	let selected = countedMessages;
	let strategy: ContextStrategyResult["strategy"] = contextCountLimited
		? "sliding"
		: "full";
	let summaryMessage: Message | undefined;
	let summaryInput: string | undefined;
	let omittedCount = input.messages.length - countedMessages.length;
	let needsSummarization = false;

	if (input.contextMode === "compact") {
		const compacted = compactMessages(countedMessages, now);
		selected = compacted.messages;
		summaryMessage = compacted.summaryMessage;
		summaryInput = compacted.summaryInput;
		omittedCount += compacted.omittedCount;
		strategy = compacted.summaryMessage ? "compact" : strategy;
		needsSummarization = Boolean(compacted.summaryMessage);
	} else if (input.contextMode === "auto") {
		const available = budget.availableForMessages;
		const estimated = estimateMessagesTokens(countedMessages, estimateTokens);
		if (available !== null && estimated > available && countedMessages.length > 2) {
			const compacted = compactMessages(countedMessages, now);
			selected = compacted.messages;
			summaryMessage = compacted.summaryMessage;
			summaryInput = compacted.summaryInput;
			omittedCount += compacted.omittedCount;
			strategy = compacted.summaryMessage ? "summarized" : strategy;
			needsSummarization = Boolean(compacted.summaryMessage);
		}
	}

	return {
		messages: selected,
		history: messagesToAgentHistory(selected),
		mode: input.contextMode,
		strategy,
		estimatedTokens: estimateMessagesTokens(selected, estimateTokens),
		budget,
		needsSummarization,
		summaryMessage,
		summaryInput,
		omittedCount,
	};
}
