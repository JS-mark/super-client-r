import {
  ApiOutlined,
  BookOutlined,
  BugOutlined,
  CheckCircleOutlined,
  ClearOutlined,
  CodeOutlined,
  CopyOutlined,
  DeleteOutlined,
  DesktopOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  GlobalOutlined,
  InfoCircleOutlined,
  KeyOutlined,
  LinkOutlined,
  MenuOutlined,
  MonitorOutlined,
  PlayCircleOutlined,
  PoweroffOutlined,
  ReloadOutlined,
  RocketOutlined,
  SaveOutlined,
  SettingOutlined,
  StarOutlined,
  SyncOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  InputNumber,
  message,
  Popconfirm,
  Progress,
  Radio,
  Row,
  Select,
  Skeleton,
  Space,
  Spin,
  Statistic,
  Switch,
  Tabs,
  Tag,
  Tooltip,
} from "antd";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { List, type ListImperativeAPI } from "react-window";
import { AboutModal } from "../components/AboutModal";
import { MainLayout } from "../components/layout/MainLayout";
import { McpConfig } from "../components/models/McpConfig";
import { AboutSection } from "../components/settings/AboutSection";
import { MenuSettingsWithModal } from "../components/settings/MenuSettings";
import { useLogWorker } from "../hooks/useLogWorker";
import { useTitle } from "../hooks/useTitle";
import { type ApiStatus, apiService } from "../services/apiService";
import {
  type AppInfo,
  appService,
  type LogFileInfo,
} from "../services/appService";

const PORT_MIN = 1024;
const PORT_MAX = 65535;
const DEFAULT_PORT = 3000;
const AUTO_REFRESH_INTERVAL = 5000;
const LOG_TAIL_LINES = 100; // 减少到100行，加快加载速度

// 错误重试工具函数
async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delay = 1000,
): Promise<T> {
  let lastError: Error | null = null;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e as Error;
      if (i < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, delay * (i + 1)));
      }
    }
  }
  throw lastError;
}

// 通用设置区块组件
const SettingSection: React.FC<{
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  extra?: React.ReactNode;
}> = ({ title, icon, children, extra }) => (
  <div className="p-6 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
        {icon}
        {title}
      </h3>
      {extra}
    </div>
    {children}
  </div>
);

// 错误状态组件
const ErrorState: React.FC<{
  message: string;
  onRetry: () => void;
  loading?: boolean;
}> = ({ message: errorMessage, onRetry, loading }) => (
  <Alert
    type="error"
    title={errorMessage}
    className="mb-4"
    action={
      <Button
        size="small"
        onClick={onRetry}
        loading={loading}
        icon={<ReloadOutlined />}
      >
        重试
      </Button>
    }
  />
);

// 单行日志组件 - 用于虚拟滚动
interface LogLineRowProps {
  lines: string[];
}

const LogLine = ({
  index,
  style,
  lines,
}: {
  index: number;
  style: React.CSSProperties;
  ariaAttributes: {
    "aria-posinset": number;
    "aria-setsize": number;
    role: "listitem";
  };
} & LogLineRowProps) => (
  <div
    style={{ ...style, height: 20 }}
    className="px-4 text-slate-100 text-xs font-mono leading-5 whitespace-pre-wrap break-all overflow-hidden"
  >
    {lines[index]}
  </div>
);

// 日志查看器组件
const LogViewer: React.FC = () => {
  const { t } = useTranslation();
  const [logFiles, setLogFiles] = useState<LogFileInfo[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>("");
  const [logLines, setLogLines] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<ListImperativeAPI>(null);
  const refreshTimerRef = useRef<number | null>(null);

  // 使用 Worker 处理日志
  const { parseLogs, isLoading: workerLoading } = useLogWorker();

  // 加载日志文件列表（轻量操作）
  const loadLogFiles = useCallback(async () => {
    try {
      const files = await appService.listLogFiles();
      setLogFiles(files);
      if (files.length > 0 && !selectedFile) {
        setSelectedFile(files[0].path);
      }
      setError(null);
    } catch {
      setError(t("loadLogFilesError", "Failed to load log files", { ns: "settings" }));
    }
  }, [selectedFile, t]);

  // 加载日志内容 - 使用 Worker 处理
  const loadLogs = useCallback(async () => {
    if (!selectedFile) return;

    setLoading(true);
    try {
      // 1. 从主进程获取原始内容（已优化为反向读取）
      const rawContent = await appService.getLogs(selectedFile, LOG_TAIL_LINES);

      // 2. 使用 Worker 在后台线程处理数据，避免阻塞主线程
      const { lines } = await parseLogs(rawContent);

      setLogLines(lines);
      setError(null);

      // 3. 滚动到底部
      requestAnimationFrame(() => {
        listRef.current?.scrollToRow({ index: lines.length - 1, align: "end" });
      });
    } catch {
      setError(t("loadLogsError", "Failed to load logs", { ns: "settings" }));
    } finally {
      setLoading(false);
    }
  }, [selectedFile, t, parseLogs]);

  // 首次加载文件列表
  useEffect(() => {
    loadLogFiles();
  }, [loadLogFiles]);

  // 选择文件时加载日志
  useEffect(() => {
    if (selectedFile) {
      loadLogs();
    }
  }, [selectedFile, loadLogs]);

  // 自动刷新
  useEffect(() => {
    if (autoRefresh && selectedFile) {
      refreshTimerRef.current = window.setInterval(
        loadLogs,
        AUTO_REFRESH_INTERVAL,
      );
    }
    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [autoRefresh, selectedFile, loadLogs]);

  const handleClearLogs = async () => {
    try {
      await appService.clearLogs();
      message.success(t("clearLogsSuccess", "Logs cleared", { ns: "settings" }));
      setLogLines([]);
      await loadLogFiles();
    } catch (e) {
      message.error(t("clearLogsError", "Failed to clear logs", { ns: "settings" }));
    }
  };

  const handleOpenLogsFolder = async () => {
    try {
      const logsPath = await appService.getLogsPath();
      await appService.openPath(logsPath);
    } catch (e) {
      message.error(
        t("openLogsFolderError", "Failed to open logs folder", { ns: "settings" }),
      );
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-4">
      {error && (
        <ErrorState
          message={error}
          onRetry={() => {
            loadLogFiles();
            loadLogs();
          }}
          loading={loading}
        />
      )}

      <div className="flex items-center gap-4 flex-wrap">
        <Select
          value={selectedFile}
          onChange={setSelectedFile}
          placeholder={t("selectLogFile", "Select log file", { ns: "settings" })}
          className="min-w-[300px]"
          size="large"
          options={logFiles.map((file) => ({
            value: file.path,
            label: (
              <span className="flex items-center justify-between">
                <span>{file.name}</span>
                <Tag className="ml-2">{formatFileSize(file.size)}</Tag>
              </span>
            ),
          }))}
        />

        <Space>
          <Tooltip
            title={
              autoRefresh
                ? t("disableAutoRefresh", "Disable auto-refresh", { ns: "settings" })
                : t("enableAutoRefresh", "Enable auto-refresh", { ns: "settings" })
            }
          >
            <Button
              icon={<SyncOutlined spin={autoRefresh} />}
              onClick={() => setAutoRefresh(!autoRefresh)}
              type={autoRefresh ? "primary" : "default"}
              size="large"
              className="!rounded-xl"
            />
          </Tooltip>

          <Button
            icon={<ReloadOutlined />}
            onClick={loadLogs}
            loading={loading}
            size="large"
            className="!rounded-xl"
          >
            {t("refresh", "Refresh", { ns: "settings" })}
          </Button>

          <Button
            icon={<FolderOpenOutlined />}
            onClick={handleOpenLogsFolder}
            size="large"
            className="!rounded-xl"
          >
            {t("openFolder", "Open Folder", { ns: "settings" })}
          </Button>

          <Popconfirm
            title={t("confirmClearLogs", "Clear all log files?", { ns: "settings" })}
            onConfirm={handleClearLogs}
            okText={t("confirm", "Confirm", { ns: "common" })}
            cancelText={t("cancel", "Cancel", { ns: "common" })}
          >
            <Button
              icon={<ClearOutlined />}
              danger
              size="large"
              className="!rounded-xl"
            >
              {t("clearLogs", "Clear Logs", { ns: "settings" })}
            </Button>
          </Popconfirm>
        </Space>
      </div>

      <div className="relative">
        {(loading || workerLoading) && logLines.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-slate-800/80 z-10 rounded-xl">
            <Spin fullscreen tip={workerLoading ? "Processing..." : "Loading..."} />
          </div>
        )}

        <div className="max-h-[420px] rounded-xl bg-slate-900 overflow-hidden">
          {logLines.length > 0 ? (
            <List<{ lines: string[] }>
              listRef={listRef}
              defaultHeight={500}
              rowCount={logLines.length}
              rowHeight={20}
              rowProps={{ lines: logLines }}
              rowComponent={LogLine}
              overscanCount={5}
              className="scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-800"
              style={{ height: 500 }}
            />
          ) : (
            <div className="h-full flex items-center justify-center">
              <Empty
                description={t("noLogs", "No logs available", { ns: "settings" })}
                className="[&_.ant-empty-description]:!text-slate-400"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// API Keys 配置组件
const ApiKeysConfig: React.FC = () => {
  const { t } = useTranslation();
  const [skillsmpKey, setSkillsmpKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  // 加载已保存的 API Key
  useEffect(() => {
    const loadApiKey = async () => {
      try {
        // 通过 IPC 获取 API Key
        const result = await window.electron.ipc.invoke(
          "app:get-config",
          "skillsmpApiKey",
        );
        if (result) {
          setSkillsmpKey(result as string);
        }
      } catch (e) {
        console.error("Failed to load API key:", e);
      }
    };
    loadApiKey();
  }, []);

  const handleSave = async () => {
    setLoading(true);
    try {
      await window.electron.ipc.invoke(
        "app:set-config",
        "skillsmpApiKey",
        skillsmpKey,
      );
      setSaved(true);
      message.success(t("apiKeySaved", "API Key saved successfully", { ns: "settings" }));
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      message.error(t("apiKeySaveError", "Failed to save API Key", { ns: "settings" }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <SettingSection
        title={t("skillsmpApi", "SkillsMP API", { ns: "settings" })}
        icon={<KeyOutlined />}
      >
        <div className="space-y-4">
          <div>
            <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              {t("skillsmpApiKey", "API Key", { ns: "settings" })}
            </span>
            <Input.Password
              value={skillsmpKey}
              onChange={(e) => setSkillsmpKey(e.target.value)}
              placeholder={t(
                "settings.skillsmpApiKeyPlaceholder",
                "Enter your SkillsMP API Key",
              )}
              className="!rounded-xl"
              size="large"
              prefix={<KeyOutlined className="text-slate-400" />}
            />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
              {t(
                "settings.skillsmpApiKeyHint",
                "Get your API Key from skillsmp.com",
              )}
            </p>
          </div>

          <Button
            type="primary"
            icon={saved ? <CheckCircleOutlined /> : <SaveOutlined />}
            onClick={handleSave}
            loading={loading}
            size="large"
            className="!rounded-xl"
          >
            {saved ? t("saved", "Saved", { ns: "common" }) : t("save", "Save", { ns: "common" })}
          </Button>
        </div>
      </SettingSection>
    </div>
  );
};

// 快捷键设置组件
const ShortcutSettings: React.FC = () => {
  const { t } = useTranslation();
  const [shortcuts, setShortcuts] = useState({
    newChat: "CmdOrCtrl+N",
    quickSearch: "CmdOrCtrl+K",
    toggleSidebar: "CmdOrCtrl+B",
    settings: "CmdOrCtrl+,",
  });

  const handleShortcutChange = (key: string, value: string) => {
    setShortcuts((prev) => ({ ...prev, [key]: value }));
  };

  const shortcutItems = [
    {
      key: "newChat",
      label: t("shortcuts.newChat", "New Chat", { ns: "settings" }),
      defaultValue: "CmdOrCtrl+N",
    },
    {
      key: "quickSearch",
      label: t("shortcuts.quickSearch", "Quick Search", { ns: "settings" }),
      defaultValue: "CmdOrCtrl+K",
    },
    {
      key: "toggleSidebar",
      label: t("shortcuts.toggleSidebar", "Toggle Sidebar", { ns: "settings" }),
      defaultValue: "CmdOrCtrl+B",
    },
    {
      key: "settings",
      label: t("shortcuts.settings", "Settings", { ns: "settings" }),
      defaultValue: "CmdOrCtrl+,",
    },
  ];

  return (
    <div className="space-y-6">
      <SettingSection
        title={t("shortcuts", "Keyboard Shortcuts", { ns: "settings" })}
        icon={<DesktopOutlined />}
      >
        <div className="space-y-4">
          {shortcutItems.map((item) => (
            <div key={item.key} className="flex items-center justify-between">
              <span className="text-slate-700 dark:text-slate-300">
                {item.label}
              </span>
              <Input
                value={shortcuts[item.key as keyof typeof shortcuts]}
                onChange={(e) => handleShortcutChange(item.key, e.target.value)}
                className="!w-[200px] !rounded-xl"
                placeholder={item.defaultValue}
              />
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-4">
          {t(
            "settings.shortcutsHint",
            "Use CmdOrCtrl for cross-platform compatibility",
          )}
        </p>
      </SettingSection>
    </div>
  );
};

// 悬浮窗设置组件
const FloatWidgetSettings: React.FC = () => {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  // 从主进程 store 读取初始值
  useEffect(() => {
    const loadSetting = async () => {
      try {
        const result = await window.electron.ipc.invoke(
          "app:get-config",
          "floatWidgetEnabled",
        );
        setEnabled(result === true);
      } catch {
        setEnabled(false);
      } finally {
        setLoading(false);
      }
    };
    loadSetting();
  }, []);

  const handleToggle = async (checked: boolean) => {
    setEnabled(checked);
    // 保存到主进程 store
    await window.electron.ipc.invoke(
      "app:set-config",
      "floatWidgetEnabled",
      checked,
    );
    // 发送 IPC 事件控制悬浮窗
    if (checked) {
      window.electron.ipc.send("float-widget:show");
    } else {
      window.electron.ipc.send("float-widget:hide");
    }
  };

  return (
    <SettingSection
      title={t("floatWidget", "Float Widget", { ns: "settings" })}
      icon={<DesktopOutlined />}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-slate-700 dark:text-slate-300 font-medium">
            {t("enableFloatWidget", "Enable Float Widget", { ns: "settings" })}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {t("floatWidgetHint", "Show a floating widget on desktop", { ns: "settings" })}
          </p>
        </div>
        <Switch
          checked={enabled}
          onChange={handleToggle}
          size="default"
          disabled={loading}
        />
      </div>
    </SettingSection>
  );
};

// 快速操作 Tab 组件
const QuickActionsTab: React.FC = () => {
  const { t } = useTranslation();

  const handleOpenDevTools = async () => {
    try {
      await appService.openDevTools();
      message.success(t("devToolsOpened", "Developer tools opened", { ns: "settings" }));
    } catch (e) {
      message.error(
        t("devToolsError", "Failed to open developer tools", { ns: "settings" }),
      );
    }
  };

  const handleRelaunch = async () => {
    try {
      await appService.relaunch();
    } catch (e) {
      message.error(t("relaunchError", "Failed to relaunch", { ns: "settings" }));
    }
  };

  const handleClearStorage = () => {
    localStorage.clear();
    sessionStorage.clear();
    message.success(
      t("storageClearedSuccess", "Storage cleared", { ns: "settings" }),
    );
  };

  const actions = [
    {
      key: "devTools",
      icon: <CodeOutlined />,
      label: t("openDevTools", "打开开发者工具", { ns: "settings" }),
      description: t("openDevToolsDesc", "打开 Chromium DevTools 进行调试", { ns: "settings" }),
      onClick: handleOpenDevTools,
      type: "primary" as const,
    },
    {
      key: "relaunch",
      icon: <ReloadOutlined />,
      label: t("relaunch", "重启应用", { ns: "settings" }),
      description: t("relaunchDesc", "完全重启应用程序", { ns: "settings" }),
      onClick: handleRelaunch,
      confirm: true,
      confirmTitle: t("confirmRelaunch", "确定要重启应用吗？", { ns: "settings" }),
    },
    {
      key: "clearStorage",
      icon: <DeleteOutlined />,
      label: t("clearStorage", "清除存储", { ns: "settings" }),
      description: t("clearStorageDesc", "清除 localStorage 和 sessionStorage", { ns: "settings" }),
      onClick: handleClearStorage,
      danger: true,
    },
  ];

  return (
    <div className="space-y-4">
      {actions.map((action) => (
        <div
          key={action.key}
          className="flex items-center justify-between p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:shadow-md transition-shadow"
        >
          <div className="flex items-center gap-4">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${action.type === "primary"
              ? "bg-blue-500 text-white"
              : action.danger
                ? "bg-red-100 dark:bg-red-900/30 text-red-500"
                : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
              }`}>
              {action.icon}
            </div>
            <div>
              <div className="font-medium text-slate-800 dark:text-slate-200">
                {action.label}
              </div>
              <div className="text-sm text-slate-500 dark:text-slate-400">
                {action.description}
              </div>
            </div>
          </div>
          {action.confirm ? (
            <Popconfirm
              title={action.confirmTitle}
              onConfirm={action.onClick}
              okText={t("confirm", "确定", { ns: "common" })}
              cancelText={t("cancel", "取消", { ns: "common" })}
            >
              <Button
                type={action.type}
                danger={action.danger}
                className="!rounded-lg"
              >
                {action.label}
              </Button>
            </Popconfirm>
          ) : (
            <Button
              type={action.type}
              danger={action.danger}
              onClick={action.onClick}
              className="!rounded-lg"
            >
              {action.label}
            </Button>
          )}
        </div>
      ))}
    </div>
  );
};

// 系统信息 Tab 组件
const SystemInfoTab: React.FC = () => {
  const { t } = useTranslation();
  const [debugInfo, setDebugInfo] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);

  const collectDebugInfo = useCallback(async () => {
    setLoading(true);
    try {
      const [appInfo, userDataPath, apiStatus] = await Promise.all([
        appService.getInfo(),
        appService.getUserDataPath(),
        apiService.getStatus(),
      ]);

      setDebugInfo({
        app: appInfo,
        userDataPath,
        apiStatus,
        renderer: {
          userAgent: navigator.userAgent,
          language: navigator.language,
          cookieEnabled: navigator.cookieEnabled,
          onLine: navigator.onLine,
          memory:
            "memory" in performance
              ? (performance as unknown as { memory: unknown }).memory
              : null,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (e) {
      message.error(
        t("collectDebugInfoError", "Failed to collect debug info", { ns: "settings" }),
      );
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    collectDebugInfo();
  }, [collectDebugInfo]);

  const handleCopyDebugInfo = () => {
    if (debugInfo) {
      navigator.clipboard.writeText(JSON.stringify(debugInfo, null, 2));
      message.success(t("copied", "Copied to clipboard", { ns: "settings" }));
    }
  };

  const infoItems = debugInfo ? [
    { label: t("appName", "应用名称", { ns: "settings" }), value: (debugInfo.app as AppInfo)?.name || "N/A" },
    { label: t("version", "版本", { ns: "settings" }), value: (debugInfo.app as AppInfo)?.version || "N/A" },
    { label: "Electron", value: (debugInfo.app as AppInfo)?.electron || "N/A" },
    { label: "Node.js", value: (debugInfo.app as AppInfo)?.node || "N/A" },
    { label: t("platform", "平台", { ns: "settings" }), value: (debugInfo.app as AppInfo)?.platform || "N/A" },
    { label: t("architecture", "架构", { ns: "settings" }), value: (debugInfo.app as AppInfo)?.arch || "N/A" },
    { label: t("userDataPath", "用户数据路径", { ns: "settings" }), value: debugInfo.userDataPath as string || "N/A", fullWidth: true },
    { label: t("apiStatus", "API 状态", { ns: "settings" }), value: (debugInfo.apiStatus as ApiStatus)?.status === "running" ? t("running", "运行中", { ns: "settings" }) : t("stopped", "已停止", { ns: "settings" }) },
    { label: t("apiPort", "API 端口", { ns: "settings" }), value: (debugInfo.apiStatus as ApiStatus)?.port || "N/A" },
  ] : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-2">
        <Button
          icon={<ReloadOutlined />}
          onClick={collectDebugInfo}
          loading={loading}
          size="small"
        >
          {t("refresh", "刷新", { ns: "settings" })}
        </Button>
        <Button
          icon={<CopyOutlined />}
          onClick={handleCopyDebugInfo}
          size="small"
          disabled={!debugInfo}
        >
          {t("copyJson", "复制 JSON", { ns: "settings" })}
        </Button>
      </div>

      {loading && !debugInfo ? (
        <Skeleton active />
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {infoItems.map((item) => (
            <div
              key={item.value}
              className={`p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 ${item.fullWidth ? "col-span-2" : ""
                }`}
            >
              <div className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                {item.label}
              </div>
              <div className="text-sm font-medium text-slate-800 dark:text-slate-200 font-mono break-all">
                {item.value}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// 性能监控 Tab 组件
const PerformanceMonitorTab: React.FC = () => {
  const { t } = useTranslation();
  const [metrics, setMetrics] = useState({
    pageLoadTime: 0,
    memoryUsed: 0,
    memoryTotal: 0,
    cpuCores: navigator.hardwareConcurrency || 0,
    networkStatus: navigator.onLine,
    language: navigator.language,
  });

  useEffect(() => {
    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    const loadTime = navigation ? navigation.loadEventEnd - navigation.startTime || 0 : performance.now();
    const memory = (performance as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } }).memory;

    setMetrics({
      pageLoadTime: Math.round(loadTime),
      memoryUsed: memory ? Math.round(memory.usedJSHeapSize / 1024 / 1024) : 0,
      memoryTotal: memory ? Math.round(memory.totalJSHeapSize / 1024 / 1024) : 0,
      cpuCores: navigator.hardwareConcurrency || 0,
      networkStatus: navigator.onLine,
      language: navigator.language,
    });
  }, []);

  const statCards = [
    {
      title: t("pageLoadTime", "页面加载时间", { ns: "settings" }),
      value: `${metrics.pageLoadTime} ms`,
      icon: <ThunderboltOutlined />,
      color: "#3b82f6",
    },
    {
      title: t("networkStatus", "网络状态", { ns: "settings" }),
      value: metrics.networkStatus ? t("online", "在线", { ns: "settings" }) : t("offline", "离线", { ns: "settings" }),
      icon: <GlobalOutlined />,
      color: metrics.networkStatus ? "#22c55e" : "#ef4444",
    },
    {
      title: t("cpuCores", "CPU 核心数", { ns: "settings" }),
      value: metrics.cpuCores || "N/A",
      icon: <DesktopOutlined />,
      color: "#a855f7",
    },
    {
      title: t("language", "语言", { ns: "settings" }),
      value: metrics.language.toUpperCase(),
      icon: <InfoCircleOutlined />,
      color: "#f97316",
    },
  ];

  const memoryUsagePercent = metrics.memoryTotal
    ? Math.round((metrics.memoryUsed / metrics.memoryTotal) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <Row gutter={[16, 16]}>
        {statCards.map((card, index) => (
          <Col span={12} key={card.value}>
            <Card className="!rounded-xl !border-slate-200 dark:!border-slate-700">
              <Statistic
                title={card.title}
                value={card.value}
                prefix={
                  <span style={{ color: card.color, marginRight: 8 }}>
                    {card.icon}
                  </span>
                }
                valueStyle={{ color: card.color, fontSize: "24px" }}
              />
            </Card>
          </Col>
        ))}
      </Row>

      {metrics.memoryTotal > 0 && (
        <Card
          title={
            <span className="flex items-center gap-2">
              <MonitorOutlined />
              {t("memoryUsage", "内存使用", { ns: "settings" })}
            </span>
          }
          className="!rounded-xl !border-slate-200 dark:!border-slate-700"
        >
          <div className="space-y-4">
            <Progress
              percent={memoryUsagePercent}
              status={memoryUsagePercent > 80 ? "exception" : "active"}
              strokeColor={
                memoryUsagePercent > 80
                  ? "#ef4444"
                  : memoryUsagePercent > 60
                    ? "#f97316"
                    : "#22c55e"
              }
            />
            <div className="flex justify-between text-sm text-slate-500 dark:text-slate-400">
              <span>
                {t("used", "已使用", { ns: "settings" })}: {metrics.memoryUsed} MB
              </span>
              <span>
                {t("total", "总计", { ns: "settings" })}: {metrics.memoryTotal} MB
              </span>
            </div>
          </div>
        </Card>
      )}

      <Card className="!rounded-xl !border-slate-200 dark:!border-slate-700 !bg-blue-50 dark:!bg-blue-900/20">
        <div className="flex items-start gap-3">
          <InfoCircleOutlined className="text-blue-500 mt-1" />
          <div>
            <div className="font-medium text-slate-800 dark:text-slate-200">
              {t("performanceTips", "性能提示", { ns: "settings" })}
            </div>
            <ul className="text-sm text-slate-500 dark:text-slate-400 mt-2 space-y-1 list-disc list-inside">
              <li>{t("performanceTip1", "定期清理日志文件可以释放磁盘空间", { ns: "settings" })}</li>
              <li>{t("performanceTip2", "关闭不用的功能可以减少内存占用", { ns: "settings" })}</li>
              <li>{t("performanceTip3", "使用开发者工具可以分析性能瓶颈", { ns: "settings" })}</li>
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
};

// 调试工具组件 - 使用 Tabs 组织
const DebugTools: React.FC = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("quickActions");

  const tabItems = [
    {
      key: "quickActions",
      label: (
        <span className="flex items-center gap-2">
          <ThunderboltOutlined />
          {t("quickActions", "快速操作", { ns: "settings" })}
        </span>
      ),
      children: <QuickActionsTab />,
    },
    {
      key: "systemInfo",
      label: (
        <span className="flex items-center gap-2">
          <InfoCircleOutlined />
          {t("systemInfo", "系统信息", { ns: "settings" })}
        </span>
      ),
      children: <SystemInfoTab />,
    },
    {
      key: "performance",
      label: (
        <span className="flex items-center gap-2">
          <MonitorOutlined />
          {t("performanceMonitor", "性能监控", { ns: "settings" })}
        </span>
      ),
      children: <PerformanceMonitorTab />,
    },
  ];

  return (
    <Tabs
      activeKey={activeTab}
      onChange={setActiveTab}
      items={tabItems}
    />
  );
};

const Settings: React.FC = () => {
  const { t, i18n } = useTranslation();

  // 页面标题组件 - 同时用于 TitleBar 和页面头部
  const pageTitle = useMemo(() => {
    return (
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-gray-500 to-slate-600 flex items-center justify-center">
          <SettingOutlined className="text-white text-xs" />
        </div>
        <span className="text-slate-700 dark:text-slate-200 text-sm font-medium">{t("title", "设置", { ns: "settings" })}</span>
      </div>
    )
  }, [t]);

  // 设置标题栏
  useTitle(pageTitle);

  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState("general");
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [userDataPath, setUserDataPath] = useState("");
  const [apiStatus, setApiStatus] = useState<ApiStatus>({
    status: "stopped",
    port: 0,
  });
  const [apiLoading, setApiLoading] = useState(false);
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aboutModalOpen, setAboutModalOpen] = useState(false);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [info, path, status] = await Promise.all([
        withRetry(() => appService.getInfo()),
        withRetry(() => appService.getUserDataPath()),
        withRetry(() => apiService.getStatus()),
      ]);

      setAppInfo(info);
      setUserDataPath(path);
      setApiStatus(status);
      form?.setFieldsValue({
        port: status.port || DEFAULT_PORT,
        language: i18n.language,
      });
    } catch (e) {
      console.error("Failed to load settings:", e);
      setError(t("loadError", "Failed to load settings", { ns: "settings" }));
    } finally {
      setLoading(false);
    }
  }, [form, i18n.language, t]);

  useEffect(() => {
    loadData();

    const handleStatusUpdate = (_event: unknown, ...args: unknown[]) => {
      const status = args[0] as ApiStatus;
      setApiStatus(status);
      if (status.port) {
        form.setFieldValue("port", status.port);
      }
    };

    const handleNavigate = (_event: unknown, ...args: unknown[]) => {
      const path = args[0] as string;
      if (path.includes("tab=about")) {
        setActiveTab("about");
      } else if (path.includes("tab=logs")) {
        setActiveTab("logs");
      } else if (path.includes("tab=debug")) {
        setActiveTab("debug");
      }
    };

    window.electron.ipc.on("server-status-update", handleStatusUpdate);
    window.electron.ipc.on("navigate-to", handleNavigate);

    return () => {
      window.electron.ipc.off("server-status-update", handleStatusUpdate);
      window.electron.ipc.off("navigate-to", handleNavigate);
    };
  }, [loadData, form]);

  const handleOpenPath = async () => {
    try {
      await appService.openPath(userDataPath);
    } catch (e) {
      message.error(t("openPathError", "Failed to open path", { ns: "settings" }));
    }
  };

  const handleCheckUpdate = async () => {
    try {
      const result = await appService.checkUpdate();
      if (result.updateAvailable) {
        message.success(result.message);
      } else {
        message.info(result.message);
      }
    } catch (e) {
      message.error(t("checkUpdateError", "Failed to check updates", { ns: "settings" }));
    }
  };

  const handleApiAction = async (action: "start" | "stop" | "restart") => {
    setApiLoading(true);
    try {
      const port = form.getFieldValue("port");
      if (action === "start") {
        await apiService.start();
      } else if (action === "stop") {
        await apiService.stop();
      } else if (action === "restart") {
        await apiService.setPort(Number(port));
        await apiService.restart(Number(port));
      }
      message.success(
        t(
          `settings.api${action.charAt(0).toUpperCase() + action.slice(1)}Success`,
          `Server ${action}ed successfully`,
        ),
      );
    } catch (e) {
      message.error(
        t(
          `settings.api${action.charAt(0).toUpperCase() + action.slice(1)}Error`,
          `Failed to ${action} server`,
        ),
      );
    } finally {
      setApiLoading(false);
      loadData();
    }
  };

  const validatePort = (_: unknown, value: number) => {
    if (!value) {
      return Promise.reject(
        new Error(t("portRequired", "Port is required", { ns: "settings" })),
      );
    }
    if (value < PORT_MIN || value > PORT_MAX) {
      return Promise.reject(
        new Error(
          t(
            "settings.portRange",
            `Port must be between ${PORT_MIN} and ${PORT_MAX}`,
          ),
        ),
      );
    }
    return Promise.resolve();
  };

  const items = [
    {
      key: "general",
      label: (
        <span className="flex items-center gap-2 font-medium">
          <SettingOutlined />
          {t("general", "General", { ns: "settings" })}
        </span>
      ),
      children: (
        <Card
          className="!border-0 !shadow-none !bg-transparent"
          loading={loading}
        >
          {error && <ErrorState message={error} onRetry={loadData} />}

          <div className="space-y-6">
            <SettingSection
              title={t("userDataPath", "User Data Directory", { ns: "settings" })}
            >
              <div className="space-y-2">
                <Space.Compact style={{ width: "100%" }}>
                  <Input
                    value={userDataPath}
                    readOnly
                    className="!rounded-l-xl"
                    placeholder={t(
                      "settings.userDataPathPlaceholder",
                      "User data directory path",
                    )}
                  />
                  <Button
                    icon={<FolderOpenOutlined />}
                    onClick={handleOpenPath}
                    className="!rounded-r-xl"
                  >
                    {t("open", "Open", { ns: "settings" })}
                  </Button>
                </Space.Compact>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t(
                    "settings.userDataPathHint",
                    "This directory stores application data and cannot be changed",
                  )}
                </p>
              </div>
            </SettingSection>

            <SettingSection
              title={t("language", "Language", { ns: "settings" })}
              icon={<GlobalOutlined />}
            >
              <Radio.Group
                value={i18n.language}
                onChange={(e) => i18n.changeLanguage(e.target.value)}
                optionType="button"
                buttonStyle="solid"
                size="large"
              >
                <Radio.Button value="zh">中文</Radio.Button>
                <Radio.Button value="en">English</Radio.Button>
              </Radio.Group>
            </SettingSection>

            <FloatWidgetSettings />
          </div>
        </Card>
      ),
    },
    {
      key: "menu",
      label: (
        <span className="flex items-center gap-2 font-medium">
          <MenuOutlined />
          {t("menuConfig", "Menu", { ns: "settings" })}
        </span>
      ),
      children: (
        <Card className="!border-0 !shadow-none !bg-transparent">
          <MenuSettingsWithModal />
        </Card>
      ),
    },
    {
      key: "mcp",
      label: (
        <span className="flex items-center gap-2 font-medium">
          <ApiOutlined />
          MCP Services
        </span>
      ),
      children: <McpConfig />,
    },
    {
      key: "api",
      label: (
        <span className="flex items-center gap-2 font-medium">
          <GlobalOutlined />
          {t("apiService", "API Service", { ns: "settings" })}
        </span>
      ),
      children: (
        <Card
          className="!border-0 !shadow-none !bg-transparent"
          loading={loading}
        >
          <SettingSection title={t("apiService", "API Service", { ns: "settings" })}>
            <Form form={form} layout="inline" className="w-full">
              <div className="flex items-center gap-4 flex-wrap w-full">
                {/* 状态指示器 */}
                <div className="flex items-center gap-2 min-w-[120px]">
                  <div
                    className={`w-2.5 h-2.5 rounded-full ${apiStatus.status === "running"
                      ? "bg-green-500 animate-pulse"
                      : "bg-red-500"
                      }`}
                  />
                  <span
                    className={`font-medium text-sm uppercase ${apiStatus.status === "running"
                      ? "text-green-600 dark:text-green-400"
                      : "text-red-600 dark:text-red-400"
                      }`}
                  >
                    {apiStatus.status === "running"
                      ? t("running", "Running", { ns: "settings" })
                      : t("stopped", "Stopped", { ns: "settings" })}
                  </span>
                </div>

                {/* 端口输入 */}
                <Form.Item
                  name="port"
                  rules={[{ validator: validatePort }]}
                  className="!mb-0 flex-shrink-0"
                >
                  <InputNumber
                    min={PORT_MIN}
                    max={PORT_MAX}
                    placeholder={`${DEFAULT_PORT}`}
                    prefix={
                      <span className="text-slate-400 text-xs mr-1">Port</span>
                    }
                    className="!w-[140px]"
                    size="middle"
                    disabled={apiStatus.status === "running"}
                  />
                </Form.Item>

                {/* 操作按钮组 */}
                <div className="flex items-center gap-2 ml-auto">
                  {apiStatus.status === "stopped" ? (
                    <Button
                      type="primary"
                      icon={<PlayCircleOutlined />}
                      onClick={() => handleApiAction("start")}
                      loading={apiLoading}
                      className="!rounded-lg"
                    >
                      {t("start", "Start", { ns: "settings" })}
                    </Button>
                  ) : (
                    <>
                      <Button
                        danger
                        icon={<PoweroffOutlined />}
                        onClick={() => handleApiAction("stop")}
                        loading={apiLoading}
                        className="!rounded-lg"
                      >
                        {t("stop", "Stop", { ns: "settings" })}
                      </Button>
                      <Tooltip
                        title={t("restartTip", "Apply port changes", { ns: "settings" })}
                      >
                        <Button
                          icon={<ReloadOutlined />}
                          onClick={() => handleApiAction("restart")}
                          loading={apiLoading}
                          className="!rounded-lg"
                        >
                          {t("restart", "Restart", { ns: "settings" })}
                        </Button>
                      </Tooltip>
                    </>
                  )}
                </div>
              </div>

              {/* 提示信息 */}
              {apiStatus.status === "running" && (
                <>
                  <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
                    <LinkOutlined />
                    <span>
                      {t("listeningOn", "Listening on", { ns: "settings" })}:{" "}
                      <code className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-blue-600 dark:text-blue-400">
                        http://localhost:{apiStatus.port}
                      </code>
                    </span>
                    <Button
                      type="link"
                      size="small"
                      icon={<CopyOutlined />}
                      onClick={() => {
                        navigator.clipboard.writeText(
                          `http://localhost:${apiStatus.port}`,
                        );
                        message.success(
                          t("copied", "Copied to clipboard", { ns: "settings" }),
                        );
                      }}
                      className="!px-1"
                    />
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-sm text-slate-500">
                    <BookOutlined />
                    <span>
                      {t("apiDocs", "API Docs", { ns: "settings" })}:{" "}
                      <Button
                        type="link"
                        size="small"
                        className="!px-0 !py-0 h-auto"
                        onClick={() => {
                          appService.openExternal(
                            `http://localhost:${apiStatus.port}/api-docs`,
                          );
                        }}
                      >
                        <code className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-blue-600 dark:text-blue-400">
                          http://localhost:{apiStatus.port}/api-docs
                        </code>
                      </Button>
                    </span>
                  </div>
                </>
              )}
            </Form>
          </SettingSection>
        </Card>
      ),
    },
    {
      key: "apikeys",
      label: (
        <span className="flex items-center gap-2 font-medium">
          <KeyOutlined />
          {t("apiKeys", "API Keys", { ns: "settings" })}
        </span>
      ),
      children: (
        <Card className="!border-0 !shadow-none !bg-transparent">
          <ApiKeysConfig />
        </Card>
      ),
    },
    {
      key: "shortcuts",
      label: (
        <span className="flex items-center gap-2 font-medium">
          <KeyOutlined />
          {t("shortcuts", "Shortcuts", { ns: "settings" })}
        </span>
      ),
      children: (
        <Card className="!border-0 !shadow-none !bg-transparent">
          <ShortcutSettings />
        </Card>
      ),
    },
    {
      key: "logs",
      label: (
        <span className="flex items-center gap-2 font-medium">
          <FileTextOutlined />
          {t("logs", "Logs", { ns: "settings" })}
        </span>
      ),
      children: (
        <Card className="!border-0 !shadow-none !bg-transparent">
          <LogViewer />
        </Card>
      ),
    },
    {
      key: "debug",
      label: (
        <span className="flex items-center gap-2 font-medium">
          <BugOutlined />
          {t("debug", "Debug", { ns: "settings" })}
        </span>
      ),
      children: (
        <Card className="!border-0 !shadow-none !bg-transparent">
          <DebugTools />
        </Card>
      ),
    },
    {
      key: "about",
      label: (
        <span className="flex items-center gap-2 font-medium">
          <InfoCircleOutlined />
          {t("aboutTitle", "About", { ns: "settings" })}
        </span>
      ),
      children: (
        <AboutSection
          appInfo={appInfo}
          onCheckUpdate={handleCheckUpdate}
          onOpenGitHub={() =>
            window.open("https://github.com/example/super-client", "_blank")
          }
          onReportBug={() =>
            window.open(
              "https://github.com/example/super-client/issues",
              "_blank",
            )
          }
          onOpenLicense={() =>
            window.open(
              "https://github.com/example/super-client/blob/main/LICENSE",
              "_blank",
            )
          }
          onOpenModal={() => setAboutModalOpen(true)}
        />
      ),
    },
  ];

  return (
    <MainLayout>
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={items}
        tabPlacement="start"
        className="!bg-white dark:!bg-slate-800 h-full !p-6 settings-tabs"
      />
      <AboutModal
        open={aboutModalOpen}
        onClose={() => setAboutModalOpen(false)}
        appInfo={appInfo}
      />
    </MainLayout>
  );
};

export default Settings;
