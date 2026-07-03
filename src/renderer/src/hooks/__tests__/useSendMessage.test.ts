import { describe, expect, it, vi } from "vitest";
import type { Message } from "../../stores/chatMessageStore";
import {
	chooseSkillOrAgentPath,
	createSendMessage,
	createUserTurnPair,
	deriveConversationName,
	type ConversationRef,
	type UseSendMessageOptions,
} from "../useSendMessage";
import type { EffectiveProviderModelResolution } from "../useMessageModelResolution";
import type { ActiveModelSelection } from "../../types/models";

const preResolved: EffectiveProviderModelResolution = {
	provider: {
		id: "p1",
		name: "Anthropic",
		preset: "anthropic",
		baseUrl: "",
		apiKey: "",
		enabled: true,
		tested: false,
		createdAt: 1,
		updatedAt: 1,
		models: [],
	},
	model: {
		id: "claude-3",
		name: "Claude 3",
		enabled: true,
		capabilities: [],
		category: "chat",
		supportsStreaming: true,
	},
	source: "session",
	sourceLabel: "会话覆盖",
} as EffectiveProviderModelResolution;

describe("deriveConversationName", () => {
	it("renames the default 新对话 placeholder to a 15-char excerpt", () => {
		expect(deriveConversationName("新对话", "  hello world  ")).toBe(
			"hello world",
		);
		expect(
			deriveConversationName(
				"新对话",
				"this is a very long first message that will get sliced",
			),
		).toBe("this is a very ");
	});

	it("also renames 远端对话", () => {
		expect(deriveConversationName("远端对话", "hi")).toBe("hi");
	});

	it("returns null for a user-chosen name", () => {
		expect(deriveConversationName("My chat", "hello")).toBeNull();
	});

	it("returns null when input is empty after trimming", () => {
		expect(deriveConversationName("新对话", "   ")).toBeNull();
	});

	it("returns null when currentName is falsy", () => {
		expect(deriveConversationName(null, "hi")).toBeNull();
		expect(deriveConversationName(undefined, "hi")).toBeNull();
		expect(deriveConversationName("", "hi")).toBeNull();
	});
});

describe("createUserTurnPair", () => {
	it("copies attachmentIds onto the user message metadata", () => {
		const [user] = createUserTurnPair({
			content: "hi",
			attachmentIds: ["att1", "att2"],
			preResolvedModel: preResolved,
			now: () => 100,
		});
		expect(user.metadata?.attachmentIds).toEqual(["att1", "att2"]);
	});

	it("leaves metadata undefined when no attachments", () => {
		const [user] = createUserTurnPair({
			content: "hi",
			preResolvedModel: preResolved,
			now: () => 100,
		});
		expect(user.metadata).toBeUndefined();
	});

	it("populates assistant placeholder from preResolvedModel (source/sourceLabel)", () => {
		const [, assistant] = createUserTurnPair({
			content: "hi",
			preResolvedModel: preResolved,
			now: () => 100,
		});
		expect(assistant.metadata).toEqual({
			model: "claude-3",
			providerPreset: "anthropic",
			providerName: "Anthropic",
			modelSource: "session",
			modelSourceLabel: "会话覆盖",
		});
	});

	it("uses sentinel metadata when no model resolves", () => {
		const [, assistant] = createUserTurnPair({
			content: "hi",
			preResolvedModel: undefined,
			now: () => 1,
		});
		expect(assistant.metadata).toEqual({
			model: "agent",
			providerPreset: "anthropic",
			providerName: "Agent runtime",
			modelSource: undefined,
			modelSourceLabel: undefined,
		});
	});
});

describe("chooseSkillOrAgentPath", () => {
	it("prefers explicit options.skillId over state", () => {
		expect(
			chooseSkillOrAgentPath({
				options: { skillId: "opt-skill", commandName: "opt-cmd" },
				selectedSkillId: "state-skill",
				selectedCommandName: "state-cmd",
			}),
		).toEqual({
			kind: "skill",
			skillId: "opt-skill",
			commandName: "opt-cmd",
		});
	});

	it("falls back to state when options are empty", () => {
		expect(
			chooseSkillOrAgentPath({
				selectedSkillId: "state-skill",
				selectedCommandName: null,
			}),
		).toEqual({ kind: "skill", skillId: "state-skill" });
	});

	it("returns agent path when no skill is selected", () => {
		expect(
			chooseSkillOrAgentPath({
				options: { agentId: "agent-x" },
				selectedSkillId: null,
				selectedCommandName: null,
			}),
		).toEqual({ kind: "agent", agentId: "agent-x" });
	});
});

// ─── integration-ish tests for createSendMessage ───────────────────────

function makeOpts(overrides: {
	conv?: ConversationRef | null;
	convId?: string | null;
	inputValue?: string;
	selectedSkillId?: string | null;
	selectedCommandName?: string | null;
	selectedAgentId?: string | null;
	messageModelOverride?: ActiveModelSelection | null;
	preResolved?: EffectiveProviderModelResolution | undefined;
	editingMessageId?: string | null;
} = {}) {
	const store: Message[] = [];
	const editingRef = { current: overrides.editingMessageId ?? null };
	const setSelectedCommandName = vi.fn();
	const setMessageModelOverride = vi.fn();
	const sendAgentMessage = vi.fn(async () => undefined);
	const sendSkillMessage = vi.fn(async () => undefined);
	const clear = vi.fn();
	const renameConversation = vi.fn(async () => undefined);
	const updateConversationMetadata = vi.fn(async () => undefined);
	const deleteMessagesFrom = vi.fn((id: string) => {
		const idx = store.findIndex((m) => m.id === id);
		if (idx >= 0) store.splice(idx);
	});
	const opts: UseSendMessageOptions = {
		pipeline: { sendAgentMessage, sendSkillMessage },
		chatStoreApi: {
			getCurrentConversationId: () =>
				overrides.convId === undefined ? "conv1" : overrides.convId,
			getConversation: () =>
				overrides.conv === undefined
					? { id: "conv1", name: "新对话", chatMode: "agent" }
					: overrides.conv,
			renameConversation,
			updateConversationMetadata,
		},
		messageStoreApi: {
			addMessage: (m: Message) => {
				store.push(m);
			},
			deleteMessagesFrom,
		},
		chatInputStoreApi: {
			getValue: () => overrides.inputValue ?? "",
			clear,
		},
		selectionState: {
			getSelectedAgentId: () => overrides.selectedAgentId ?? null,
			getSelectedSkillId: () => overrides.selectedSkillId ?? null,
			getSelectedCommandName: () => overrides.selectedCommandName ?? null,
			setSelectedCommandName,
			editingMessageIdRef: editingRef,
		},
		messageModelOverride: overrides.messageModelOverride ?? null,
		setMessageModelOverride,
		getEffectiveModel: () =>
			overrides.preResolved === undefined ? preResolved : overrides.preResolved,
		now: () => 42,
	};
	return {
		opts,
		store,
		editingRef,
		setSelectedCommandName,
		setMessageModelOverride,
		sendAgentMessage,
		sendSkillMessage,
		clear,
		renameConversation,
		updateConversationMetadata,
		deleteMessagesFrom,
	};
}

describe("createSendMessage", () => {
	it("auto-renames a 新对话 conversation on first send", async () => {
		const h = makeOpts({});
		const send = createSendMessage(h.opts);
		await send({ content: "hello world 12345" });
		expect(h.renameConversation).toHaveBeenCalledWith(
			"conv1",
			"hello world 123",
		);
	});

	it("preserves a custom conversation name", async () => {
		const h = makeOpts({
			conv: { id: "conv1", name: "My chat", chatMode: "agent" },
		});
		const send = createSendMessage(h.opts);
		await send({ content: "hi" });
		expect(h.renameConversation).not.toHaveBeenCalled();
	});

	it("copies attachmentIds onto the user message", async () => {
		const h = makeOpts({});
		const send = createSendMessage(h.opts);
		await send({ content: "hi", attachmentIds: ["a1", "a2"] });
		const user = h.store.find((m) => m.role === "user");
		expect(user?.metadata?.attachmentIds).toEqual(["a1", "a2"]);
	});

	it("assistant placeholder metadata carries source/sourceLabel from resolved model", async () => {
		const h = makeOpts({});
		const send = createSendMessage(h.opts);
		await send({ content: "hi" });
		const assistant = h.store.find((m) => m.role === "assistant");
		expect(assistant?.metadata?.modelSource).toBe("session");
		expect(assistant?.metadata?.modelSourceLabel).toBe("会话覆盖");
	});

	it("clears one-shot messageModelOverride in finally after successful send", async () => {
		const h = makeOpts({
			messageModelOverride: { providerId: "p", modelId: "m" },
		});
		const send = createSendMessage(h.opts);
		await send({ content: "hi" });
		expect(h.setMessageModelOverride).toHaveBeenCalledWith(null);
	});

	it("clears one-shot messageModelOverride even if the pipeline throws", async () => {
		const h = makeOpts({
			messageModelOverride: { providerId: "p", modelId: "m" },
		});
		h.sendAgentMessage.mockRejectedValueOnce(new Error("boom"));
		const send = createSendMessage(h.opts);
		await expect(send({ content: "hi" })).rejects.toThrow("boom");
		expect(h.setMessageModelOverride).toHaveBeenCalledWith(null);
	});

	it("routes to sendSkillMessage when a skill is selected and clears commandName afterward", async () => {
		const h = makeOpts({
			selectedSkillId: "sk-1",
			selectedCommandName: "run",
		});
		const send = createSendMessage(h.opts);
		await send({ content: "hi" });
		expect(h.sendSkillMessage).toHaveBeenCalledWith(
			"hi",
			"sk-1",
			"run",
			expect.any(Object),
		);
		expect(h.sendAgentMessage).not.toHaveBeenCalled();
		expect(h.setSelectedCommandName).toHaveBeenCalledWith(null);
	});

	it("falls back to sendAgentMessage when no skill is selected", async () => {
		const h = makeOpts({});
		const send = createSendMessage(h.opts);
		await send({ content: "hi" });
		expect(h.sendAgentMessage).toHaveBeenCalled();
		expect(h.sendSkillMessage).not.toHaveBeenCalled();
	});

	it("early-returns on empty content and does nothing", async () => {
		const h = makeOpts({ inputValue: "   " });
		const send = createSendMessage(h.opts);
		await send();
		expect(h.sendAgentMessage).not.toHaveBeenCalled();
		expect(h.renameConversation).not.toHaveBeenCalled();
		expect(h.store).toHaveLength(0);
	});

	it("early-returns when there is no current conversation", async () => {
		const h = makeOpts({ convId: null });
		const send = createSendMessage(h.opts);
		await send({ content: "hi" });
		expect(h.sendAgentMessage).not.toHaveBeenCalled();
	});

	it("truncates from the editing message id when set", async () => {
		const h = makeOpts({ editingMessageId: "user_old" });
		const send = createSendMessage(h.opts);
		await send({ content: "hi" });
		expect(h.deleteMessagesFrom).toHaveBeenCalledWith("user_old");
		expect(h.editingRef.current).toBeNull();
	});

	it("persists chatMode when the conversation's mode drifts", async () => {
		const h = makeOpts({
			conv: {
				id: "conv1",
				name: "test",
				chatMode: undefined as unknown as "agent",
			},
		});
		const send = createSendMessage(h.opts);
		await send({ content: "hi" });
		expect(h.updateConversationMetadata).toHaveBeenCalledWith("conv1", {
			chatMode: "agent",
		});
	});
});
