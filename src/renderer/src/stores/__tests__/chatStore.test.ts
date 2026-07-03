import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
	ConversationSummary,
	RemoteBinding,
} from "../../types/electron";
import type { SessionMeta } from "@super-client/shared-types/project";
import { useChatMessageStore } from "../chatMessageStore";
import { useChatStore } from "../chatStore";
import { useFileArtifactStore } from "../fileArtifactStore";
import { useSessionListStore } from "../sessionListStore";

const remoteBinding: RemoteBinding = {
	botId: "bot-1",
	chatId: "chat-1",
	botName: "Bot One",
	platform: "telegram",
	boundAt: 123,
};

const mockMeta = (overrides: Partial<SessionMeta>): SessionMeta => ({
	id: "s-1",
	projectId: null,
	name: "Session",
	chatMode: "agent",
	createdAt: 1,
	updatedAt: 2,
	messageCount: 0,
	...overrides,
});

const mockConversation = (
	overrides: Partial<ConversationSummary>,
): ConversationSummary => ({
	id: "s-1",
	name: "Session",
	createdAt: 1,
	updatedAt: 2,
	messageCount: 0,
	preview: "",
	workspaceId: "default",
	chatMode: "agent",
	...overrides,
});

function setupElectronMock() {
	const sessionsDelete = vi.fn();
	const readMessages = vi.fn();
	const unbind = vi.fn();
	(window as any).electron = {
		...(window as any).electron,
		sessions: {
			...(window as any).electron?.sessions,
			delete: sessionsDelete,
			readMessages,
		},
		remoteChat: {
			...(window as any).electron?.remoteChat,
			unbind,
		},
	};
	return { sessionsDelete, readMessages, unbind };
}

beforeEach(() => {
	vi.clearAllMocks();
	useChatStore.setState({
		conversations: [],
		currentConversationId: null,
		isLoadingConversations: false,
	});
	useSessionListStore.setState({
		casual: [],
		byProject: {},
		currentSessionId: null,
		loaded: false,
	});
	useChatMessageStore.getState().clearMessages();
	useChatMessageStore.getState().setHasOlderMessages(false);
	useFileArtifactStore.setState({ artifacts: {}, changeSets: {} });
});

describe("deleteConversation", () => {
	it("deletes a remote-bound session before unbinding it", async () => {
		const { sessionsDelete, unbind } = setupElectronMock();
		const calls: string[] = [];
		sessionsDelete.mockImplementation(async () => {
			calls.push("delete");
			expect(unbind).not.toHaveBeenCalled();
			return {
				success: true,
				data: {
					deleted: true,
					tombstone: {
						id: "remote-1",
						kind: "session",
						deletedAt: 10,
						reason: "user-delete",
						remoteBinding,
					},
				},
			};
		});
		unbind.mockImplementation(async () => {
			calls.push("unbind");
			return { success: true };
		});

		useSessionListStore.setState({
			casual: [mockMeta({ id: "remote-1", remote: remoteBinding })],
		});
		useChatStore.setState({
			conversations: [
				mockConversation({ id: "remote-1", remote: remoteBinding }),
			],
		});
		useFileArtifactStore.setState({
			artifacts: { "remote-1": [] },
			changeSets: { "remote-1": [] },
		});

		await useChatStore.getState().deleteConversation("remote-1");

		expect(calls).toEqual(["delete", "unbind"]);
		expect(sessionsDelete).toHaveBeenCalledWith("remote-1");
		expect(unbind).toHaveBeenCalledWith("remote-1");
		expect(useSessionListStore.getState().casual).toEqual([]);
		expect(useChatStore.getState().conversations).toEqual([]);
		expect(useFileArtifactStore.getState().artifacts["remote-1"]).toBeUndefined();
		expect(
			useFileArtifactStore.getState().changeSets["remote-1"],
		).toBeUndefined();
	});

	it("does not unbind non-remote sessions", async () => {
		const { sessionsDelete, unbind } = setupElectronMock();
		sessionsDelete.mockResolvedValueOnce({ success: true });

		useSessionListStore.setState({
			casual: [mockMeta({ id: "local-1" })],
		});
		useChatStore.setState({
			conversations: [mockConversation({ id: "local-1" })],
		});

		await useChatStore.getState().deleteConversation("local-1");

		expect(sessionsDelete).toHaveBeenCalledWith("local-1");
		expect(unbind).not.toHaveBeenCalled();
		expect(useSessionListStore.getState().casual).toEqual([]);
		expect(useChatStore.getState().conversations).toEqual([]);
	});

	it("does not unbind a remote session when tombstone delete fails", async () => {
		const { sessionsDelete, unbind } = setupElectronMock();
		sessionsDelete.mockResolvedValueOnce({ success: false, error: "boom" });

		useSessionListStore.setState({
			casual: [mockMeta({ id: "remote-fail", remote: remoteBinding })],
		});
		useChatStore.setState({
			conversations: [
				mockConversation({ id: "remote-fail", remote: remoteBinding }),
			],
		});

		await useChatStore.getState().deleteConversation("remote-fail");

		expect(sessionsDelete).toHaveBeenCalledWith("remote-fail");
		expect(unbind).not.toHaveBeenCalled();
		expect(useSessionListStore.getState().casual).toHaveLength(1);
		expect(useChatStore.getState().conversations).toEqual([]);
	});
});
