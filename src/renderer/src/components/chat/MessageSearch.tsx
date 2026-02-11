import { useState, useCallback, useEffect } from "react";
import { Input, Modal, List, Tag, Button, Empty } from "antd";
import { SearchOutlined, ClockCircleOutlined, CloseOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/utils";
import { useMessageStore } from "../../stores/messageStore";
import type { Message } from "../../stores/chatStore";

interface MessageSearchProps {
  messages: Message[];
  isOpen: boolean;
  onClose: () => void;
  onJumpToMessage: (messageId: string) => void;
}

export function MessageSearch({
  messages,
  isOpen,
  onClose,
  onJumpToMessage,
}: MessageSearchProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Message[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const { searchMessages, searchHistory, addSearchHistory, clearSearchHistory } =
    useMessageStore();

  const handleSearch = useCallback(
    (searchQuery: string) => {
      if (!searchQuery.trim()) {
        setResults([]);
        return;
      }

      setIsSearching(true);
      const searchResults = searchMessages(messages, searchQuery, {
        caseSensitive: false,
        wholeWord: false,
        role: "all",
      });
      setResults(searchResults);
      setIsSearching(false);

      if (searchQuery.trim()) {
        addSearchHistory(searchQuery);
      }
    },
    [messages, searchMessages, addSearchHistory]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      handleSearch(query);
    }, 300);

    return () => clearTimeout(timer);
  }, [query, handleSearch]);

  const handleSelectResult = (message: Message) => {
    onJumpToMessage(message.id);
    onClose();
  };

  const highlightText = (text: string, searchQuery: string) => {
    if (!searchQuery.trim()) return text;

    const regex = new RegExp(`(${escapeRegExp(searchQuery)})`, "gi");
    const parts = text.split(regex);

    return parts.map((part, i) =>
      regex.test(part) ? (
        <mark key={i} className="bg-yellow-200 dark:bg-yellow-700 px-0.5 rounded">
          {part}
        </mark>
      ) : (
        <span key={i}>{part}</span>
      )
    );
  };

  return (
    <Modal
      title={t("chat.searchMessages", "搜索消息")}
      open={isOpen}
      onCancel={onClose}
      footer={null}
      width={600}
      className="message-search-modal"
    >
      <div className="space-y-4">
        {/* 搜索输入 */}
        <Input
          prefix={<SearchOutlined className="text-slate-400" />}
          placeholder={t("chat.searchPlaceholder", "搜索聊天记录...")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          allowClear
          size="large"
          autoFocus
        />

        {/* 搜索历史 */}
        {!query && searchHistory.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-500">
                {t("chat.searchHistory", "搜索历史")}
              </span>
              <Button
                type="link"
                size="small"
                onClick={clearSearchHistory}
              >
                {t("common.clear", "清空")}
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {searchHistory.map((term) => (
                <Tag
                  key={term}
                  icon={<ClockCircleOutlined />}
                  className="cursor-pointer"
                  onClick={() => setQuery(term)}
                >
                  {term}
                </Tag>
              ))}
            </div>
          </div>
        )}

        {/* 搜索结果 */}
        {query && (
          <div>
            <div className="text-sm text-slate-500 mb-2">
              {isSearching
                ? t("chat.searching", "搜索中...")
                : t("chat.searchResults", "找到 {{count}} 条结果", {
                    count: results.length,
                  })}
            </div>

            {results.length === 0 && !isSearching ? (
              <Empty
                description={t("chat.noSearchResults", "未找到相关消息")}
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            ) : (
              <List
                className="max-h-[400px] overflow-y-auto"
                dataSource={results}
                renderItem={(msg) => (
                  <List.Item
                    className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg px-3 transition-colors"
                    onClick={() => handleSelectResult(msg)}
                  >
                    <div className="w-full">
                      <div className="flex items-center gap-2 mb-1">
                        <Tag
                          color={msg.role === "user" ? "blue" : "green"}
                        >
                          {msg.role === "user"
                            ? t("chat.user", "用户")
                            : t("chat.assistant", "助手")}
                        </Tag>
                        <span className="text-xs text-slate-400">
                          {new Date(msg.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <div className="text-sm text-slate-700 dark:text-slate-300 line-clamp-2">
                        {highlightText(msg.content, query)}
                      </div>
                    </div>
                  </List.Item>
                )}
              />
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
