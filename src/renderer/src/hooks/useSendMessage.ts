/**
 * useSendMessage — the top-level `sendMessage()` composer flow.
 *
 * Extracted from useChat. Responsibilities:
 *   - Snapshot composer content, honour edit-in-place truncation.
 *   - Persist chatMode change onto conversation metadata.
 *   - Auto-name the conversation if the current name is a placeholder.
 *   - Materialise the user turn + assistant placeholder with the
 *     pre-resolved model metadata (so the bubble header shows the right
 *     provider from frame 0).
 *   - Route to `sendSkillMessage` or `sendAgentMessage` based on selection.
 *   - Clear one-shot messageModelOverride in `finally`.
 *
 * Pure sub-helpers exposed for tests:
 *   - `deriveConversationName`     — placeholder → auto-name string
 *   - `createUserTurnPair`         — user turn + assistant placeholder
 *   - `chooseSkillOrAgentPath`     — decision helper
 */
import { useCallback } from "react";
import type { ActiveModelSelection } from "../types/models";
import type { Message } from "../stores/chatMessageStore";
import type { EffectiveProviderModelResolution } from "./useMessageModelResolution";
import { clearMessageModelOverrideAfterSend } from "./useMessageModelResolution";
import type { SearchConfig } from "../types/search";

export type ChatMode = "agent";

export interface SendMessageOptions {
	mode?: ChatMode;
	content?: string;
	agentId?: string;
	skillId?: string;
	commandName?: string;
	searchEngine?: string;
	searchConfigs?: SearchConfig[];
	attachmentIds?: string[];
}

/** Placeholder titles a fresh conversation may hold before its first send. */
export const CONVERSATION_NAME_PLACEHOLDERS: readonly string[] = [
	"新对话",
	"远端对话",
];

/**
 * If the current name is a known placeholder, derive an auto-name from
 * the first user message (first 15 chars, whitespace-normalised). Returns
 * `null` when the current name should be preserved.
 */
export function deriveConversationName(
	currentName: string | undefined | null,
	content: string,
): string | null {
	if (!currentName) return null;
	if (!CONVERSATION_NAME_PLACEHOLDERS.includes(currentName)) return null;
	const autoName = content.replace(/\s+/g, " ").trim().slice(0, 15);
	return autoName || null;
}

export interface CreateUserTurnPairInput {
	content: string;
	attachmentIds?: string[];
	preResolvedModel: EffectiveProviderModelResolution | undefined;
	now?: () => number;
}

export function createUserTurnPair({
	content,
	attachmentIds,
	preResolvedModel,
	now,
}: CreateUserTurnPairInput): [Message, Message] {
	const ts = now ? now() : Date.now();
	const userMessage: Message = {
		id: `user_${ts}`,
		role: "user",
		content,
		timestamp: ts,
		metadata: attachmentIds?.length ? { attachmentIds } : undefined,
	};
	const assistantMessage: Message = {
		id: `assistant_${ts}`,
		role: "assistant",
		content: "",
		timestamp: ts,
		metadata: {
			model: preResolvedModel?.model.id ?? "agent",
			providerPreset: preResolvedModel?.provider.preset ?? "anthropic",
			providerName: preResolvedModel?.provider.name ?? "Agent runtime",
			modelSource: preResolvedModel?.source,
			modelSourceLabel: preResolvedModel?.sourceLabel,
		},
	};
	return [userMessage, assistantMessage];
}

export interface ChooseSkillOrAgentInput {
	options?: SendMessageOptions;
	selectedSkillId: string | null;
	selectedCommandName: string | null;
}

export type SendPath =
	| { kind: "skill"; skillId: string; commandName?: string }
	| { kind: "agent"; agentId?: string };

export function chooseSkillOrAgentPath({
	options,
	selectedSkillId,
	selectedCommandName,
}: ChooseSkillOrAgentInput): SendPath {
	const effectiveSkillId = options?.skillId || selectedSkillId || undefined;
	const effectiveCommandName =
		options?.commandName || selectedCommandName || undefined;
	if (effectiveSkillId) {
		return {
			kind: "skill",
			skillId: effectiveSkillId,
			...(effectiveCommandName ? { commandName: effectiveCommandName } : {}),
		};
	}
	return { kind: "agent", agentId: options?.agentId || undefined };
}

export interface ConversationRef {
	id: string;
	name?: string;
	/**
	 * We only care whether the persisted mode equals "agent" for the
	 * write-back decision, so accept any string here. `useChat` passes
	 * the raw `ConversationSummary.chatMode` (which historically can be
	 * "direct" or "agent"); we only re-write when it drifts.
	 */
	chatMode?: string;
}

export interface UseSendMessageOptions {
	pipeline: {
		sendAgentMessage: (
			content: string,
			agentId?: string,
			options?: {
				searchEngine?: string;
				searchConfigs?: SearchConfig[];
				attachmentIds?: string[];
			},
		) => Promise<void>;
		sendSkillMessage: (
			content: string,
			skillId?: string,
			commandName?: string,
			options?: {
				searchEngine?: string;
				searchConfigs?: SearchConfig[];
				attachmentIds?: string[];
			},
		) => Promise<void>;
	};
	chatStoreApi: {
		getCurrentConversationId: () => string | null;
		getConversation: (id: string) => ConversationRef | null;
		updateConversationMetadata: (
			id: string,
			meta: { chatMode?: ChatMode },
		) => Promise<void>;
		renameConversation: (id: string, name: string) => Promise<void>;
	};
	messageStoreApi: {
		addMessage: (msg: Message) => void;
		deleteMessagesFrom: (id: string) => void;
	};
	chatInputStoreApi: {
		getValue: () => string;
		clear: () => void;
	};
	selectionState: {
		getSelectedAgentId: () => string | null;
		getSelectedSkillId: () => string | null;
		getSelectedCommandName: () => string | null;
		setSelectedCommandName: (name: string | null) => void;
		editingMessageIdRef: { current: string | null };
	};
	messageModelOverride: ActiveModelSelection | null;
	setMessageModelOverride: (sel: ActiveModelSelection | null) => void;
	getEffectiveModel: () => EffectiveProviderModelResolution | undefined;
	now?: () => number;
}

export interface UseSendMessageResult {
	sendMessage: (options?: SendMessageOptions) => Promise<void>;
}

/**
 * Pure factory used by the tests. The React hook wrapper just memoises.
 */
export function createSendMessage(
	opts: UseSendMessageOptions,
): (options?: SendMessageOptions) => Promise<void> {
	return async (options?: SendMessageOptions) => {
		const content = (
			options?.content ?? opts.chatInputStoreApi.getValue()
		).trim();
		if (!content) return;

		const mode: ChatMode = "agent";

		if (opts.selectionState.editingMessageIdRef.current) {
			opts.messageStoreApi.deleteMessagesFrom(
				opts.selectionState.editingMessageIdRef.current,
			);
			opts.selectionState.editingMessageIdRef.current = null;
		}

		const convId = opts.chatStoreApi.getCurrentConversationId();
		if (!convId) return;

		const conv = opts.chatStoreApi.getConversation(convId);
		if (conv && conv.chatMode !== mode) {
			opts.chatStoreApi
				.updateConversationMetadata(convId, { chatMode: mode })
				.catch(() => {});
		}

		const autoName = deriveConversationName(conv?.name, content);
		if (autoName) {
			opts.chatStoreApi.renameConversation(convId, autoName).catch(() => {});
		}

		const preResolved = opts.getEffectiveModel();
		const [userMessage, assistantMessage] = createUserTurnPair({
			content,
			attachmentIds: options?.attachmentIds,
			preResolvedModel: preResolved,
			now: opts.now,
		});
		opts.messageStoreApi.addMessage(userMessage);
		opts.chatInputStoreApi.clear();
		opts.messageStoreApi.addMessage(assistantMessage);

		const path = chooseSkillOrAgentPath({
			options,
			selectedSkillId: opts.selectionState.getSelectedSkillId(),
			selectedCommandName: opts.selectionState.getSelectedCommandName(),
		});

		try {
			if (path.kind === "skill") {
				await opts.pipeline.sendSkillMessage(
					content,
					path.skillId,
					path.commandName,
					{
						searchEngine: options?.searchEngine,
						searchConfigs: options?.searchConfigs,
						attachmentIds: options?.attachmentIds,
					},
				);
				// One-shot semantics: clear commandName so the next message
				// goes back to the default agent path unless the user picks
				// again in the slash panel.
				opts.selectionState.setSelectedCommandName(null);
				return;
			}
			await opts.pipeline.sendAgentMessage(
				content,
				path.agentId || opts.selectionState.getSelectedAgentId() || undefined,
				{
					searchEngine: options?.searchEngine,
					searchConfigs: options?.searchConfigs,
					attachmentIds: options?.attachmentIds,
				},
			);
		} finally {
			clearMessageModelOverrideAfterSend(
				opts.messageModelOverride,
				opts.setMessageModelOverride,
			);
		}
	};
}

export function useSendMessage(
	opts: UseSendMessageOptions,
): UseSendMessageResult {
	const sendMessage = useCallback(
		(options?: SendMessageOptions) => createSendMessage(opts)(options),
		[opts],
	);
	return { sendMessage };
}
