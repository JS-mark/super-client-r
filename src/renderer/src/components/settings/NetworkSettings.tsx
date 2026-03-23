/**
 * 网络设置组件
 * 代理配置 + 请求日志追踪
 */

import {
  ApiOutlined,
  CheckCircleOutlined,
  LoadingOutlined,
} from "@ant-design/icons";
import {
  App,
  Button,
  Input,
  InputNumber,
  Select,
  Switch,
  theme,
} from "antd";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ProxyConfig } from "@/types/electron";
import { networkService } from "../../services/networkService";
import { SettingSection } from "./SettingSection";
import { RequestLogDrawer } from "./RequestLogDrawer";

const { useToken } = theme;

/* ------------------------------------------------------------------ */
/*  SettingRow                                                         */
/* ------------------------------------------------------------------ */
function SettingRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  const { token } = useToken();
  return (
    <div
      className="flex items-center justify-between py-2 border-t first:border-t-0"
      style={{ borderColor: token.colorBorderSecondary }}
    >
      <div className="flex-1 min-w-0 mr-4">
        <span className="text-[13px]" style={{ color: token.colorText }}>
          {label}
        </span>
        {hint && (
          <div
            className="text-[11px] mt-0.5 leading-tight"
            style={{ color: token.colorTextQuaternary }}
          >
            {hint}
          </div>
        )}
      </div>
      <div className="shrink-0 flex items-center [&_.ant-select-selection-item]:text-right [&_.ant-select-selection-placeholder]:text-right [&_input]:text-right!">
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  默认代理配置                                                        */
/* ------------------------------------------------------------------ */
const DEFAULT_PROXY: ProxyConfig = {
  enabled: false,
  protocols: ["http", "https"],
  host: "",
  port: 7890,
  auth: false,
  username: "",
  bypassList: "localhost,127.0.0.1",
};

/* ------------------------------------------------------------------ */
/*  NetworkSettings                                                     */
/* ------------------------------------------------------------------ */
export function NetworkSettings() {
  const { t } = useTranslation("settings");
  const { token } = useToken();
  const { message, modal } = App.useApp();

  const [proxyConfig, setProxyConfig] = useState<ProxyConfig>(DEFAULT_PROXY);
  const [testing, setTesting] = useState(false);
  const [logEnabled, setLogEnabled] = useState(false);
  const [logCount, setLogCount] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // 加载配置
  useEffect(() => {
    networkService.getProxyConfig().then((res) => {
      if (res.success && res.data) {
        setProxyConfig(res.data);
      }
    });
    networkService.getLogEnabled().then((res) => {
      if (res.success) setLogEnabled(res.data);
    });
    networkService.getRequestLog().then((res) => {
      if (res.success) setLogCount(res.data.length);
    });
  }, []);

  // 保存代理配置
  const saveProxy = useCallback(
    (updates: Partial<ProxyConfig>) => {
      const updated = { ...proxyConfig, ...updates };
      setProxyConfig(updated);
      networkService.setProxyConfig(updated);
    },
    [proxyConfig],
  );

  // 测试连接（用固定 key 防止消息堆叠）
  const handleTestConnection = useCallback(async () => {
    if (!proxyConfig.host || !proxyConfig.port) {
      message.warning({
        content: t("network.hostPlaceholder"),
        key: "proxy-test",
      });
      return;
    }
    setTesting(true);
    try {
      const res = await networkService.testProxy(proxyConfig);
      if (res.success && res.data.success) {
        message.success({
          content: t("network.testSuccess", { ms: res.data.latencyMs }),
          key: "proxy-test",
        });
      } else {
        message.error({
          content: t("network.testFailed", {
            error: res.data?.error || res.error || "Unknown",
          }),
          key: "proxy-test",
        });
      }
    } catch {
      message.error({
        content: t("network.testFailed", { error: "Request failed" }),
        key: "proxy-test",
      });
    } finally {
      setTesting(false);
    }
  }, [proxyConfig, message, t]);

  // 切换日志启用
  const handleLogToggle = useCallback(
    (enabled: boolean) => {
      setLogEnabled(enabled);
      networkService.setLogEnabled(enabled);
    },
    [],
  );

  // 清除日志
  const handleClearLog = useCallback(() => {
    modal.confirm({
      title: t("network.clearLog"),
      content: t("network.clearLogConfirm"),
      onOk: async () => {
        await networkService.clearRequestLog();
        setLogCount(0);
        message.success("OK");
      },
    });
  }, [modal, message, t]);

  // 打开日志抽屉
  const handleOpenDrawer = useCallback(() => {
    setDrawerOpen(true);
  }, []);

  const handleCloseDrawer = useCallback(() => {
    setDrawerOpen(false);
    // 刷新计数
    networkService.getRequestLog().then((res) => {
      if (res.success) setLogCount(res.data.length);
    });
  }, []);

  return (
    <>
      <SettingSection title={t("network.proxy")} icon={<ApiOutlined />}>
        <SettingRow
          label={t("network.proxyEnabled")}
          hint={t("network.proxyEnabledHint")}
        >
          <Switch
            size="small"
            checked={proxyConfig.enabled}
            onChange={(checked) => saveProxy({ enabled: checked })}
          />
        </SettingRow>

        {proxyConfig.enabled && (
          <>
            <SettingRow
              label={t("network.protocols")}
              hint={t("network.protocolsHint")}
            >
              <Select
                size="small"
                variant="borderless"
                mode="multiple"
                value={proxyConfig.protocols}
                onChange={(val) =>
                  saveProxy({
                    protocols: val as ("http" | "https")[],
                  })
                }
                options={[
                  { label: "HTTP", value: "http" },
                  { label: "HTTPS", value: "https" },
                ]}
                popupMatchSelectWidth={false}
                className="w-[160px]!"
              />
            </SettingRow>

            <SettingRow label={t("network.host")}>
              <Input
                size="small"
                variant="borderless"
                className="w-[200px]!"
                value={proxyConfig.host}
                placeholder={t("network.hostPlaceholder")}
                onBlur={(e) => saveProxy({ host: e.target.value })}
                onChange={(e) =>
                  setProxyConfig((prev) => ({
                    ...prev,
                    host: e.target.value,
                  }))
                }
              />
            </SettingRow>

            <SettingRow label={t("network.port")}>
              <InputNumber
                size="small"
                variant="borderless"
                value={proxyConfig.port}
                min={1}
                max={65535}
                controls={false}
                className="w-[100px]!"
                onChange={(val) => val && saveProxy({ port: val })}
              />
            </SettingRow>

            <SettingRow
              label={t("network.auth")}
              hint={t("network.authHint")}
            >
              <Switch
                size="small"
                checked={proxyConfig.auth}
                onChange={(checked) => saveProxy({ auth: checked })}
              />
            </SettingRow>

            {proxyConfig.auth && (
              <>
                <SettingRow label={t("network.username")}>
                  <Input
                    size="small"
                    variant="borderless"
                    className="w-[200px]!"
                    value={proxyConfig.username}
                    onBlur={(e) =>
                      saveProxy({ username: e.target.value })
                    }
                    onChange={(e) =>
                      setProxyConfig((prev) => ({
                        ...prev,
                        username: e.target.value,
                      }))
                    }
                  />
                </SettingRow>

                <SettingRow label={t("network.*")}>
                  <Input.Password
                    size="small"
                    variant="borderless"
                    value={
                      (proxyConfig as unknown as Record<string, string>)[
                      "password"
                      ] as string
                    }
                    onBlur={(e) =>
                      saveProxy({
                        password: e.target.value,
                      } as Partial<ProxyConfig>)
                    }
                    onChange={(e) =>
                      setProxyConfig(
                        (prev) =>
                          ({
                            ...prev,
                            password: e.target.value,
                          }) as ProxyConfig,
                      )
                    }
                  />
                </SettingRow>
              </>
            )}

            <SettingRow
              label={t("network.bypassList")}
              hint={t("network.bypassListHint")}
            >
              <Input
                size="small"
                variant="borderless"
                className="w-[260px]!"
                value={proxyConfig.bypassList}
                placeholder={t("network.bypassListPlaceholder")}
                onBlur={(e) =>
                  saveProxy({ bypassList: e.target.value })
                }
                onChange={(e) =>
                  setProxyConfig((prev) => ({
                    ...prev,
                    bypassList: e.target.value,
                  }))
                }
              />
            </SettingRow>

            <SettingRow label={t("network.testConnection")}>
              <Button
                size="small"
                type="primary"
                ghost
                onClick={handleTestConnection}
                loading={testing}
                icon={
                  testing ? (
                    <LoadingOutlined />
                  ) : (
                    <CheckCircleOutlined />
                  )
                }
              >
                {testing
                  ? t("network.testing")
                  : t("network.testConnection")}
              </Button>
            </SettingRow>
          </>
        )}
        <SettingRow
          label={t("network.logEnabled")}
          hint={t("network.logEnabledHint")}
        >
          <Switch
            size="small"
            checked={logEnabled}
            onChange={handleLogToggle}
          />
        </SettingRow>

        <SettingRow label={t("network.logCount", { count: logCount })}>
          <div className="flex items-center gap-2">
            <Button size="small" onClick={handleOpenDrawer}>
              {t("network.viewLog")}
            </Button>
            <Button
              size="small"
              danger
              onClick={handleClearLog}
              disabled={logCount === 0}
            >
              {t("network.clearLog")}
            </Button>
          </div>
        </SettingRow>
      </SettingSection>

      <RequestLogDrawer open={drawerOpen} onClose={handleCloseDrawer} />
    </>
  );
}
