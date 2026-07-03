/**
 * useNewConversation — 共享的"新建任务"入口逻辑。
 *
 * Reuse-or-create 策略，统一在 ClaudeSidebar / AppSidebar / 快捷键场景使用：
 *   1. 当前会话恰好就是目标上下文里的空会话 → stay（不创建、不切换）
 *   2. 同上下文里有别的空会话 → 切过去复用
 *   3. 都没有 → 真创建
 *
 * 不再做 disable / 警告 toast——按钮永远可点，永远落到一个 fresh chat 上。
 */
import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
	getProjectIdFromConversation,
	useChatStore,
} from "../stores/chatStore";
import { useChatMessageStore } from "../stores/chatMessageStore";
import type { ConversationSummary } from "../types/electron";

const peerProjectId = getProjectIdFromConversation;

function isPersistedEmpty(c: ConversationSummary): boolean {
	return (c.messageCount ?? 0) === 0;
}

interface UseNewConversationOptions {
	/**
	 * 真正创建新会话前回调。例如 sidebar 用来"展开目标项目节点"，让
	 * 新建的会话立刻可见。
	 */
	onBeforeCreate?: (targetProjectId: string | null) => void;
}

export interface NewConversationApi {
	/**
	 * 打开或复用目标上下文的空会话；都没有再真创建。
	 *
	 * - `target` 省略 → 从 fresh chatStore 状态派生（= 当前会话所属项目）
	 * - `target === null` → casual 桶
	 * - `target === <projectId>` → 该项目下
	 */
	openOrCreateConversation: (target?: string | null) => Promise<void>;
}

export function useNewConversation(
	opts?: UseNewConversationOptions,
): NewConversationApi {
	const navigate = useNavigate();
	const onBeforeCreate = opts?.onBeforeCreate;

	const openOrCreateConversation = useCallback(
		async (targetParam?: string | null) => {
			const state = useChatStore.getState();
			const curId = state.currentConversationId;
			const cur = state.conversations.find((c) => c.id === curId);
			const liveCount = useChatMessageStore.getState().messages.length;

			// 派生目标上下文：caller 显式传 → 用 caller 的；省略 → 看当前会话
			const targetProjectId =
				targetParam !== undefined
					? targetParam
					: cur
						? peerProjectId(cur)
						: null;

			// 1. 当前会话刚好就是目标上下文的空会话 → stay
			if (
				cur &&
				peerProjectId(cur) === targetProjectId &&
				liveCount === 0 &&
				isPersistedEmpty(cur)
			) {
				navigate("/chat");
				return;
			}

			// 2. 同上下文里其它空会话 → 切过去复用
			const reusable = state.conversations.find(
				(c) =>
					!c.session?.flags?.archived &&
					c.id !== curId &&
					peerProjectId(c) === targetProjectId &&
					isPersistedEmpty(c),
			);
			if (reusable) {
				try {
					await state.switchConversation(reusable.id);
				} catch (err) {
					console.error("Failed to reuse empty conversation:", err);
				}
				navigate("/chat");
				return;
			}

			// 3. 真创建
			onBeforeCreate?.(targetProjectId);
			try {
				if (targetProjectId) {
					await state.createConversation(undefined, "agent", {
						workspaceId: targetProjectId,
					});
				} else {
					await state.createConversation(undefined, "agent");
				}
			} catch (err) {
				console.error("Failed to create conversation:", err);
			}
			navigate("/chat");
		},
		[navigate, onBeforeCreate],
	);

	return { openOrCreateConversation };
}
