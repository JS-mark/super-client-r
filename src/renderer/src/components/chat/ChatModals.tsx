import type * as React from "react";
import { useCallback } from "react";
import type { Message } from "../../stores/chatStore";
import type { SessionSettings } from "./ChatSettingsModal";
import { ChatExportDialog } from "./ChatExportDialog";
import { ChatSettingsModal } from "./ChatSettingsModal";
import { MessageSearch } from "./MessageSearch";
import { RemoteBindingModal } from "./RemoteBindingModal";

interface ChatModalsProps {
  messages: Message[];
  // MessageSearch
  isSearchOpen: boolean;
  onSearchClose: () => void;
  pendingScrollKeyRef: React.MutableRefObject<string | null>;
  // ChatExport
  isExportOpen: boolean;
  onExportClose: () => void;
  // ChatSettings
  settingsOpen: boolean;
  onSettingsClose: () => void;
  sessionSettings: SessionSettings;
  onSettingsChange: (settings: SessionSettings) => void;
  modelValue: string | undefined;
  onModelChange: (val: string) => void;
  groupedModelOptions: any[];
  isStreaming: boolean;
  availableTools: Array<{ prefixedName: string; displayName: string }>;
  // RemoteBinding
  remoteBindModalOpen: boolean;
  onRemoteBindClose: () => void;
  onBind: (botId: string, chatId: string) => Promise<void>;
  checkBotOnline: (botId: string) => Promise<boolean>;
}

export function ChatModals({
  messages,
  isSearchOpen,
  onSearchClose,
  pendingScrollKeyRef,
  isExportOpen,
  onExportClose,
  settingsOpen,
  onSettingsClose,
  sessionSettings,
  onSettingsChange,
  modelValue,
  onModelChange,
  groupedModelOptions,
  isStreaming,
  availableTools,
  remoteBindModalOpen,
  onRemoteBindClose,
  onBind,
  checkBotOnline,
}: ChatModalsProps) {
  const handleJumpToMessage = useCallback(
    (messageId: string) => {
      // Resolve the bubble key for this message.
      // User messages use their own id; assistant/tool messages are
      // grouped into AI turns keyed by the first assistant id.
      let bubbleKey: string = messageId;
      const targetMsg = messages.find((m) => m.id === messageId);
      if (targetMsg && targetMsg.role !== "user") {
        const idx = messages.indexOf(targetMsg);
        let firstAssistantId = messageId;
        for (let i = idx; i >= 0; i--) {
          if (messages[i].role === "user") break;
          if (messages[i].role === "assistant") {
            firstAssistantId = messages[i].id;
          }
        }
        bubbleKey = firstAssistantId;
      }
      // Store the key; the scroll effect in useChatPageState will scroll once the modal closes
      pendingScrollKeyRef.current = bubbleKey;
    },
    [messages, pendingScrollKeyRef],
  );

  return (
    <>
      {/* Message Search Dialog */}
      <MessageSearch
        messages={messages}
        isOpen={isSearchOpen}
        onClose={onSearchClose}
        onJumpToMessage={handleJumpToMessage}
      />

      {/* Chat Export Dialog */}
      <ChatExportDialog
        messages={messages}
        isOpen={isExportOpen}
        onClose={onExportClose}
      />

      {/* Chat Settings Modal */}
      <ChatSettingsModal
        open={settingsOpen}
        onClose={onSettingsClose}
        settings={sessionSettings}
        onSettingsChange={onSettingsChange}
        modelValue={modelValue}
        onModelChange={onModelChange}
        groupedModelOptions={groupedModelOptions}
        isStreaming={isStreaming}
        availableTools={availableTools}
      />

      {/* Remote Binding Modal */}
      <RemoteBindingModal
        open={remoteBindModalOpen}
        onClose={onRemoteBindClose}
        onBind={onBind}
        checkBotOnline={checkBotOnline}
      />
    </>
  );
}
