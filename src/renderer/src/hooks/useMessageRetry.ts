/**
 * useMessageRetry — the retry-from-message flow extracted from useChat.
 *
 * Preserves the user-vs-assistant truncation semantics:
 *   - If the retry target is an assistant message, walk BACK to the
 *     preceding user turn and re-send from there (deleting the old user
 *     bubble and everything after).
 *   - If the retry target is a user message, keep everything up to and
 *     including that user message (drop from that user onward — the
 *     re-add below reinstates the user turn) and re-send.
 *
 * The user + assistant placeholder pair is materialised *before* the
 * `sendAgentMessage` call so the bubble header reflects the pre-resolved
 * model / provider from the first frame (matching the sendMessage path).
 */
import { useCallback } from "react";
import type { Message } from "../stores/chatMessageStore";
import type { EffectiveProviderModelResolution } from "./useMessageModelResolution";

export interface RetryTargetPlan {
	userContent: string;
	deleteFromMessageId: string;
}

/**
 * Pure decision helper: given the messages list and a targetId, decide
 * *what* to truncate and *what content* to resend. Returns null when the
 * target can't be retried (unknown id or a tool message).
 */
export function planRetryFromMessage(
	messages: readonly Message[],
	messageId: string,
): RetryTargetPlan | null {
	const idx = messages.findIndex((m) => m.id === messageId);
	if (idx === -1) return null;
	const target = messages[idx];

	if (target.role === "user") {
		return {
			userContent: target.content,
			deleteFromMessageId: messageId,
		};
	}
	if (target.role === "assistant") {
		const precedingUser = messages
			.slice(0, idx)
			.reverse()
			.find((m) => m.role === "user");
		if (!precedingUser) return null;
		return {
			userContent: precedingUser.content,
			deleteFromMessageId: precedingUser.id,
		};
	}
	return null;
}

export interface UseMessageRetryOptions {
	getEffectiveModel: () => EffectiveProviderModelResolution | undefined;
	sendAgentMessage: (content: string) => Promise<void>;
	messageStoreApi: {
		getMessages: () => readonly Message[];
		addMessage: (msg: Message) => void;
		deleteMessagesFrom: (messageId: string) => void;
	};
	/** Injected for tests. */
	now?: () => number;
}

export interface UseMessageRetryResult {
	retryMessage: (messageId: string) => Promise<void>;
}

/**
 * Pure factory used by tests. The React hook wrapper just memoises.
 */
export function createRetryMessage(
	opts: UseMessageRetryOptions,
): (messageId: string) => Promise<void> {
	return async (messageId: string) => {
		const plan = planRetryFromMessage(
			opts.messageStoreApi.getMessages(),
			messageId,
		);
		if (!plan) return;

		opts.messageStoreApi.deleteMessagesFrom(plan.deleteFromMessageId);

		const ts = opts.now ? opts.now() : Date.now();
		const userMessage: Message = {
			id: `user_${ts}`,
			role: "user",
			content: plan.userContent,
			timestamp: ts,
		};
		opts.messageStoreApi.addMessage(userMessage);

		// Pre-resolve the active model so the assistant bubble header shows
		// the *real* provider from the first frame.
		const preResolved = opts.getEffectiveModel();
		const assistantMessage: Message = {
			id: `assistant_${ts}`,
			role: "assistant",
			content: "",
			timestamp: ts,
			metadata: {
				model: preResolved?.model.id ?? "agent",
				providerPreset: preResolved?.provider.preset ?? "anthropic",
				providerName: preResolved?.provider.name ?? "Agent runtime",
				modelSource: preResolved?.source,
				modelSourceLabel: preResolved?.sourceLabel,
			},
		};
		opts.messageStoreApi.addMessage(assistantMessage);

		await opts.sendAgentMessage(plan.userContent);
	};
}

export function useMessageRetry(
	opts: UseMessageRetryOptions,
): UseMessageRetryResult {
	const retryMessage = useCallback(
		(messageId: string) => createRetryMessage(opts)(messageId),
		[opts],
	);
	return { retryMessage };
}
