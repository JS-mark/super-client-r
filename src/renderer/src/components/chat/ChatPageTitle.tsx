import {
  ApiOutlined,
  ClearOutlined,
  ExportOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  PlusOutlined,
  RobotOutlined,
  SearchOutlined,
  SettingOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { Badge, Button, Dropdown, Tooltip, theme } from "antd";
import { useTranslation } from "react-i18next";
import type { RemoteBinding } from "../../types/electron";
import type { ViewMode } from "../../hooks/useChatPageState";
import { RemoteBadge } from "./RemoteBadge";
import { ViewModeToggle } from "./ViewModeToggle";

const { useToken } = theme;

interface ChatPageTitleProps {
  hasMessages: boolean;
  isStreaming: boolean;
  conversationId: string | null;
  remoteBinding: RemoteBinding | null;
  unreadRemoteCount: number;
  viewMode: ViewMode;
  sidebarVisible: boolean;
  onViewModeChange: (mode: ViewMode) => void;
  onSearch: () => void;
  onExport: () => void;
  onClear: () => void;
  onNewChat: () => void;
  onNewAgentChat: () => void;
  onNewRemoteChat: () => void;
  onToggleSidebar: () => void;
  onOpenSettings: () => void;
  onUnbindRemote: () => void;
}

export function ChatPageTitle({
  hasMessages,
  isStreaming,
  conversationId,
  remoteBinding,
  unreadRemoteCount,
  viewMode,
  sidebarVisible,
  onViewModeChange,
  onSearch,
  onExport,
  onClear,
  onNewChat,
  onNewAgentChat,
  onNewRemoteChat,
  onToggleSidebar,
  onOpenSettings,
  onUnbindRemote,
}: ChatPageTitleProps) {
  const { t } = useTranslation();
  const { token } = useToken();

  return (
    <>
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
          <RobotOutlined className="text-white text-xs" />
        </div>
        <span
          style={{ color: token.colorText }}
          className="text-sm font-medium"
        >
          {t("title", "AI Chat", { ns: "chat" })}
        </span>
        {/* View mode toggle — only visible when remote binding exists */}
        {remoteBinding && (
          <div
            className="ml-2"
            // @ts-expect-error - WebkitAppRegion is a valid CSS property for Electron
            style={{ WebkitAppRegion: "no-drag" }}
          >
            <ViewModeToggle
              value={viewMode}
              onChange={onViewModeChange}
              unreadCount={viewMode === "remote" ? 0 : unreadRemoteCount}
            />
          </div>
        )}
      </div>
      <div
        className="flex items-center gap-2"
        // @ts-expect-error - WebkitAppRegion is a valid CSS property for Electron
        style={{ WebkitAppRegion: "no-drag" }}
      >
        {/* Remote Chat Badge */}
        {remoteBinding && (
          <RemoteBadge binding={remoteBinding} onUnbind={onUnbindRemote} />
        )}
        <Tooltip
          title={t("toolbar.searchMessages", "Search Messages", {
            ns: "chat",
          })}
        >
          <Button
            type="text"
            icon={<SearchOutlined />}
            onClick={onSearch}
            disabled={!hasMessages}
            className="rounded-lg"
          />
        </Tooltip>
        <Tooltip title={t("toolbar.export", "Export", { ns: "chat" })}>
          <Button
            type="text"
            icon={<ExportOutlined />}
            onClick={onExport}
            disabled={!hasMessages || isStreaming}
            className="rounded-lg"
          />
        </Tooltip>
        <Tooltip title={t("toolbar.clear", "Clear", { ns: "chat" })}>
          <Button
            type="text"
            icon={<ClearOutlined />}
            onClick={onClear}
            disabled={!hasMessages || isStreaming}
            className="rounded-lg"
          />
        </Tooltip>
        <Dropdown
          menu={{
            items: [
              {
                key: "direct",
                icon: <PlusOutlined />,
                label: t("newChat", "New Chat", { ns: "chat" }),
                onClick: onNewChat,
              },
              {
                key: "agent",
                icon: <ThunderboltOutlined />,
                label: t("sidebar.newAgentChat", "Agent Chat", { ns: "chat" }),
                onClick: onNewAgentChat,
              },
              {
                key: "remote",
                icon: <ApiOutlined />,
                label: t("remoteChat.newRemoteSession", "New Remote Session", { ns: "chat" }),
                onClick: onNewRemoteChat,
              },
            ],
          }}
          trigger={["click"]}
          disabled={isStreaming}
        >
          <Button
            type="text"
            icon={<PlusOutlined />}
            disabled={isStreaming}
            className="rounded-lg"
          />
        </Dropdown>

        <Tooltip title={t("chatHistory", "Chat History", { ns: "chat" })}>
          <Badge dot={unreadRemoteCount > 0 && viewMode !== "remote" && !sidebarVisible} offset={[-4, 4]}>
            <Button
              type="text"
              icon={sidebarVisible ? <MenuFoldOutlined /> : <MenuUnfoldOutlined />}
              onClick={onToggleSidebar}
              className="rounded-lg"
            />
          </Badge>
        </Tooltip>
        <Tooltip title={t("toolbar.settings", "Settings", { ns: "chat" })}>
          <Button
            type="text"
            icon={<SettingOutlined />}
            onClick={onOpenSettings}
            className="rounded-lg"
          />
        </Tooltip>
      </div>
    </>
  );
}
