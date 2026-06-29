import type { BubbleListRef } from "@ant-design/x/es/bubble";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_SESSION_SETTINGS } from "../components/chat/ChatSettingsModal";
import type { SessionSettings } from "../components/chat/ChatSettingsModal";
import { ProviderIcon } from "../components/models/ProviderIcon";
import type { Message } from "../stores/chatStore";
import { getProjectIdFromConversation, useChatStore } from "../stores/chatStore";
import { useChatInputStore } from "../stores/chatInputStore";
import { useModelStore } from "../stores/modelStore";
import { useProjectStore } from "../stores/projectStore";
import type { ModelProviderPreset } from "../types/models";
import type { RemoteBinding, RemoteChatMessage } from "../types/electron";
import type { ChatOptions } from "./useChat";

export type ViewMode = "local" | "remote";

interface UseChatPageStateParams {
	messages: Message[];
	sendMessage: (options?: ChatOptions) => Promise<void>;
	setSelectedSkillId: (id: string | null) => void;
	setSessionSettings: (settings: SessionSettings) => void;
	// Remote chat
	remoteBinding: RemoteBinding | null;
	remoteMessages: RemoteChatMessage[];
	checkBotOnline: (botId: string) => Promise<boolean>;
	unbindRemote: () => Promise<void>;
	// NOTE: composer `input` / `setInput` are no longer threaded through —
	// see `chatInputStore` and the 2026-06-28 perf comment in `useChat.ts`.
	// We read/write the live value via `useChatInputStore.getState()` from
	// the few places below that touch it (auto-send, restored draft).
}

export function useChatPageState({
	messages,
	sendMessage,
	setSelectedSkillId,
	setSessionSettings,
	remoteBinding,
	remoteMessages,
	checkBotOnline,
	unbindRemote,
}: UseChatPageStateParams) {
	// ── Remote chat state ──
	const [remoteBindModalOpen, setRemoteBindModalOpen] = useState(false);
	const [remoteBotOnline, setRemoteBotOnline] = useState(false);
	const [remoteBotChecking, setRemoteBotChecking] = useState(false);

	// Check remote bot online status
	useEffect(() => {
		if (!remoteBinding) {
			setRemoteBotOnline(false);
			return;
		}
		const check = async () => {
			setRemoteBotChecking(true);
			try {
				const online = await checkBotOnline(remoteBinding.botId);
				setRemoteBotOnline(online);
			} finally {
				setRemoteBotChecking(false);
			}
		};
		check();
		const interval = setInterval(check, 10000);
		return () => clearInterval(interval);
	}, [remoteBinding, checkBotOnline]);

	// Handle creating remote session from IMBot page via location.state
	useEffect(() => {
		const state = window.history.state?.usr as
			| { createRemoteWithBotId?: string }
			| undefined;
		if (state?.createRemoteWithBotId) {
			window.history.replaceState({}, "");
			setRemoteBindModalOpen(true);
		}
	}, []);

	// ── Sidebar (inline collapsible) state ──
	const [sidebarVisible, setSidebarVisible] = useState(false);
	const [sidebarTab, setSidebarTab] = useState<string>("conversations");

	// ── View mode (main area: local AI chat vs remote IM) ──
	const [viewMode, setViewMode] = useState<ViewMode>("local");

	const [unreadRemoteCount, setUnreadRemoteCount] = useState(0);
	const prevRemoteMsgCountRef = useRef(remoteMessages.length);

	// Auto-reset viewMode and sidebarTab when remoteBinding is removed
	useEffect(() => {
		if (!remoteBinding) {
			setViewMode("local");
			setSidebarTab("conversations");
		}
	}, [remoteBinding]);

	// Track unread remote messages when remote is not visible
	useEffect(() => {
		const prevCount = prevRemoteMsgCountRef.current;
		const newCount = remoteMessages.length;
		prevRemoteMsgCountRef.current = newCount;

		if (newCount > prevCount) {
			const isRemoteVisible =
				(sidebarVisible && sidebarTab === "remote") || viewMode === "remote";
			if (!isRemoteVisible) {
				setUnreadRemoteCount((c) => c + (newCount - prevCount));
			}
		}
	}, [remoteMessages.length, sidebarVisible, sidebarTab, viewMode]);

	// Clear unread when remote becomes visible
	useEffect(() => {
		const isRemoteVisible =
			(sidebarVisible && sidebarTab === "remote") || viewMode === "remote";
		if (isRemoteVisible) {
			setUnreadRemoteCount(0);
		}
	}, [sidebarVisible, sidebarTab, viewMode]);

	// ── Dialog state ──
	const [isSearchOpen, setIsSearchOpen] = useState(false);
	const pendingScrollKeyRef = useRef<string | null>(null);
	const [isExportOpen, setIsExportOpen] = useState(false);
	const [settingsOpen, setSettingsOpen] = useState(false);

	// Listen for global shortcut events (dispatched from useAppShortcuts)
	useEffect(() => {
		const handleToggleSearch = () => setIsSearchOpen((v) => !v);
		const handleToggleSidebar = () => setSidebarVisible((v) => !v);
		window.addEventListener("chat:toggle-search", handleToggleSearch);
		window.addEventListener("chat:toggle-sidebar", handleToggleSidebar);
		return () => {
			window.removeEventListener("chat:toggle-search", handleToggleSearch);
			window.removeEventListener("chat:toggle-sidebar", handleToggleSidebar);
		};
	}, []);

	// Scroll to message after search modal closes
	useEffect(() => {
		if (isSearchOpen || !pendingScrollKeyRef.current) return;
		const targetId = pendingScrollKeyRef.current;
		pendingScrollKeyRef.current = null;
		const timer = setTimeout(() => {
			const el = document.getElementById(`msg-${targetId}`);
			if (!el) return;
			const bubble = el.closest(".ant-bubble") as HTMLElement | null;
			const scrollTarget = bubble || el;
			scrollTarget.scrollIntoView({ behavior: "smooth", block: "start" });
			el.style.transition = "background-color 0.3s";
			el.style.backgroundColor = "var(--ant-color-primary-bg)";
			setTimeout(() => {
				el.style.backgroundColor = "";
			}, 1500);
		}, 300);
		return () => clearTimeout(timer);
	}, [isSearchOpen]);

	// ── Scroll ref ──
	const bubbleListRef = useRef<BubbleListRef>(null);

	// Ensure scroll-to-bottom after sending/receiving
	useEffect(() => {
		if (messages.length === 0) return;
		const timer = setTimeout(() => {
			bubbleListRef.current?.scrollTo({
				top: "bottom" as any,
				behavior: "smooth",
			});
		}, 100);
		return () => clearTimeout(timer);
	}, [messages.length]);

	// ── Conversation management ──
	// R-7: createConversation / switchConversation are not destructured here;
	// call them on-demand via `useChatStore.getState()` so this hook does not
	// re-render whenever any chatStore action identity changes.
	const {
		currentConversationId,
		loadConversations,
		pendingInput,
		setPendingInput,
		pendingAutoSend,
		setPendingAutoSend,
		pendingSkillId,
		setPendingSkillId,
	} = useChatStore();

	// Load conversations on mount (don't auto-restore last conversation)
	useEffect(() => {
		loadConversations();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// ── Pending input (float widget / plugins) ──
	const [floatAutoSend, setFloatAutoSend] = useState(false);

	useEffect(() => {
		if (pendingInput) {
			// Push the queued draft (from the float widget / IPC handoff)
			// into the composer store. Subscribers will re-render; this
			// hook itself doesn't subscribe so it stays put.
			useChatInputStore.getState().setValue(pendingInput);
			setPendingInput(null);
			if (pendingAutoSend) {
				setPendingAutoSend(false);
				setFloatAutoSend(true);
			}
		}
	}, [pendingInput, pendingAutoSend, setPendingInput, setPendingAutoSend]);

	// Auto-send after input has been seeded (float widget flow).
	// D-3: float-widget 自动建普通对话（无 projectId），跟 sidebar 顶部 + 新建对话
	// 行为一致。
	// 复用规则：默认新建一个对话；唯一例外是「当前焦点会话已经是个新建但尚未发言
	// 的空壳」（messages.length === 0）——此时复用它，避免重复堆出空对话。
	//
	// Perf (2026-06-28): we used to depend on `input` here, which meant the
	// effect re-ran on every keystroke. After lifting the value into
	// `useChatInputStore`, we read once via `getState()` when `floatAutoSend`
	// flips true and don't subscribe — so typing never schedules this effect.
	useEffect(() => {
		if (!floatAutoSend) return;
		const seeded = useChatInputStore.getState().value;
		if (!seeded.trim()) return;
		setFloatAutoSend(false);
		const doSend = async () => {
			const { currentConversationId, createConversation } =
				useChatStore.getState();
			const reuseEmpty =
				currentConversationId !== null && messages.length === 0;
			if (!reuseEmpty) {
				await createConversation(seeded.trim().slice(0, 50), "agent");
			}
			sendMessage({ mode: "agent" });
		};
		doSend();
	}, [floatAutoSend, messages, sendMessage]);

	// Consume pendingSkillId from Skills page navigation (skill is independent of mode)
	useEffect(() => {
		if (pendingSkillId) {
			setSelectedSkillId(pendingSkillId);
			setPendingSkillId(null);
		}
	}, [pendingSkillId, setSelectedSkillId, setPendingSkillId]);

	// Reset session settings when switching conversations.
	// Model override is now persisted on conversation metadata and restored
	// by useChat itself; do not reset it here, otherwise the persisted
	// override would be discarded on every conversation switch.
	useEffect(() => {
		setSessionSettings({ ...DEFAULT_SESSION_SETTINGS });
	}, [currentConversationId, setSessionSettings]);

	// ── Workspace directory ──
	// 「工作目录」按钮优先打开项目真实根路径（project.cwd）；
	// casual 会话（无 projectId）回落到 per-session 沙箱目录，
	// 避免 G-2 重写后用户点击只能看到沙箱、看不到项目本体。
	const currentConversation = useChatStore((s) =>
		s.conversations.find((c) => c.id === currentConversationId),
	);
	const currentProjectId = getProjectIdFromConversation(currentConversation);
	const projectCwd = useProjectStore((s) =>
		currentProjectId
			? (s.projects.find((p) => p.id === currentProjectId)?.cwd ?? null)
			: null,
	);

	const [sessionSandboxDir, setSessionSandboxDir] = useState<string | null>(
		null,
	);
	useEffect(() => {
		if (!currentConversationId) {
			setSessionSandboxDir(null);
			return;
		}
		window.electron.cwd.resolveSessionCwd(currentConversationId).then((res) => {
			if (res.success && res.data) setSessionSandboxDir(res.data);
		});
	}, [currentConversationId]);

	const workspaceDir = projectCwd ?? sessionSandboxDir;

	const handleOpenWorkspace = useCallback(() => {
		if (workspaceDir) {
			window.electron.ipc.invoke("app:open-path", workspaceDir);
		}
	}, [workspaceDir]);

	// ── Grouped model options ──
	const getAllEnabledModels = useModelStore((s) => s.getAllEnabledModels);
	const activeSelection = useModelStore((s) => s.activeSelection);
	const providers = useModelStore((s) => s.providers);
	const groupedModelOptions = useMemo(() => {
		const enabledModels = getAllEnabledModels();
		const groups: Record<
			string,
			{
				providerName: string;
				preset: ModelProviderPreset;
				models: { label: React.ReactNode; value: string }[];
			}
		> = {};
		for (const { provider, model } of enabledModels) {
			if (!groups[provider.id]) {
				groups[provider.id] = {
					providerName: provider.name,
					preset: provider.preset,
					models: [],
				};
			}
			groups[provider.id].models.push({
				label: (
					<span className="flex items-center gap-1.5">
						<ProviderIcon preset={provider.preset} size={14} />
						<span>{model.name}</span>
					</span>
				),
				value: `${provider.id}||${model.id}`,
			});
		}
		return Object.entries(groups).map(([, group]) => ({
			label: (
				<span className="flex items-center gap-1.5">
					<ProviderIcon preset={group.preset} size={14} />
					{group.providerName}
				</span>
			),
			options: group.models,
		}));
	}, [providers, getAllEnabledModels]);

	// R-7: handleNewChat / handleNewAgentChat / handleNewRemoteChat / the unified
	// handleNewConversation reuse-or-create logic were only consumed by the now
	// unmounted ChatInlineSidebar.tsx. They are removed. New session creation
	// surfaces are listed in plan §25.2 (sidebar default · sidebar project · TitleBar
	// 新建对话…). The mode-switch in-place reuse logic, if needed again, should be
	// re-added inside chatStore so all 4 surfaces share one branch.

	const handleUnbindRemote = useCallback(async () => {
		await unbindRemote();
		setViewMode("local");
		setSidebarTab("conversations");
	}, [unbindRemote]);

	const conversationId = currentConversationId || "default";

	return {
		// Remote
		remoteBindModalOpen,
		setRemoteBindModalOpen,
		remoteBotOnline,
		remoteBotChecking,
		// Sidebar (inline collapsible)
		sidebarVisible,
		setSidebarVisible,
		sidebarTab,
		setSidebarTab,
		// View mode
		viewMode,
		setViewMode,
		unreadRemoteCount,
		// Dialogs
		isSearchOpen,
		setIsSearchOpen,
		isExportOpen,
		setIsExportOpen,
		settingsOpen,
		setSettingsOpen,
		pendingScrollKeyRef,
		// Scroll
		bubbleListRef,
		// Conversation
		currentConversationId,
		conversationId,
		// Workspace
		workspaceDir,
		handleOpenWorkspace,
		// Model
		groupedModelOptions,
		activeSelection,
		// Callbacks
		handleUnbindRemote,
	};
}
