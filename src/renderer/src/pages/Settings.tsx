import {
  ApiOutlined,
  BugOutlined,
  ClearOutlined,
  CodeOutlined,
  CopyOutlined,
  DeleteOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  GithubOutlined,
  GlobalOutlined,
  HeartOutlined,
  InfoCircleOutlined,
  LinkOutlined,
  MenuOutlined,
  PlayCircleOutlined,
  PoweroffOutlined,
  ReloadOutlined,
  SettingOutlined,
  SyncOutlined,
} from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  Divider,
  Empty,
  Form,
  Input,
  InputNumber,
  message,
  Popconfirm,
  Radio,
  Select,
  Skeleton,
  Space,
  Spin,
  Tabs,
  Tag,
  Tooltip,
} from "antd";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { MainLayout } from "../components/layout/MainLayout";
import { McpConfig } from "../components/models/McpConfig";
import { MenuSettingsWithModal } from "../components/settings/MenuSettings";
import type { MenuItemConfig } from "../types/menu";
import { getMenuConfig, saveMenuConfig } from "../types/menu";
import { type ApiStatus, apiService } from "../services/apiService";
import {
  type AppInfo,
  type LogFileInfo,
  appService,
} from "../services/appService";

const PORT_MIN = 1024;
const PORT_MAX = 65535;
const DEFAULT_PORT = 3000;
const AUTO_REFRESH_INTERVAL = 5000;
const LOG_TAIL_LINES = 500;

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
  <div className="p-6 rounded-2xl bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm border border-slate-200/50 dark:border-slate-700/50">
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
    message={errorMessage}
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

// 日志查看器组件
const LogViewer: React.FC = () => {
  const { t } = useTranslation();
  const [logFiles, setLogFiles] = useState<LogFileInfo[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>("");
  const [logContent, setLogContent] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logContainerRef = useRef<HTMLPreElement>(null);
  const refreshTimerRef = useRef<number | null>(null);

  const loadLogFiles = useCallback(async () => {
    try {
      const files = await withRetry(() => appService.listLogFiles());
      setLogFiles(files);
      if (files.length > 0 && !selectedFile) {
        setSelectedFile(files[0].path);
      }
      setError(null);
    } catch (e) {
      setError(t("settings.loadLogFilesError", "Failed to load log files"));
    }
  }, [selectedFile, t]);

  const loadLogs = useCallback(async () => {
    if (!selectedFile) return;

    setLoading(true);
    try {
      const content = await withRetry(() =>
        appService.getLogs(selectedFile, LOG_TAIL_LINES),
      );
      setLogContent(content);
      setError(null);

      // 自动滚动到底部
      requestAnimationFrame(() => {
        if (logContainerRef.current) {
          logContainerRef.current.scrollTop =
            logContainerRef.current.scrollHeight;
        }
      });
    } catch (e) {
      setError(t("settings.loadLogsError", "Failed to load logs"));
    } finally {
      setLoading(false);
    }
  }, [selectedFile, t]);

  useEffect(() => {
    loadLogFiles();
  }, [loadLogFiles]);

  useEffect(() => {
    if (selectedFile) {
      loadLogs();
    }
  }, [selectedFile, loadLogs]);

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
      message.success(t("settings.clearLogsSuccess", "Logs cleared"));
      setLogContent("");
      await loadLogFiles();
    } catch (e) {
      message.error(t("settings.clearLogsError", "Failed to clear logs"));
    }
  };

  const handleOpenLogsFolder = async () => {
    try {
      const logsPath = await appService.getLogsPath();
      await appService.openPath(logsPath);
    } catch (e) {
      message.error(t("settings.openLogsFolderError", "Failed to open logs folder"));
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
          placeholder={t("settings.selectLogFile", "Select log file")}
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
                ? t("settings.disableAutoRefresh", "Disable auto-refresh")
                : t("settings.enableAutoRefresh", "Enable auto-refresh")
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
            {t("settings.refresh", "Refresh")}
          </Button>

          <Button
            icon={<FolderOpenOutlined />}
            onClick={handleOpenLogsFolder}
            size="large"
            className="!rounded-xl"
          >
            {t("settings.openFolder", "Open Folder")}
          </Button>

          <Popconfirm
            title={t("settings.confirmClearLogs", "Clear all log files?")}
            onConfirm={handleClearLogs}
            okText={t("common.confirm", "Confirm")}
            cancelText={t("common.cancel", "Cancel")}
          >
            <Button
              icon={<ClearOutlined />}
              danger
              size="large"
              className="!rounded-xl"
            >
              {t("settings.clearLogs", "Clear Logs")}
            </Button>
          </Popconfirm>
        </Space>
      </div>

      <div className="relative">
        {loading && !logContent && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-slate-800/80 z-10 rounded-xl">
            <Spin />
          </div>
        )}

        <pre
          ref={logContainerRef}
          className="h-[500px] overflow-auto p-4 rounded-xl bg-slate-900 text-slate-100 text-sm font-mono leading-relaxed"
        >
          {logContent || (
            <Empty
              description={t("settings.noLogs", "No logs available")}
              className="[&_.ant-empty-description]:!text-slate-400"
            />
          )}
        </pre>
      </div>
    </div>
  );
};

// 调试工具组件
const DebugTools: React.FC = () => {
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
        t("settings.collectDebugInfoError", "Failed to collect debug info"),
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
      message.success(t("settings.copied", "Copied to clipboard"));
    }
  };

  const handleOpenDevTools = async () => {
    try {
      await appService.openDevTools();
      message.success(t("settings.devToolsOpened", "Developer tools opened"));
    } catch (e) {
      message.error(
        t("settings.devToolsError", "Failed to open developer tools"),
      );
    }
  };

  const handleRelaunch = async () => {
    try {
      await appService.relaunch();
    } catch (e) {
      message.error(t("settings.relaunchError", "Failed to relaunch"));
    }
  };

  return (
    <div className="space-y-6">
      <SettingSection
        title={t("settings.quickActions", "Quick Actions")}
        icon={<BugOutlined />}
      >
        <Space size="middle" wrap>
          <Button
            type="primary"
            icon={<CodeOutlined />}
            onClick={handleOpenDevTools}
            size="large"
            className="!rounded-xl"
          >
            {t("settings.openDevTools", "Open DevTools")}
          </Button>

          <Popconfirm
            title={t("settings.confirmRelaunch", "Relaunch the application?")}
            onConfirm={handleRelaunch}
            okText={t("common.confirm", "Confirm")}
            cancelText={t("common.cancel", "Cancel")}
          >
            <Button
              icon={<ReloadOutlined />}
              size="large"
              className="!rounded-xl"
            >
              {t("settings.relaunch", "Relaunch App")}
            </Button>
          </Popconfirm>

          <Button
            icon={<DeleteOutlined />}
            onClick={() => {
              localStorage.clear();
              sessionStorage.clear();
              message.success(
                t("settings.storageClearedSuccess", "Storage cleared"),
              );
            }}
            size="large"
            className="!rounded-xl"
          >
            {t("settings.clearStorage", "Clear Storage")}
          </Button>
        </Space>
      </SettingSection>

      <SettingSection
        title={t("settings.systemInfo", "System Information")}
        icon={<InfoCircleOutlined />}
        extra={
          <Space>
            <Button
              icon={<ReloadOutlined />}
              onClick={collectDebugInfo}
              loading={loading}
              size="small"
            >
              {t("settings.refresh", "Refresh")}
            </Button>
            <Button
              icon={<CodeOutlined />}
              onClick={handleCopyDebugInfo}
              size="small"
              disabled={!debugInfo}
            >
              {t("settings.copyJson", "Copy JSON")}
            </Button>
          </Space>
        }
      >
        {loading && !debugInfo ? (
          <Skeleton active />
        ) : (
          <pre className="p-4 rounded-xl bg-slate-100 dark:bg-slate-900 text-sm font-mono overflow-auto max-h-[400px]">
            {debugInfo ? JSON.stringify(debugInfo, null, 2) : "Loading..."}
          </pre>
        )}
      </SettingSection>

      <SettingSection
        title={t("settings.performanceMonitor", "Performance Monitor")}
        icon={<SyncOutlined />}
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-center">
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {typeof performance !== "undefined"
                ? Math.round(performance.now())
                : 0}
              <span className="text-sm">ms</span>
            </div>
            <div className="text-sm text-slate-600 dark:text-slate-400">
              Page Load Time
            </div>
          </div>

          <div className="p-4 rounded-xl bg-green-50 dark:bg-green-900/30 text-center">
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {navigator.onLine ? "Online" : "Offline"}
            </div>
            <div className="text-sm text-slate-600 dark:text-slate-400">
              Network Status
            </div>
          </div>

          <div className="p-4 rounded-xl bg-purple-50 dark:bg-purple-900/30 text-center">
            <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
              {navigator.hardwareConcurrency || "N/A"}
            </div>
            <div className="text-sm text-slate-600 dark:text-slate-400">
              CPU Cores
            </div>
          </div>

          <div className="p-4 rounded-xl bg-orange-50 dark:bg-orange-900/30 text-center">
            <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
              {navigator.language}
            </div>
            <div className="text-sm text-slate-600 dark:text-slate-400">
              Language
            </div>
          </div>
        </div>
      </SettingSection>
    </div>
  );
};

const Settings: React.FC = () => {
  const { t, i18n } = useTranslation();
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
      form.setFieldsValue({
        port: status.port || DEFAULT_PORT,
        language: i18n.language,
      });
    } catch (e) {
      console.error("Failed to load settings:", e);
      setError(t("settings.loadError", "Failed to load settings"));
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
      message.error(t("settings.openPathError", "Failed to open path"));
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
      message.error(t("settings.checkUpdateError", "Failed to check updates"));
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
        new Error(t("settings.portRequired", "Port is required")),
      );
    }
    if (value < PORT_MIN || value > PORT_MAX) {
      return Promise.reject(
        new Error(
          t("settings.portRange", `Port must be between ${PORT_MIN} and ${PORT_MAX}`),
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
          {t("settings.general", "General")}
        </span>
      ),
      children: (
        <Card className="!border-0 !shadow-none !bg-transparent" loading={loading}>
          {error && <ErrorState message={error} onRetry={loadData} />}

          <div className="space-y-6">
            <SettingSection title={t("settings.userDataPath", "User Data Directory")}>
              <Space.Compact style={{ width: "100%" }}>
                <Input value={userDataPath} readOnly className="!rounded-l-xl" />
                <Button
                  icon={<FolderOpenOutlined />}
                  onClick={handleOpenPath}
                  className="!rounded-r-xl"
                >
                  {t("settings.open", "Open")}
                </Button>
              </Space.Compact>
            </SettingSection>

            <SettingSection
              title={t("settings.language", "Language")}
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
          </div>
        </Card>
      ),
    },
    {
      key: "menu",
      label: (
        <span className="flex items-center gap-2 font-medium">
          <MenuOutlined />
          {t("settings.menuConfig", "Menu")}
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
          {t("settings.apiService", "API Service")}
        </span>
      ),
      children: (
        <Card className="!border-0 !shadow-none !bg-transparent" loading={loading}>
          <SettingSection title={t("settings.apiService", "API Service")}>
            <Form form={form} layout="inline" className="w-full">
              <div className="flex items-center gap-4 flex-wrap w-full">
                {/* 状态指示器 */}
                <div className="flex items-center gap-2 min-w-[120px]">
                  <div
                    className={`w-2.5 h-2.5 rounded-full ${
                      apiStatus.status === "running"
                        ? "bg-green-500 animate-pulse"
                        : "bg-red-500"
                    }`}
                  />
                  <span
                    className={`font-medium text-sm uppercase ${
                      apiStatus.status === "running"
                        ? "text-green-600 dark:text-green-400"
                        : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {apiStatus.status === "running"
                      ? t("settings.running", "Running")
                      : t("settings.stopped", "Stopped")}
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
                    prefix={<span className="text-slate-400 text-xs mr-1">Port</span>}
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
                      {t("settings.start", "Start")}
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
                        {t("settings.stop", "Stop")}
                      </Button>
                      <Tooltip title={t("settings.restartTip", "Apply port changes")}>
                        <Button
                          icon={<ReloadOutlined />}
                          onClick={() => handleApiAction("restart")}
                          loading={apiLoading}
                          className="!rounded-lg"
                        >
                          {t("settings.restart", "Restart")}
                        </Button>
                      </Tooltip>
                    </>
                  )}
                </div>
              </div>

              {/* 提示信息 */}
              {apiStatus.status === "running" && (
                <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
                  <LinkOutlined />
                  <span>
                    {t("settings.listeningOn", "Listening on")}:{" "}
                    <code className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-blue-600 dark:text-blue-400">
                      http://localhost:{apiStatus.port}
                    </code>
                  </span>
                  <Button
                    type="link"
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() => {
                      navigator.clipboard.writeText(`http://localhost:${apiStatus.port}`);
                      message.success(t("settings.copied", "Copied to clipboard"));
                    }}
                    className="!px-1"
                  />
                </div>
              )}
            </Form>
          </SettingSection>
        </Card>
      ),
    },
    {
      key: "logs",
      label: (
        <span className="flex items-center gap-2 font-medium">
          <FileTextOutlined />
          {t("settings.logs", "Logs")}
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
          {t("settings.debug", "Debug")}
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
          {t("settings.about", "About")}
        </span>
      ),
      children: (
        <Card className="!border-0 !shadow-none !bg-transparent" loading={loading}>
          <div className="max-w-xl mx-auto">
            {/* Logo and Title */}
            <div className="flex items-center justify-center gap-4 mb-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/20">
                <img src="/favicon.svg" alt="Logo" className="w-10 h-10" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200">
                  {appInfo?.name || "Super Client"}
                </h2>
                <Tag
                  color="blue"
                  className="!rounded-full !px-3 !py-0.5 !text-xs !font-medium !mt-1 !inline-block"
                >
                  v{appInfo?.version || "0.0.1"}
                </Tag>
              </div>
            </div>

            {/* Description */}
            <p className="text-center text-slate-500 dark:text-slate-400 text-sm mb-6">
              {t("settings.aboutDescription", "A powerful AI desktop client for seamless interaction with multiple AI services.")}
            </p>

            {/* Info Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50 text-center">
                <div className="text-lg font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {appInfo?.platform === "darwin" ? "macOS" : appInfo?.platform || "N/A"}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {t("settings.platform", "Platform")}
                </div>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50 text-center">
                <div className="text-lg font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {appInfo?.arch || "N/A"}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {t("settings.architecture", "Arch")}
                </div>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50 text-center">
                <div className="text-lg font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {appInfo?.node || "N/A"}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Node.js
                </div>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50 text-center">
                <div className="text-lg font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {appInfo?.electron || "N/A"}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Electron
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center justify-center gap-3 mb-6">
              <Button
                type="primary"
                icon={<ReloadOutlined />}
                onClick={handleCheckUpdate}
                size="large"
                className="!rounded-xl !h-11"
              >
                {t("settings.checkUpdate", "Check Update")}
              </Button>
              <Button
                icon={<GithubOutlined />}
                onClick={() => window.open("https://github.com/example/super-client", "_blank")}
                size="large"
                className="!rounded-xl !h-11"
              >
                GitHub
              </Button>
              <Button
                icon={<BugOutlined />}
                onClick={() => setActiveTab("debug")}
                size="large"
                className="!rounded-xl !h-11"
              >
                {t("settings.debug", "Debug")}
              </Button>
              <Button
                icon={<FileTextOutlined />}
                onClick={() => setActiveTab("logs")}
                size="large"
                className="!rounded-xl !h-11"
              >
                {t("settings.logs", "Logs")}
              </Button>
            </div>

            {/* Quick Links */}
            <div className="flex items-center justify-center gap-6 text-sm mb-6 pb-4 border-b border-slate-100 dark:border-slate-700/50">
              <button
                type="button"
                onClick={() => window.open("https://github.com/example/super-client/issues", "_blank")}
                className="text-slate-500 hover:text-blue-500 dark:text-slate-400 dark:hover:text-blue-400 transition-colors flex items-center gap-1.5"
              >
                <BugOutlined className="text-xs" />
                {t("settings.reportBug", "Report Bug")}
              </button>
              <button
                type="button"
                onClick={() => window.open("https://github.com/example/super-client/blob/main/LICENSE", "_blank")}
                className="text-slate-500 hover:text-blue-500 dark:text-slate-400 dark:hover:text-blue-400 transition-colors flex items-center gap-1.5"
              >
                <FileTextOutlined className="text-xs" />
                {t("settings.license", "License")}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("debug")}
                className="text-slate-500 hover:text-blue-500 dark:text-slate-400 dark:hover:text-blue-400 transition-colors flex items-center gap-1.5"
              >
                <CodeOutlined className="text-xs" />
                {t("settings.devTools", "DevTools")}
              </button>
            </div>

            {/* Footer */}
            <div className="text-center text-sm text-slate-400 dark:text-slate-500">
              {t("settings.madeWith", "Made with")} <HeartOutlined className="text-red-400 mx-1 text-xs" /> {t("settings.byTeam", "by Super Client Team")}
            </div>
          </div>
        </Card>
      ),
    },
  ];

  return (
    <MainLayout>
      <div className="animate-fade-in">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 flex items-center justify-center shadow-lg shadow-purple-500/25">
              <SettingOutlined className="text-2xl text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
                {t("settings.title", "Settings")}
              </h1>
            </div>
          </div>
          <p className="text-slate-500 dark:text-slate-400 ml-15">
            {t(
              "settings.description",
              "Configure application preferences and services",
            )}
          </p>
        </div>

        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={items}
          className="!bg-white/80 dark:!bg-slate-800/80 !rounded-2xl !p-6 !shadow-xl !backdrop-blur-sm"
        />
      </div>
    </MainLayout>
  );
};

export default Settings;
