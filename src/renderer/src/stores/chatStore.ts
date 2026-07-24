/**
 * useChatStore — conversation list + page-level cross-cutting state.
 *
 * R-3 step 2: messages + streaming state moved to `useChatMessageStore`. This
 * store now owns:
 *   - Conversation list and the `currentConversationId` pointer
 *   - Pending input / auto-send / skill / team selection (cross-cutting page state)
 *   - Conversation lifecycle: create, switch, delete, rename, fork, metadata
 *
 * For backward compatibility, message-shape types are re-exported from
 * `chatMessageStore` so existing `import type { Message } from "../stores/chatStore"`
 * keeps working through the migration.
 */

import { message } from "antd";
import { create } from "zustand";
import type { ChatMode, SessionMeta } from "@super-client/shared-types/project";
import { createLogger } from "../services/logService";
import { gitService } from "../services/gitService";
import { remoteSessionService } from "../services/remoteSessionService";
import type {
	ConversationSummary,
	ConversationSummaryUpdate,
} from "../types/electron";
import { useChatMessageStore } from "./chatMessageStore";
import type { Message } from "./chatMessageStore";
import { useFileArtifactStore } from "./fileArtifactStore";
import { useProjectStore } from "./projectStore";
import { useSessionListStore } from "./sessionListStore";

const log = createLogger("chatStore");

// R-3 step 2: re-export message-related types for backward-compat with existing
// `import type { Message } from "../stores/chatStore"` callsites. New code
// should import from `chatMessageStore` directly.
export type {
	ChatSessionStatus,
	Message,
	MessageRole,
	MessageType,
	ToolCall,
} from "./chatMessageStore";

/**
 * D-1: SessionMeta → ConversationSummary 适配器。
 *
 * Sidebars / TitleBar / chat 渲染层仍消费 `ConversationSummary` 形态。新存储
 * 层（sessions.*）返回 `SessionMeta`。本适配器把两个形态对齐，避免 Phase D
 * 阶段动 23 个 consumer 文件。
 *
 * 字段映射：
 *  - `projectId === null` → workspaceId = "default"（兼容老 sidebar 分组逻辑）
 *  - `projectId === <id>` → workspaceId = <id>（兼容；Phase E 后用 projectId 直读）
 *  - `chatMode` 折叠后是 5 值；老 `ConversationSummary.chatMode` 仅 'direct' | 'agent'
 *    → ChatMode='agent' 映射 'agent'，其它都映射 'direct'
 *  - `session.kind` 反向推：projectId / chatMode / remote 综合得出
 */
function metaToConversation(meta: SessionMeta): ConversationSummary {
	const isAgent = true;
	return {
		id: meta.id,
		name: meta.name ?? "",
		createdAt: meta.createdAt,
		updatedAt: meta.updatedAt,
		messageCount: meta.messageCount,
		preview: meta.preview ?? "",
		workspaceId: meta.projectId ?? "default",
		chatMode: isAgent ? "agent" : "direct",
		remote: meta.remote,
		session: {
			id: meta.id,
			workspaceId: meta.projectId ?? "default",
			kind: meta.remote
				? "remote"
				: meta.chatMode === "agent"
					? "agent"
					: meta.chatMode === "plan"
						? "plan"
						: meta.chatMode === "automation"
							? "automation"
							: "chat",
			planMode: meta.planMode ?? "chat",
			interactionProfileOverride: meta.interactionProfileOverride,
			modelOverride: meta.modelOverride,
			attachmentIds: [],
			flags: meta.flags,
			lineage: meta.lineage,
			createdAt: meta.createdAt,
			updatedAt: meta.updatedAt,
		},
	};
}

/**
 * 把老 `chatMode: 'direct' | 'agent'` 映射到新 `ChatMode`。
 * direct → 'chat'（B7 折叠后的默认）；agent → 'agent'。
 */
function oldChatModeToNew(_old?: "direct" | "agent"): ChatMode {
	return "agent";
}

/**
 * 老 caller 传 `opts.workspaceId` 字符串；映射到 SessionMeta.projectId。
 *  - "default" / undefined → null（普通对话）
 *  - 其它 → 当 projectId 直接用（要求 useProjectStore 已 load 过 / 该 id 存在）
 */
function workspaceIdToProjectId(workspaceId?: string): string | null {
	if (!workspaceId || workspaceId === "default") return null;
	return workspaceId;
}

/**
 * G-6 收口 helper：从 ConversationSummary 派生项目 id。
 * `workspaceId === "default" / 空 / undefined` → `null`（普通对话），其它当 projectId。
 *
 * 用 `Pick<...>` 不锁死整个 ConversationSummary，方便 RemoteChatMessage / SessionMeta
 * 等其它形态也能传（只要有 workspaceId 字段）。
 */
export function getProjectIdFromConversation(
	conv: { workspaceId?: string } | null | undefined,
): string | null {
	if (!conv?.workspaceId || conv.workspaceId === "default") return null;
	return conv.workspaceId;
}

async function readSessionMessages(
	conversationId: string,
	options?: { tail?: number },
): Promise<Message[]> {
	try {
		const res = await window.electron.sessions.readMessages(
			conversationId,
			options?.tail !== undefined ? { tail: options.tail } : undefined,
		);
		if (res.success && res.data) return res.data;
	} catch (err) {
		log.error("sessions.readMessages failed", err instanceof Error ? err : new Error(String(err)));
	}
	return [];
}

async function readSessionMessagesPage(
	conversationId: string,
	options: { offset?: number; limit?: number },
): Promise<{
	messages: Message[];
	hasMore: boolean;
	nextOffset?: number;
	total: number;
}> {
	try {
		const readPage = window.electron.sessions.readMessagesPage;
		if (readPage) {
			const res = await readPage(conversationId, options);
			if (res.success && res.data) {
				return {
					messages: res.data.messages,
					hasMore: res.data.hasMore,
					nextOffset: res.data.nextOffset,
					total: res.data.total,
				};
			}
		}
		const fallback = await readSessionMessages(conversationId, {
			tail: options.limit,
		});
		return {
			messages: fallback,
			hasMore: fallback.length >= (options.limit ?? INITIAL_TAIL_MESSAGE_COUNT),
			total: fallback.length,
		};
	} catch (err) {
		log.error("sessions.readMessagesPage failed", err instanceof Error ? err : new Error(String(err)));
	}
	return { messages: [], hasMore: false, total: 0 };
}

/**
 * Tail size for the initial "fast first paint" read in `switchConversation`.
 * Tuned so that `buildMessageTurns` + bubbleItems O(N) work stays under a
 * single frame on a typical machine. If the disk read returns exactly this
 * many messages, we assume there's more older history available and surface
 * a "查看更早消息" button via `chatMessageStore.hasOlderMessages`.
 */
const INITIAL_TAIL_MESSAGE_COUNT = 100;

interface ChatState {
	// Pending input (from plugins, float widget, etc.)
	pendingInput: string | null;
	setPendingInput: (input: string | null) => void;
	pendingAutoSend: boolean;
	setPendingAutoSend: (value: boolean) => void;

	// Pending skill selection (from Skills page, etc.)
	pendingSkillId: string | null;
	setPendingSkillId: (id: string | null) => void;

	// Multi-Agent team selection
	selectedTeamId: string | null;
	setSelectedTeamId: (id: string | null) => void;

	// Conversations
	conversations: ConversationSummary[];
	currentConversationId: string | null;
	isLoadingConversations: boolean;

	// Conversation actions
	loadConversations: () => Promise<void>;
	createConversation: (
		name?: string,
		chatMode?: "direct" | "agent",
		opts?: { workspaceId?: string },
	) => Promise<string | null>;
	/** Plan §25.3 — explicit advanced creation that may also bind a remote bot. */
	createConversationAdvanced: (input: {
		workspaceId: string;
		chatMode: "direct" | "agent";
		name?: string;
		remote?: { botId: string; chatId: string };
	}) => Promise<string | null>;
	switchConversation: (conversationId: string) => Promise<void>;
	/**
	 * Read the full message history for the currently-active conversation
	 * (used when the user clicks "查看更早消息" after a tailed switch). No-op
	 * if there's nothing older to load.
	 */
	loadOlderMessages: () => Promise<void>;
	deleteConversation: (conversationId: string) => Promise<void>;
	deleteProjectConversationsLocally: (projectId: string) => Promise<void>;
	renameConversation: (conversationId: string, name: string) => Promise<void>;
	updateConversationMetadata: (
		conversationId: string,
		updates: ConversationSummaryUpdate,
	) => Promise<void>;
	forkConversationLocal: (sourceId: string) => Promise<string | null>;
	forkConversationWorktree: (sourceId: string) => Promise<string | null>;
}

export const useChatStore = create<ChatState>()((set, get) => ({
	pendingInput: null,
	setPendingInput: (input) => set({ pendingInput: input }),
	pendingAutoSend: false,
	setPendingAutoSend: (value) => set({ pendingAutoSend: value }),
	pendingSkillId: null,
	setPendingSkillId: (id) => set({ pendingSkillId: id }),
	selectedTeamId: null,
	setSelectedTeamId: (id) => set({ selectedTeamId: id }),
	conversations: [],
	currentConversationId: null,
	isLoadingConversations: false,

	// ============ Conversation actions ============

	loadConversations: async () => {
		set({ isLoadingConversations: true });
		try {
			// D-1: 老 chat.listConversations 替换为 projects.list + 各 bucket 的
			// sessions.list 联合查。新存储是分桶的，conversation 列表是聚合 view。
			await useProjectStore.getState().load();
			const projects = useProjectStore.getState().projects;
			await useSessionListStore.getState().loadCasual();
			await Promise.all(
				projects.map((p) => useSessionListStore.getState().loadProject(p.id)),
			);
			const sl = useSessionListStore.getState();
			const allMeta: SessionMeta[] = [
				...sl.casual,
				...projects.flatMap((p) => sl.byProject[p.id] ?? []),
			];
			const conversations = allMeta
				.map(metaToConversation)
				.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
			set({ conversations });
		} finally {
			set({ isLoadingConversations: false });
		}
	},

	createConversation: async (name, chatMode, opts) => {
		try {
			// D-1: opts.workspaceId 翻译为 SessionMeta.projectId（"default" → null）
			const projectId = workspaceIdToProjectId(opts?.workspaceId);
			const res = await window.electron.sessions.create({
				projectId,
				name: name || "新对话",
				chatMode: "agent",
			});
			if (!res.success || !res.data) {
				log.error("sessions.create failed", undefined, {
						error: res.error ?? "unknown",
					});
				return null;
			}
			const meta = res.data;
			const conv = metaToConversation(meta);
			set((state) => ({
				conversations: [conv, ...state.conversations],
				currentConversationId: conv.id,
			}));
			useChatMessageStore.getState().setMessages([]);
			useSessionListStore.setState((s) => {
				if (meta.projectId === null) {
					return {
						casual: [meta, ...s.casual.filter((m) => m.id !== meta.id)],
					};
				}
				const projectId = meta.projectId;
				return {
					byProject: {
						...s.byProject,
						[projectId]: [
							meta,
							...(s.byProject[projectId] ?? []).filter((m) => m.id !== meta.id),
						],
					},
				};
			});
			useSessionListStore.getState().setCurrent(meta.id);
			return meta.id;
		} catch (error) {
			log.error("Failed to create conversation", error instanceof Error ? error : new Error(String(error)));
		}
		return null;
	},

	// Plan §25.3 — invoked by <NewConversationModal>. Wraps `createConversation`
	// with an optional remote-bind step so the user can spin up a 远端对话 in
	// one operation. Switches the workspace if the chosen one differs from the
	// currently-focused workspace, so the new conversation lands in view.
	createConversationAdvanced: async ({
		workspaceId,
		chatMode,
		name,
		remote,
	}) => {
		try {
			// D-1: workspaceId 兼容仍传字符串；createConversation 内部会翻译。
			const newId = await get().createConversation(
				name || (remote ? "远端对话" : "新对话"),
				chatMode,
				{ workspaceId },
			);
			if (!newId) {
				message.error("创建对话失败");
				return null;
			}
			if (remote) {
				try {
					const res = await remoteSessionService.bind(
						newId,
						remote.botId,
						remote.chatId,
					);
					if (!res.success) {
						message.warning(
							`对话已创建，但绑定 IM bot 失败：${res.error || "unknown"}`,
						);
					} else {
						set((state) => ({
							conversations: state.conversations.map((c) =>
								c.id === newId && res.data ? { ...c, remote: res.data } : c,
							),
						}));
					}
				} catch (err) {
					message.warning("对话已创建，但绑定 IM bot 失败");
					log.warn("remoteChat.bind failed", { error: err });
				}
			}
			return newId;
		} catch (error) {
			log.error("createConversationAdvanced failed", error instanceof Error ? error : new Error(String(error)));
			message.error("创建对话失败");
			return null;
		}
	},

	switchConversation: async (conversationId) => {
		// Don't switch while active. R-3 step 2: status now lives in chatMessageStore.
		const sessionStatus = useChatMessageStore.getState().sessionStatus;
		if (sessionStatus !== "idle") return;

		const { currentConversationId } = get();
		if (conversationId === currentConversationId) return;

		set({ currentConversationId: conversationId });
		// Clear + flag loading so the chat pane shows a spinner instead of a
		// blank gap while the next conversation's history is read from disk.
		// We also reset the "older messages" hint here — every switch starts
		// fresh and decides anew whether tailing left more on disk.
		const messageStore = useChatMessageStore.getState();
		messageStore.setMessages([]);
		messageStore.setHasOlderMessages(false);
		messageStore.setLoadingMessages(true);

		try {
			// Tail-first read: keeps first-paint cost bounded for huge sessions.
			// Buildup of turns / bubbleItems is O(N) over loaded messages so
			// capping at INITIAL_TAIL_MESSAGE_COUNT keeps that pass cheap.
			const page = await readSessionMessagesPage(conversationId, {
				offset: 0,
				limit: INITIAL_TAIL_MESSAGE_COUNT,
			});
			// Guard against the user switching conversations again while we
			// were reading — only commit if we're still on the same target.
			if (get().currentConversationId !== conversationId) return;
			useChatMessageStore.getState().setMessages(page.messages);
			useChatMessageStore.getState().setHasOlderMessages(page.hasMore);
		} catch (error) {
			log.error("Failed to load messages", error instanceof Error ? error : new Error(String(error)));
		} finally {
			useChatMessageStore.getState().setLoadingMessages(false);
		}
	},

	loadOlderMessages: async () => {
		const { currentConversationId } = get();
		if (!currentConversationId) return;
		const messageStore = useChatMessageStore.getState();
		if (!messageStore.hasOlderMessages || messageStore.isLoadingOlderMessages) {
			return;
		}
		messageStore.setLoadingOlderMessages(true);
		try {
			const current = messageStore.messages;
			const page = await readSessionMessagesPage(currentConversationId, {
				offset: current.length,
				limit: INITIAL_TAIL_MESSAGE_COUNT,
			});
			// Guard against the user switching conversations mid-fetch.
			if (get().currentConversationId !== currentConversationId) return;
			const store = useChatMessageStore.getState();
			store.setMessages([...page.messages, ...store.messages]);
			store.setHasOlderMessages(page.hasMore);
		} catch (error) {
			log.error("Failed to load older messages", error instanceof Error ? error : new Error(String(error)));
		} finally {
			useChatMessageStore.getState().setLoadingOlderMessages(false);
		}
	},

	// Plan §25.4: deletion link.
	//   1. Resolve "next current" BEFORE physical delete (only when deleting
	//      the currently focused conversation).
	//   2. Physical delete via main, so storage can tombstone existing metadata.
	//   3. Auto-unbind remote (so the IM bot side does not retain orphans).
	//   4. Local cleanup: chatStore.conversations + file artifacts.
	deleteConversation: async (conversationId) => {
		const state = get();
		const target = state.conversations.find((c) => c.id === conversationId);
		const isCurrent = state.currentConversationId === conversationId;

		// Resolve next conversation to focus.
		let nextId: string | null = null;
		if (isCurrent) {
			const remaining = state.conversations.filter(
				(c) => c.id !== conversationId && !c.session?.flags?.archived,
			);
			const sameWorkspace = target?.workspaceId
				? remaining.filter((c) => c.workspaceId === target.workspaceId)
				: [];
			const pool = sameWorkspace.length > 0 ? sameWorkspace : remaining;
			pool.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
			nextId = pool[0]?.id ?? null;
		}

		try {
			// D-1: useSessionListStore.delete 同时调 IPC + 清理 store 状态
			const deleted = await useSessionListStore
				.getState()
				.delete(conversationId);
			if (target?.remote && deleted) {
				try {
					await remoteSessionService.unbind(conversationId);
				} catch (err) {
					log.warn("remote unbind failed; continuing local cleanup", {
							error: err,
						});
				}
			}
			useFileArtifactStore.getState().clearForConversation(conversationId);

			set((s) => ({
				conversations: s.conversations.filter((c) => c.id !== conversationId),
				currentConversationId: isCurrent ? nextId : s.currentConversationId,
			}));
			if (isCurrent) {
				useChatMessageStore.getState().setMessages([]);
			}

			if (isCurrent && nextId) {
				const ms = useChatMessageStore.getState();
				ms.setHasOlderMessages(false);
				ms.setLoadingMessages(true);
				try {
					const page = await readSessionMessagesPage(nextId, {
						offset: 0,
						limit: INITIAL_TAIL_MESSAGE_COUNT,
					});
					useChatMessageStore.getState().setMessages(page.messages);
					useChatMessageStore.getState().setHasOlderMessages(page.hasMore);
				} catch (err) {
					log.error("failed to load next messages", err instanceof Error ? err : new Error(String(err)));
				} finally {
					useChatMessageStore.getState().setLoadingMessages(false);
				}
			}
		} catch (error) {
			log.error("Failed to delete conversation", error instanceof Error ? error : new Error(String(error)));
		}
	},

	deleteProjectConversationsLocally: async (projectId) => {
		const state = get();
		const removed = state.conversations.filter(
			(c) => getProjectIdFromConversation(c) === projectId,
		);
		if (removed.length === 0) return;
		const removedIds = new Set(removed.map((c) => c.id));
		const remaining = state.conversations
			.filter((c) => !removedIds.has(c.id) && !c.session?.flags?.archived)
			.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
		const currentRemoved = state.currentConversationId
			? removedIds.has(state.currentConversationId)
			: false;
		const nextId = currentRemoved
			? (remaining[0]?.id ?? null)
			: state.currentConversationId;

		for (const conversationId of removedIds) {
			useFileArtifactStore.getState().clearForConversation(conversationId);
		}

		useSessionListStore.setState((s) => {
			const nextByProject = { ...s.byProject };
			delete nextByProject[projectId];
			return {
				byProject: nextByProject,
				currentSessionId:
					s.currentSessionId && removedIds.has(s.currentSessionId)
						? nextId
						: s.currentSessionId,
			};
		});

		set((s) => ({
			conversations: s.conversations.filter((c) => !removedIds.has(c.id)),
			currentConversationId: currentRemoved ? nextId : s.currentConversationId,
		}));

		if (!currentRemoved) return;
		const messageStore = useChatMessageStore.getState();
		messageStore.setSessionStatus("idle");
		messageStore.setStreamingContent("");
		messageStore.setHasOlderMessages(false);
		messageStore.setLoadingMessages(false);
		messageStore.setLoadingOlderMessages(false);
		if (!nextId) {
			messageStore.setMessages([]);
			return;
		}
		messageStore.setLoadingMessages(true);
		try {
			const page = await readSessionMessagesPage(nextId, {
				offset: 0,
				limit: INITIAL_TAIL_MESSAGE_COUNT,
			});
			messageStore.setMessages(page.messages);
			messageStore.setHasOlderMessages(page.hasMore);
		} catch (err) {
			log.error("failed to load fallback messages", err instanceof Error ? err : new Error(String(err)));
			messageStore.setMessages([]);
		} finally {
			useChatMessageStore.getState().setLoadingMessages(false);
		}
	},

	renameConversation: async (conversationId, name) => {
		try {
			// D-1: 走 sessions.rename。useSessionListStore.rename 同时调 IPC + sync state。
			await useSessionListStore.getState().rename(conversationId, name);
			set((state) => ({
				conversations: state.conversations.map((c) =>
					c.id === conversationId ? { ...c, name } : c,
				),
			}));
		} catch (error) {
			log.error("Failed to rename conversation", error instanceof Error ? error : new Error(String(error)));
		}
	},

	updateConversationMetadata: async (conversationId, updates) => {
		try {
			// D-1: 把老 ConversationSummaryUpdate 翻译成新 SessionMeta patch。
			// G-4: 加 planMode / interactionProfileOverride 透传——SessionMeta 现在
			// 持有这两个字段，SessionRuntimeResolver 会用它们做 overlay。
			// session.kind / workspaceId 在新模型里折叠掉，忽略。
			const sessionPatch = updates.session;
			const metaPatch: Partial<SessionMeta> = {
				...(updates.name !== undefined ? { name: updates.name } : {}),
				...(updates.chatMode !== undefined
					? { chatMode: oldChatModeToNew(updates.chatMode) }
					: {}),
				...(updates.remote !== undefined ? { remote: updates.remote } : {}),
				...(sessionPatch?.flags !== undefined
					? { flags: sessionPatch.flags }
					: {}),
				...(sessionPatch?.lineage !== undefined
					? { lineage: sessionPatch.lineage }
					: {}),
				...(sessionPatch?.modelOverride !== undefined
					? { modelOverride: sessionPatch.modelOverride }
					: {}),
				...(sessionPatch?.planMode !== undefined
					? { planMode: sessionPatch.planMode }
					: {}),
				...(sessionPatch?.interactionProfileOverride !== undefined
					? {
							interactionProfileOverride:
								sessionPatch.interactionProfileOverride,
						}
					: {}),
			};
			await useSessionListStore
				.getState()
				.updateMeta(conversationId, metaPatch);
			// 本地 conversations 同步
			set((state) => ({
				conversations: state.conversations.map((c) => {
					if (c.id !== conversationId) return c;
					const { session: sp, ...rest } = updates;
					const merged: ConversationSummary = { ...c, ...rest };
					if (sp && c.session) {
						merged.session = { ...c.session, ...sp };
					}
					return merged;
				}),
			}));
		} catch (error) {
			log.error(
				"Failed to update conversation metadata",
				error instanceof Error ? error : new Error(String(error)),
			);
		}
	},

	// ── Fork actions (plan §23.2) ─────────────────────────────────────────
	// D-1: 走 sessions.fork。fork 内部复制 jsonl + meta + per-session 子目录，
	// 并设 lineage.forkOriginId。worktree fork 需要 renderer 先调 git 创建工作树，
	// 然后 fork（targetProjectId 与源相同 / casual）。
	forkConversationLocal: async (sourceId: string) => {
		const source = get().conversations.find((c) => c.id === sourceId);
		if (!source) {
			message.error("找不到源会话");
			return null;
		}
		try {
			const targetProjectId = workspaceIdToProjectId(source.workspaceId);
			const res = await window.electron.sessions.fork(sourceId, {
				targetProjectId,
				name: `${source.name || "未命名会话"} (副本)`,
			});
			if (!res.success || !res.data) {
				message.error(`派生失败：${res.error || "unknown"}`);
				return null;
			}
			await get().loadConversations();
			message.success("已派生到本地");
			return res.data.id;
		} catch (error) {
			log.error("forkConversationLocal failed", error instanceof Error ? error : new Error(String(error)));
			message.error("派生失败");
			return null;
		}
	},
	forkConversationWorktree: async (sourceId: string) => {
		const source = get().conversations.find((c) => c.id === sourceId);
		if (!source) {
			message.error("找不到源会话");
			return null;
		}
		try {
			// 1. 解析源 cwd → git rev-parse
			const cwdRes = await window.electron.cwd.resolveSessionCwd(sourceId);
			if (!cwdRes.success || !cwdRes.data) {
				message.error("无法解析会话目录");
				return null;
			}
			const cwd = cwdRes.data;
			const branchRes = await gitService.getBranchInfo(cwd);
			if (!branchRes.success || !branchRes.data?.isRepo) {
				message.error("当前会话目录不是 git 仓库");
				return null;
			}
			const ts = Date.now();
			const worktreePath = `${cwd}-fork-${ts}`;
			const branchName = `fork-${ts}`;
			const wtRes = await gitService.createWorktree(
				cwd,
				worktreePath,
				branchName,
			);
			if (!wtRes.success || !wtRes.data?.ok) {
				message.error(
					`创建工作树失败：${wtRes.data?.error || wtRes.error || "unknown"}`,
				);
				return null;
			}
			// 2. fork session（targetProject 与源相同，记 worktreePath 到 lineage）
			const targetProjectId = workspaceIdToProjectId(source.workspaceId);
			const forkRes = await window.electron.sessions.fork(sourceId, {
				targetProjectId,
				name: `${source.name || "未命名会话"} (工作树)`,
			});
			if (!forkRes.success || !forkRes.data) {
				message.error(`派生失败：${forkRes.error || "unknown"}`);
				return null;
			}
			const newId = forkRes.data.id;
			// 3. 把 worktreePath 补进 lineage（fork 默认只填 forkOriginId）
			await window.electron.sessions.updateMeta(newId, {
				lineage: {
					...forkRes.data.lineage,
					forkOriginId: sourceId,
					worktreePath,
				},
			});
			await get().loadConversations();
			message.success("已派生到新工作树");
			return newId;
		} catch (error) {
			log.error("forkConversationWorktree failed", error instanceof Error ? error : new Error(String(error)));
			message.error("派生到工作树失败");
			return null;
		}
	},
}));
