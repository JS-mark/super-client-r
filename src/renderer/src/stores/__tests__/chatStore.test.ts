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
	const readMessagesPage = vi.fn();
	const unbind = vi.fn();
	(window as any).electron = {
		...(window as any).electron,
		sessions: {
			...(window as any).electron?.sessions,
			delete: sessionsDelete,
			readMessages,
			readMessagesPage,
		},
		remoteChat: {
			...(window as any).electron?.remoteChat,
			unbind,
		},
	};
	return { sessionsDelete, readMessages, readMessagesPage, unbind };
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

describe("deleteProjectConversationsLocally", () => {
	it("removes project conversations, clears their artifacts, and falls back from the current session", async () => {
		const { readMessagesPage } = setupElectronMock();
		const fallbackMessage = {
			id: "fallback-msg",
			role: "assistant" as const,
			content: "fallback history",
			timestamp: 42,
		};
		readMessagesPage.mockResolvedValueOnce({
			success: true,
			data: {
				messages: [fallbackMessage],
				total: 1,
				offset: 0,
				limit: 100,
				hasMore: false,
			},
		});

		useChatStore.setState({
			currentConversationId: "project-current",
			conversations: [
				mockConversation({
					id: "project-current",
					workspaceId: "project-1",
					updatedAt: 20,
				}),
				mockConversation({
					id: "project-other",
					workspaceId: "project-1",
					updatedAt: 10,
				}),
				mockConversation({
					id: "fallback",
					workspaceId: "default",
					updatedAt: 30,
				}),
				mockConversation({
					id: "archived-fallback",
					workspaceId: "default",
					updatedAt: 40,
					session: {
						id: "archived-fallback",
						workspaceId: "default",
						kind: "agent",
						planMode: "chat",
						attachmentIds: [],
						flags: { archived: true },
						createdAt: 1,
						updatedAt: 40,
					},
				}),
			],
		});
		useSessionListStore.setState({
			currentSessionId: "project-current",
			casual: [mockMeta({ id: "fallback", projectId: null, updatedAt: 30 })],
			byProject: {
				"project-1": [
					mockMeta({
						id: "project-current",
						projectId: "project-1",
						updatedAt: 20,
					}),
					mockMeta({
						id: "project-other",
						projectId: "project-1",
						updatedAt: 10,
					}),
				],
			},
		});
		useChatMessageStore.getState().setMessages([
			{
				id: "project-msg",
				role: "assistant",
				content: "running",
				timestamp: 1,
			},
		]);
		useChatMessageStore.getState().setSessionStatus("tool_calling");
		useChatMessageStore.getState().setStreamingContent("partial");
		useChatMessageStore.getState().setHasOlderMessages(true);
		useChatMessageStore.getState().setLoadingMessages(true);
		useChatMessageStore.getState().setLoadingOlderMessages(true);
		useFileArtifactStore.setState({
			artifacts: {
				"project-current": [
					{
						id: "artifact-current",
						conversationId: "project-current",
						messageId: "project-msg",
						path: "/tmp/current.txt",
						name: "current.txt",
						kind: "created",
						source: "tool",
						openTargets: [],
						policy: { canOpen: true, canReveal: true, canDiff: true },
					},
				],
				"project-other": [
					{
						id: "artifact-other",
						conversationId: "project-other",
						messageId: "project-msg",
						path: "/tmp/other.txt",
						name: "other.txt",
						kind: "created",
						source: "tool",
						openTargets: [],
						policy: { canOpen: true, canReveal: true, canDiff: true },
					},
				],
				fallback: [
					{
						id: "artifact-fallback",
						conversationId: "fallback",
						messageId: "fallback-msg",
						path: "/tmp/fallback.txt",
						name: "fallback.txt",
						kind: "read",
						source: "agent",
						openTargets: [],
						policy: { canOpen: true, canReveal: true, canDiff: false },
					},
				],
			},
			changeSets: {
				"project-current": [
					{
						id: "change-current",
						conversationId: "project-current",
						messageId: "project-msg",
						files: [],
						additions: 0,
						deletions: 0,
					},
				],
				"project-other": [
					{
						id: "change-other",
						conversationId: "project-other",
						messageId: "project-msg",
						files: [],
						additions: 0,
						deletions: 0,
					},
				],
				fallback: [
					{
						id: "change-fallback",
						conversationId: "fallback",
						messageId: "fallback-msg",
						files: [],
						additions: 0,
						deletions: 0,
					},
				],
			},
		});

		await useChatStore
			.getState()
			.deleteProjectConversationsLocally("project-1");

		expect(useChatStore.getState().conversations.map((c) => c.id)).toEqual([
			"fallback",
			"archived-fallback",
		]);
		expect(useChatStore.getState().currentConversationId).toBe("fallback");
		expect(useSessionListStore.getState().currentSessionId).toBe("fallback");
		expect(useSessionListStore.getState().byProject["project-1"]).toBeUndefined();
		expect(readMessagesPage).toHaveBeenCalledWith("fallback", {
			offset: 0,
			limit: 100,
		});
		expect(useChatMessageStore.getState().messages).toEqual([fallbackMessage]);
		expect(useChatMessageStore.getState().sessionStatus).toBe("idle");
		expect(useChatMessageStore.getState().isStreaming).toBe(false);
		expect(useChatMessageStore.getState().streamingContent).toBe("");
		expect(useChatMessageStore.getState().hasOlderMessages).toBe(false);
		expect(useChatMessageStore.getState().isLoadingMessages).toBe(false);
		expect(useChatMessageStore.getState().isLoadingOlderMessages).toBe(false);
		expect(
			useFileArtifactStore.getState().artifacts["project-current"],
		).toBeUndefined();
		expect(
			useFileArtifactStore.getState().artifacts["project-other"],
		).toBeUndefined();
		expect(useFileArtifactStore.getState().artifacts.fallback).toHaveLength(1);
		expect(
			useFileArtifactStore.getState().changeSets["project-current"],
		).toBeUndefined();
		expect(
			useFileArtifactStore.getState().changeSets["project-other"],
		).toBeUndefined();
		expect(useFileArtifactStore.getState().changeSets.fallback).toHaveLength(1);
	});

	it("clears current messages and resets runtime state when no fallback session exists", async () => {
		const { readMessages } = setupElectronMock();

		useChatStore.setState({
			currentConversationId: "project-current",
			conversations: [
				mockConversation({
					id: "project-current",
					workspaceId: "project-1",
					updatedAt: 20,
				}),
			],
		});
		useSessionListStore.setState({
			currentSessionId: "project-current",
			byProject: {
				"project-1": [
					mockMeta({ id: "project-current", projectId: "project-1" }),
				],
			},
		});
		useChatMessageStore.getState().setMessages([
			{
				id: "project-msg",
				role: "assistant",
				content: "running",
				timestamp: 1,
			},
		]);
		useChatMessageStore.getState().setSessionStatus("streaming");
		useChatMessageStore.getState().setStreamingContent("partial");
		useChatMessageStore.getState().setLoadingMessages(true);

		await useChatStore
			.getState()
			.deleteProjectConversationsLocally("project-1");

		expect(useChatStore.getState().conversations).toEqual([]);
		expect(useChatStore.getState().currentConversationId).toBeNull();
		expect(useSessionListStore.getState().currentSessionId).toBeNull();
		expect(readMessages).not.toHaveBeenCalled();
		expect(useChatMessageStore.getState().messages).toEqual([]);
		expect(useChatMessageStore.getState().sessionStatus).toBe("idle");
		expect(useChatMessageStore.getState().isStreaming).toBe(false);
		expect(useChatMessageStore.getState().streamingContent).toBe("");
		expect(useChatMessageStore.getState().isLoadingMessages).toBe(false);
	});

	it("does not reset current messages when deleting a non-current project", async () => {
		const { readMessages } = setupElectronMock();
		const currentMessage = {
			id: "current-msg",
			role: "assistant" as const,
			content: "keep me",
			timestamp: 1,
		};

		useChatStore.setState({
			currentConversationId: "current",
			conversations: [
				mockConversation({
					id: "project-session",
					workspaceId: "project-1",
					updatedAt: 20,
				}),
				mockConversation({
					id: "current",
					workspaceId: "default",
					updatedAt: 10,
				}),
			],
		});
		useSessionListStore.setState({
			currentSessionId: "current",
			casual: [mockMeta({ id: "current", projectId: null })],
			byProject: {
				"project-1": [
					mockMeta({ id: "project-session", projectId: "project-1" }),
				],
			},
		});
		useChatMessageStore.getState().setMessages([currentMessage]);
		useChatMessageStore.getState().setSessionStatus("streaming");
		useChatMessageStore.getState().setStreamingContent("live");

		await useChatStore
			.getState()
			.deleteProjectConversationsLocally("project-1");

		expect(useChatStore.getState().currentConversationId).toBe("current");
		expect(useSessionListStore.getState().currentSessionId).toBe("current");
		expect(useChatStore.getState().conversations.map((c) => c.id)).toEqual([
			"current",
		]);
		expect(readMessages).not.toHaveBeenCalled();
		expect(useChatMessageStore.getState().messages).toEqual([currentMessage]);
		expect(useChatMessageStore.getState().sessionStatus).toBe("streaming");
		expect(useChatMessageStore.getState().streamingContent).toBe("live");
	});
});

describe("loadOlderMessages", () => {
	it("loads the next older page and prepends it to current messages", async () => {
		const { readMessagesPage } = setupElectronMock();
		const olderMessage = {
			id: "older-msg",
			role: "user" as const,
			content: "older",
			timestamp: 1,
		};
		const loadedMessage = {
			id: "loaded-msg",
			role: "assistant" as const,
			content: "loaded",
			timestamp: 2,
		};
		readMessagesPage.mockResolvedValueOnce({
			success: true,
			data: {
				messages: [olderMessage],
				total: 2,
				offset: 1,
				limit: 100,
				hasMore: false,
			},
		});
		useChatStore.setState({ currentConversationId: "conv-1" });
		useChatMessageStore.getState().setMessages([loadedMessage]);
		useChatMessageStore.getState().setHasOlderMessages(true);

		await useChatStore.getState().loadOlderMessages();

		expect(readMessagesPage).toHaveBeenCalledWith("conv-1", {
			offset: 1,
			limit: 100,
		});
		expect(useChatMessageStore.getState().messages).toEqual([
			olderMessage,
			loadedMessage,
		]);
		expect(useChatMessageStore.getState().hasOlderMessages).toBe(false);
		expect(useChatMessageStore.getState().isLoadingOlderMessages).toBe(false);
	});
});
