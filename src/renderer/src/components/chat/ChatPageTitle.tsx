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
} from "@ant-design/icons";
import { Badge, Button, Tooltip, theme } from "antd";
import { useTranslation } from "react-i18next";
import type { RemoteBinding } from "../../types/electron";
import type { ViewMode } from "../../hooks/useChatPageState";
import { RemoteBadge } from "./RemoteBadge";
import { ViewModeToggle } from "./ViewModeToggle";

const { useToken } = theme;

interface ChatPageTitleProps {
  hasMessages: boolean;
  isStreaming: boolean;
  remoteBinding: RemoteBinding | null;
  unreadRemoteCount: number;
  viewMode: ViewMode;
  sidebarVisible: boolean;
  onViewModeChange: (mode: ViewMode) => void;
  onSearch: () => void;
  onExport: () => void;
  onClear: () => void;
  onNewChat: () => void;
  onToggleSidebar: () => void;
  onOpenSettings: () => void;
  onBindRemote: () => void;
  onUnbindRemote: () => void;
}

export function ChatPageTitle({
  hasMessages,
  isStreaming,
  remoteBinding,
  unreadRemoteCount,
  viewMode,
  sidebarVisible,
  onViewModeChange,
  onSearch,
  onExport,
  onClear,
  onNewChat,
  onToggleSidebar,
  onOpenSettings,
  onBindRemote,
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
        {/* Bind Bot Button */}
        {!remoteBinding && (
          <Tooltip
            title={t("remoteChat.bindBot", "Bind Bot", {
              ns: "chat",
            })}
          >
            <Button
              type="text"
              icon={<ApiOutlined />}
              onClick={onBindRemote}
              className="rounded-lg"
            />
          </Tooltip>
        )}
        <Tooltip
          title={t("chat.toolbar.searchMessages", "Search Messages", {
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
        <Tooltip title={t("chat.toolbar.export", "Export", { ns: "chat" })}>
          <Button
            type="text"
            icon={<ExportOutlined />}
            onClick={onExport}
            disabled={!hasMessages || isStreaming}
            className="rounded-lg"
          />
        </Tooltip>
        <Tooltip title={t("chat.toolbar.clear", "Clear", { ns: "chat" })}>
          <Button
            type="text"
            icon={<ClearOutlined />}
            onClick={onClear}
            disabled={!hasMessages || isStreaming}
            className="rounded-lg"
          />
        </Tooltip>
        <Tooltip
          title={t("chat.toolbar.newChat", "New Chat", { ns: "chat" })}
        >
          <Button
            type="text"
            icon={<PlusOutlined />}
            onClick={onNewChat}
            disabled={isStreaming || !hasMessages}
            className="rounded-lg"
          />
        </Tooltip>

        <Tooltip title={t("chat.chatHistory", "Chat History", { ns: "chat" })}>
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
