import { describe, expect, it, vi } from "vitest";
import type { Message } from "../../stores/chatMessageStore";
import {
	createRetryMessage,
	planRetryFromMessage,
} from "../useMessageRetry";
import type { EffectiveProviderModelResolution } from "../useMessageModelResolution";

function userMsg(id: string, content: string): Message {
	return { id, role: "user", content, timestamp: 1 };
}

function assistantMsg(id: string, content: string): Message {
	return { id, role: "assistant", content, timestamp: 2 };
}

function toolMsg(id: string): Message {
	return {
		id,
		role: "tool",
		content: "",
		timestamp: 3,
		type: "tool_use",
	} as Message;
}

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

describe("planRetryFromMessage", () => {
	it("returns the target user's content when retry targets a user turn", () => {
		const messages = [userMsg("u1", "hi"), assistantMsg("a1", "hello")];
		expect(planRetryFromMessage(messages, "u1")).toEqual({
			userContent: "hi",
			deleteFromMessageId: "u1",
		});
	});

	it("walks back to the preceding user when retry targets an assistant", () => {
		const messages = [
			userMsg("u1", "first"),
			assistantMsg("a1", "reply1"),
			userMsg("u2", "second"),
			assistantMsg("a2", "reply2"),
		];
		expect(planRetryFromMessage(messages, "a2")).toEqual({
			userContent: "second",
			deleteFromMessageId: "u2",
		});
	});

	it("returns null for an unknown id or a tool message", () => {
		const messages = [userMsg("u1", "hi"), toolMsg("t1")];
		expect(planRetryFromMessage(messages, "missing")).toBeNull();
		expect(planRetryFromMessage(messages, "t1")).toBeNull();
	});

	it("returns null when an assistant message has no preceding user", () => {
		const messages = [assistantMsg("a1", "orphan")];
		expect(planRetryFromMessage(messages, "a1")).toBeNull();
	});
});

describe("createRetryMessage", () => {
	function makeStub(initial: Message[]) {
		const store = [...initial];
		return {
			getMessages: () => store,
			addMessage: vi.fn((m: Message) => {
				store.push(m);
			}),
			deleteMessagesFrom: vi.fn((id: string) => {
				const idx = store.findIndex((m) => m.id === id);
				if (idx >= 0) store.splice(idx);
			}),
			readStore: () => store,
		};
	}

	it("retry from assistant truncates to the preceding user then re-sends", async () => {
		const stub = makeStub([
			userMsg("u1", "prev"),
			assistantMsg("a1", "old reply"),
		]);
		const sendAgentMessage = vi.fn(async () => undefined);
		const retry = createRetryMessage({
			getEffectiveModel: () => preResolved,
			sendAgentMessage,
			messageStoreApi: stub,
			now: () => 9999,
		});
		await retry("a1");
		expect(stub.deleteMessagesFrom).toHaveBeenCalledWith("u1");
		expect(sendAgentMessage).toHaveBeenCalledWith("prev");
		// Two adds: fresh user turn + assistant placeholder
		expect(stub.addMessage).toHaveBeenCalledTimes(2);
		const [firstAdd, secondAdd] = stub.addMessage.mock.calls.map(
			(c) => c[0] as Message,
		);
		expect(firstAdd.role).toBe("user");
		expect(firstAdd.content).toBe("prev");
		expect(firstAdd.id).toBe("user_9999");
		expect(secondAdd.role).toBe("assistant");
		expect(secondAdd.metadata?.model).toBe("claude-3");
		expect(secondAdd.metadata?.providerPreset).toBe("anthropic");
		expect(secondAdd.metadata?.providerName).toBe("Anthropic");
		expect(secondAdd.metadata?.modelSource).toBe("session");
		expect(secondAdd.metadata?.modelSourceLabel).toBe("会话覆盖");
	});

	it("retry from a user message truncates from that user then re-sends", async () => {
		const stub = makeStub([
			userMsg("u1", "keep"),
			assistantMsg("a1", "keep-a"),
			userMsg("u2", "drop"),
			assistantMsg("a2", "drop-a"),
		]);
		const sendAgentMessage = vi.fn(async () => undefined);
		const retry = createRetryMessage({
			getEffectiveModel: () => preResolved,
			sendAgentMessage,
			messageStoreApi: stub,
		});
		await retry("u2");
		expect(stub.deleteMessagesFrom).toHaveBeenCalledWith("u2");
		expect(sendAgentMessage).toHaveBeenCalledWith("drop");
	});

	it("falls back to sentinel metadata when getEffectiveModel returns undefined", async () => {
		const stub = makeStub([userMsg("u1", "hi")]);
		const sendAgentMessage = vi.fn(async () => undefined);
		const retry = createRetryMessage({
			getEffectiveModel: () => undefined,
			sendAgentMessage,
			messageStoreApi: stub,
			now: () => 1,
		});
		await retry("u1");
		const assistant = stub.readStore().find((m) => m.role === "assistant");
		expect(assistant?.metadata).toEqual({
			model: "agent",
			providerPreset: "anthropic",
			providerName: "Agent runtime",
			modelSource: undefined,
			modelSourceLabel: undefined,
		});
	});

	it("no-ops when the messageId is unknown", async () => {
		const stub = makeStub([userMsg("u1", "hi")]);
		const sendAgentMessage = vi.fn(async () => undefined);
		const retry = createRetryMessage({
			getEffectiveModel: () => undefined,
			sendAgentMessage,
			messageStoreApi: stub,
		});
		await retry("nope");
		expect(stub.deleteMessagesFrom).not.toHaveBeenCalled();
		expect(stub.addMessage).not.toHaveBeenCalled();
		expect(sendAgentMessage).not.toHaveBeenCalled();
	});
});
