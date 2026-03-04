import type { BubbleListRef } from "@ant-design/x/es/bubble";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_SESSION_SETTINGS } from "../components/chat/ChatSettingsModal";
import type { SessionSettings } from "../components/chat/ChatSettingsModal";
import { ProviderIcon } from "../components/models/ProviderIcon";
import type { Message } from "../stores/chatStore";
import { useChatStore } from "../stores/chatStore";
import { useModelStore } from "../stores/modelStore";
import type { ModelProviderPreset } from "../types/models";
import type { RemoteBinding, RemoteChatMessage } from "../types/electron";
import type { ChatMode, ChatOptions } from "./useChat";

export type ViewMode = "local" | "remote";

interface UseChatPageStateParams {
  messages: Message[];
  sendMessage: (options?: ChatOptions) => Promise<void>;
  setInput: (value: string) => void;
  setChatMode: (mode: ChatMode) => void;
  setSelectedSkillId: (id: string | null) => void;
  setSessionModelOverride: (
    override: { providerId: string; modelId: string } | null,
  ) => void;
  setSessionSettings: (settings: SessionSettings) => void;
  // Remote chat
  remoteBinding: RemoteBinding | null;
  remoteMessages: RemoteChatMessage[];
  checkBotOnline: (botId: string) => Promise<boolean>;
  unbindRemote: () => Promise<void>;
  input: string;
}

export function useChatPageState({
  messages,
  sendMessage,
  setInput,
  setChatMode,
  setSelectedSkillId,
  setSessionModelOverride,
  setSessionSettings,
  remoteBinding,
  remoteMessages,
  checkBotOnline,
  unbindRemote,
  input,
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
  const [sidebarVisible, setSidebarVisible] = useState(true);
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
  const {
    currentConversationId,
    loadConversations,
    createConversation,
    switchConversation,
    pendingInput,
    setPendingInput,
    pendingAutoSend,
    setPendingAutoSend,
    pendingSkillId,
    setPendingSkillId,
  } = useChatStore();

  // Load conversations on mount and restore last conversation
  useEffect(() => {
    const init = async () => {
      await loadConversations();
      const res = await window.electron.chat.getLastConversation();
      if (res.success && res.data) {
        switchConversation(res.data);
      }
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Pending input (float widget / plugins) ──
  const [floatAutoSend, setFloatAutoSend] = useState(false);

  useEffect(() => {
    if (pendingInput) {
      setInput(pendingInput);
      setPendingInput(null);
      if (pendingAutoSend) {
        setPendingAutoSend(false);
        setFloatAutoSend(true);
      }
    }
  }, [
    pendingInput,
    pendingAutoSend,
    setInput,
    setPendingInput,
    setPendingAutoSend,
  ]);

  // Auto-send after input state has updated (float widget flow)
  useEffect(() => {
    if (floatAutoSend && input.trim()) {
      setFloatAutoSend(false);
      const doSend = async () => {
        await useChatStore
          .getState()
          .createConversation(input.trim().slice(0, 50));
        sendMessage({ mode: "direct" });
      };
      doSend();
    }
  }, [floatAutoSend, input, sendMessage]);

  // Consume pendingSkillId from Skills page navigation
  useEffect(() => {
    if (pendingSkillId) {
      setChatMode("skill");
      setSelectedSkillId(pendingSkillId);
      setPendingSkillId(null);
    }
  }, [pendingSkillId, setChatMode, setSelectedSkillId, setPendingSkillId]);

  // Reset session model override and settings when switching conversations
  useEffect(() => {
    setSessionModelOverride(null);
    setSessionSettings({ ...DEFAULT_SESSION_SETTINGS });
  }, [currentConversationId, setSessionModelOverride, setSessionSettings]);

  // ── Workspace directory ──
  const [workspaceDir, setWorkspaceDir] = useState<string | null>(null);
  useEffect(() => {
    if (!currentConversationId) {
      setWorkspaceDir(null);
      return;
    }
    window.electron.chat.getWorkspaceDir(currentConversationId).then((res) => {
      if (res.success && res.data) setWorkspaceDir(res.data);
    });
  }, [currentConversationId]);

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

  // ── Callbacks ──
  const handleNewChat = useCallback(() => {
    createConversation();
  }, [createConversation]);

  // Flag: next bind should create a new conversation first
  const pendingNewRemoteRef = useRef(false);

  const handleNewRemoteChat = useCallback(() => {
    pendingNewRemoteRef.current = true;
    setRemoteBindModalOpen(true);
  }, []);

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
    handleNewChat,
    handleNewRemoteChat,
    handleUnbindRemote,
    // Refs
    pendingNewRemoteRef,
  };
}
