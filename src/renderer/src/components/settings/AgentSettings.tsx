import {
  CodeOutlined,
  DeleteOutlined,
  EditOutlined,
  LinkOutlined,
  PlusOutlined,
  RobotOutlined,
  SafetyOutlined,
  SettingOutlined,
  TeamOutlined,
  UserOutlined,
} from "@ant-design/icons";
import {
  App,
  Button,
  ColorPicker,
  Empty,
  Input,
  InputNumber,
  Modal,
  Select,
  Tabs,
  Tag,
  theme,
} from "antd";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  AgentProfile,
  AgentSDKConfig,
  AgentSDKEffort,
  AgentSDKPermissionMode,
  AgentSDKThinkingConfig,
  AgentTeam,
  ModelProvider,
} from "@/types/electron";
import {
  getAgentProfiles,
  getAgentSDKConfig,
  getAgentTeams,
  setAgentProfiles,
  setAgentSDKConfig,
  setAgentTeams,
} from "../../services/agent/agentSDKService";
import { modelService } from "../../services/modelService";
import { useModelStore } from "../../stores/modelStore";
import { isClaudeCodeCompatible } from "../models/ModelProviders";
import { SettingSection } from "./SettingSection";

const { useToken } = theme;

/** Claude 模型列表 */
const CLAUDE_MODELS = [
  { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5", tag: "Latest" },
  { id: "claude-opus-4", label: "Claude Opus 4", tag: "Capable" },
  { id: "claude-sonnet-4-0", label: "Claude Sonnet 4.0", tag: "" },
  { id: "claude-haiku-3-5", label: "Claude Haiku 3.5", tag: "Fast" },
];

type ThinkingType = "adaptive" | "enabled" | "disabled";

function getThinkingType(c?: AgentSDKThinkingConfig): ThinkingType | undefined {
  return c?.type;
}
function buildThinking(t?: ThinkingType): AgentSDKThinkingConfig | undefined {
  if (!t) return undefined;
  if (t === "enabled") return { type: "enabled", budgetTokens: 10000 };
  if (t === "disabled") return { type: "disabled" };
  return { type: "adaptive" };
}

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
      <div
        className="shrink-0 [&_.ant-select-selection-item]:text-right [&_.ant-select-selection-placeholder]:text-right [&_input]:text-right!"
      >
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  AgentSettings                                                      */
/* ------------------------------------------------------------------ */
interface AgentSettingsProps {
  onTabChange?: (tab: string) => void;
}

type AgentSettingsTab = "config" | "profiles" | "teams";

export function AgentSettings({ onTabChange }: AgentSettingsProps) {
  const { t } = useTranslation("settings");
  const { token } = useToken();
  const { message } = App.useApp();

  const [activeTab, setActiveTab] = useState<AgentSettingsTab>("config");

  const [config, setConfig] = useState<AgentSDKConfig>({});
  const [loading, setLoading] = useState(true);
  const [anthropicConfigured, setAnthropicConfigured] = useState(false);
  const [claudeCodeProvider, setClaudeCodeProvider] = useState<ModelProvider | null>(null);

  // 本地文本态（onBlur 保存）
  const [localApiKey, setLocalApiKey] = useState("");
  const [localBaseUrl, setLocalBaseUrl] = useState("");

  // Provider 联动
  const loadProviders = useModelStore((s) => s.loadProviders);
  const providers = useModelStore((s) => s.providers);

  // 兼容 Claude Code 的服务商列表（已启用 + 有 API Key）
  const compatibleProviders = useMemo(
    () =>
      providers.filter(
        (p) => isClaudeCodeCompatible(p.preset) && p.enabled && p.apiKey,
      ),
    [providers],
  );

  // 模型下拉选项：优先从关联服务商取，无关联时 fallback 到内置 Claude 模型
  const modelOptions = useMemo(() => {
    // 有关联服务商 → 使用其已启用的模型列表
    if (claudeCodeProvider) {
      const providerModels = claudeCodeProvider.models
        .filter((m) => m.enabled)
        .map((m) => ({
          value: m.id,
          label: m.name || m.id,
          tag: "",
        }));
      if (providerModels.length > 0) return providerModels;
    }
    // 无关联 / 关联服务商无模型 → fallback 内置列表
    return CLAUDE_MODELS.map((m) => ({
      value: m.id,
      label: m.label,
      tag: m.tag,
    }));
  }, [claudeCodeProvider]);

  // API Key 来源判断
  const apiKeySource = useMemo(() => {
    if (config.apiKeyOverride) return "override";
    if (claudeCodeProvider) return "provider-linked";
    if (anthropicConfigured) return "provider";
    return "none";
  }, [config.apiKeyOverride, claudeCodeProvider, anthropicConfigured]);

  // 加载
  useEffect(() => {
    const load = async () => {
      try {
        const cfg = await getAgentSDKConfig();
        setConfig(cfg);
        setLocalApiKey(cfg.apiKeyOverride || "");
        setLocalBaseUrl(cfg.baseUrlOverride || "");
      } catch {
        message.error(t("agent.loadFailed"));
      } finally {
        setLoading(false);
      }
    };
    load();
    loadProviders();
  }, [t, message, loadProviders]);

  // 检测 Anthropic 状态 & Claude Code Provider
  useEffect(() => {
    window.electron.model
      .listProviders()
      .then((resp) => {
        if (resp.success && resp.data) {
          const ccProv = resp.data.find(
            (p: ModelProvider) =>
              p.claudeCodeEnabled && p.enabled && p.apiKey,
          );
          setClaudeCodeProvider(ccProv || null);
          setAnthropicConfigured(
            !!ccProv ||
            resp.data.some(
              (p: ModelProvider) =>
                p.preset === "anthropic" && p.enabled && p.apiKey,
            ),
          );
        }
      })
      .catch(() => { });
  }, []);

  // 持久化
  const configRef = useRef(config);
  configRef.current = config;

  const persistConfig = useCallback(
    async (updated: AgentSDKConfig) => {
      setConfig(updated);
      try {
        await setAgentSDKConfig(updated);
      } catch {
        message.error(t("agent.saveFailed"));
      }
    },
    [t, message],
  );

  // onBlur 保存 API Key
  const handleApiKeyBlur = useCallback(() => {
    const v = localApiKey.trim();
    if (v !== (configRef.current.apiKeyOverride || "")) {
      persistConfig({ ...configRef.current, apiKeyOverride: v || undefined });
    }
  }, [localApiKey, persistConfig]);

  // onBlur 保存 Base URL
  const handleBaseUrlBlur = useCallback(() => {
    const v = localBaseUrl.trim();
    if (v !== (configRef.current.baseUrlOverride || "")) {
      persistConfig({ ...configRef.current, baseUrlOverride: v || undefined });
    }
  }, [localBaseUrl, persistConfig]);

  // 切换关联服务商
  const handleLinkedProviderChange = useCallback(
    async (providerId: string | undefined) => {
      try {
        // 先清除旧的
        if (claudeCodeProvider) {
          await modelService.saveProvider({
            ...claudeCodeProvider,
            claudeCodeEnabled: false,
            updatedAt: Date.now(),
          });
        }
        // 设置新的
        if (providerId) {
          const target = providers.find((p) => p.id === providerId);
          if (target) {
            await modelService.saveProvider({
              ...target,
              claudeCodeEnabled: true,
              updatedAt: Date.now(),
            });
            setClaudeCodeProvider(target);
          }
        } else {
          setClaudeCodeProvider(null);
        }
        setAnthropicConfigured(
          !!providerId ||
          providers.some(
            (p) => p.preset === "anthropic" && p.enabled && p.apiKey,
          ),
        );
        loadProviders();
      } catch {
        message.error(t("agent.saveFailed"));
      }
    },
    [claudeCodeProvider, providers, loadProviders, message, t],
  );

  // 环境变量操作
  const handleAddEnvVar = useCallback(() => {
    const vars = { ...configRef.current.customEnvVars };
    let idx = Object.keys(vars).length + 1;
    while (vars[`NEW_VAR_${idx}`] !== undefined) idx++;
    vars[`NEW_VAR_${idx}`] = "";
    persistConfig({ ...configRef.current, customEnvVars: vars });
  }, [persistConfig]);

  const handleRemoveEnvVar = useCallback(
    (key: string) => {
      const vars = { ...configRef.current.customEnvVars };
      delete vars[key];
      persistConfig({
        ...configRef.current,
        customEnvVars: Object.keys(vars).length > 0 ? vars : undefined,
      });
    },
    [persistConfig],
  );

  const handleEnvVarChange = useCallback(
    (oldKey: string, newKey: string, value: string) => {
      const vars = { ...configRef.current.customEnvVars };
      if (oldKey !== newKey) delete vars[oldKey];
      vars[newKey] = value;
      persistConfig({ ...configRef.current, customEnvVars: vars });
    },
    [persistConfig],
  );

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <div
          className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin"
          style={{
            borderColor: token.colorPrimary,
            borderTopColor: "transparent",
          }}
        />
      </div>
    );
  }

  // 来源 Tag 颜色
  const sourceTagColor =
    apiKeySource === "override"
      ? "blue"
      : apiKeySource === "provider-linked"
        ? "cyan"
        : apiKeySource === "provider"
          ? "green"
          : "default";
  const sourceLabel =
    apiKeySource === "override"
      ? t("agent.apiKeyFromOverride")
      : apiKeySource === "provider-linked"
        ? t("agent.apiKeyFromProviderLinked")
        : apiKeySource === "provider"
          ? t("agent.apiKeyFromProvider")
          : t("agent.apiKeyNone");

  return (
    <div className="animate-fade-in">
      <Tabs
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as AgentSettingsTab)}
        centered
        size="small"
        animated={{ inkBar: true, tabPane: true }}
        items={[
          {
            key: "config",
            label: (
              <span className="flex items-center gap-1.5">
                <SettingOutlined />
                {t("agent.tabConfig")}
              </span>
            ),
            children: (
              <div className="space-y-4">
              {/* ── Claude API 连接 ── */}
      <SettingSection
        title={t("agent.connection")}
        icon={<LinkOutlined />}
      >
        {/* API Key 来源状态 */}
        <div
          className="flex items-center justify-between py-2"
        >
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${apiKeySource !== "none"
                ? "bg-green-500"
                : "bg-amber-500"
                }`}
            />
            <span
              className="text-[13px]"
              style={{ color: token.colorText }}
            >
              {t("agent.apiKeySource")}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Tag
              color={sourceTagColor}
              className="m-0! text-[11px]!"
            >
              {sourceLabel}
            </Tag>
            {apiKeySource === "none" && (
              <Button
                type="link"
                size="small"
                className="px-0! text-[12px]!"
                onClick={() => onTabChange?.("providers")}
              >
                {t("agent.goToProviders")}
              </Button>
            )}
          </div>
        </div>

        {/* 关联服务商 */}
        <SettingRow
          label={t("agent.linkedProvider")}
          hint={t("agent.linkedProviderHint")}
        >
          <Select
            value={claudeCodeProvider?.id || undefined}
            onChange={handleLinkedProviderChange}
            allowClear
            placeholder={t("agent.selectProvider")}
            className="w-full!"
            size="small"
            variant="borderless"
            popupMatchSelectWidth={false}
            options={compatibleProviders.map((p) => ({
              value: p.id,
              label: p.name,
            }))}
            notFoundContent={
              <Button
                type="link"
                size="small"
                className="text-[12px]!"
                onClick={() => onTabChange?.("providers")}
              >
                {t("agent.goToProviders")}
              </Button>
            }
          />
        </SettingRow>

        {/* API Key 覆盖 */}
        <SettingRow
          label={t("agent.apiKeyOverride")}
          hint={t("agent.apiKeyOverrideHint")}
        >
          <Input.Password
            value={localApiKey}
            onChange={(e) => setLocalApiKey(e.target.value)}
            onBlur={handleApiKeyBlur}
            placeholder={t("agent.apiKeyPlaceholder")}
            className="w-full!"
            size="small"
            variant="borderless"
            style={{ textAlign: "right" }}
          />
        </SettingRow>

        {/* Base URL 覆盖 */}
        <SettingRow
          label={t("agent.baseUrlOverride")}
          hint={t("agent.baseUrlOverrideHint")}
        >
          <Input
            value={localBaseUrl}
            onChange={(e) => setLocalBaseUrl(e.target.value)}
            onBlur={handleBaseUrlBlur}
            placeholder={t("agent.baseUrlPlaceholder")}
            className="w-full!"
            size="small"
            variant="borderless"
            style={{ textAlign: "right" }}
          />
        </SettingRow>
      </SettingSection>

      {/* ── 模型配置（覆盖） ── */}
      <SettingSection
        title={t("agent.modelConfig")}
        icon={<RobotOutlined />}
      >
        <SettingRow
          label={t("agent.defaultModel")}
          hint={t("agent.defaultModelHint")}
        >
          <Select
            value={config.defaultModel || undefined}
            onChange={(val: string) =>
              persistConfig({ ...config, defaultModel: val || undefined })
            }
            allowClear
            showSearch
            placeholder={claudeCodeProvider?.claudeCodeModel || "claude-sonnet-4-5"}
            className="w-full!"
            size="small"
            variant="borderless"
            popupMatchSelectWidth={false}
            optionLabelProp="label"
            options={modelOptions.map((o) => ({
              value: o.value,
              label: o.label,
              tag: o.tag,
            }))}
            optionRender={(option) => (
              <div className="flex items-center justify-between">
                <span>{option.data.label}</span>
                {option.data.tag && (
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded ml-2"
                    style={{
                      color: token.colorPrimary,
                      backgroundColor: token.colorPrimaryBg,
                    }}
                  >
                    {option.data.tag}
                  </span>
                )}
              </div>
            )}
            filterOption={(input, option) =>
              (option?.value as string)
                ?.toLowerCase()
                .includes(input.toLowerCase()) ?? false
            }
          />
        </SettingRow>
        <SettingRow
          label={t("agent.smallFastModel")}
          hint={t("agent.smallFastModelHint")}
        >
          <Select
            value={config.smallFastModel || undefined}
            onChange={(val: string) =>
              persistConfig({ ...config, smallFastModel: val || undefined })
            }
            allowClear
            showSearch
            placeholder="claude-haiku-3-5"
            className="w-full!"
            size="small"
            variant="borderless"
            popupMatchSelectWidth={false}
            optionLabelProp="label"
            options={modelOptions.map((o) => ({
              value: o.value,
              label: o.label,
              tag: o.tag,
            }))}
            optionRender={(option) => (
              <div className="flex items-center justify-between">
                <span>{option.data.label}</span>
                {option.data.tag && (
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded ml-2"
                    style={{
                      color: token.colorPrimary,
                      backgroundColor: token.colorPrimaryBg,
                    }}
                  >
                    {option.data.tag}
                  </span>
                )}
              </div>
            )}
            filterOption={(input, option) =>
              (option?.value as string)
                ?.toLowerCase()
                .includes(input.toLowerCase()) ?? false
            }
          />
        </SettingRow>
      </SettingSection>

      {/* ── 查询默认值 ── */}
      <SettingSection
        title={t("agent.queryDefaults")}
        icon={<SettingOutlined />}
      >
        <SettingRow label={t("agent.effort")} hint={t("agent.effortHint")}>
          <Select
            value={config.defaultEffort}
            onChange={(val: AgentSDKEffort) =>
              persistConfig({ ...config, defaultEffort: val || undefined })
            }
            allowClear
            placeholder={t("agent.taskAdaptive")}
            className="w-full!"
            size="small"
            variant="borderless"
            popupMatchSelectWidth={false}
            optionLabelProp="label"
            options={[
              { value: "low", label: t("agent.effortLow"), desc: t("agent.effortLowDesc") },
              { value: "medium", label: t("agent.effortMedium"), desc: t("agent.effortMediumDesc") },
              { value: "high", label: t("agent.effortHigh"), desc: t("agent.effortHighDesc") },
              { value: "max", label: t("agent.effortMax"), desc: t("agent.effortMaxDesc") },
            ]}
            optionRender={(option) => (
              <div className="flex items-center justify-between gap-3">
                <span>{option.data.label}</span>
                <span className="text-[11px]" style={{ color: token.colorTextQuaternary }}>
                  {option.data.desc}
                </span>
              </div>
            )}
          />
        </SettingRow>

        <SettingRow label={t("agent.thinking")} hint={t("agent.thinkingHint")}>
          <Select
            value={getThinkingType(config.defaultThinking)}
            onChange={(val: ThinkingType) =>
              persistConfig({
                ...config,
                defaultThinking: buildThinking(val || undefined),
              })
            }
            allowClear
            placeholder={t("agent.taskAdaptive")}
            className="w-full!"
            size="small"
            variant="borderless"
            popupMatchSelectWidth={false}
            optionLabelProp="label"
            options={[
              { value: "adaptive", label: t("agent.thinkingAdaptive"), desc: t("agent.thinkingAdaptiveDesc") },
              { value: "enabled", label: t("agent.thinkingEnabled"), desc: t("agent.thinkingEnabledDesc") },
              { value: "disabled", label: t("agent.thinkingDisabled"), desc: t("agent.thinkingDisabledDesc") },
            ]}
            optionRender={(option) => (
              <div className="flex items-center justify-between gap-3">
                <span>{option.data.label}</span>
                <span className="text-[11px]" style={{ color: token.colorTextQuaternary }}>
                  {option.data.desc}
                </span>
              </div>
            )}
          />
        </SettingRow>

        <SettingRow label={t("agent.maxTurns")} hint={t("agent.maxTurnsHint")}>
          <InputNumber
            value={config.defaultMaxTurns}
            onChange={(val) =>
              persistConfig({ ...config, defaultMaxTurns: val ?? undefined })
            }
            min={1}
            max={100}
            placeholder="auto"
            className="w-full!"
            size="small"
            variant="borderless"
            controls={false}
            style={{ textAlign: "right" }}
          />
        </SettingRow>

        <SettingRow label={t("agent.maxBudgetUsd")} hint={t("agent.maxBudgetHint")}>
          <InputNumber
            value={config.defaultMaxBudgetUsd}
            onChange={(val) =>
              persistConfig({ ...config, defaultMaxBudgetUsd: val ?? undefined })
            }
            min={0}
            step={0.5}
            precision={2}
            placeholder="∞"
            className="w-full!"
            size="small"
            variant="borderless"
            controls={false}
            addonAfter="$"
            style={{ textAlign: "right" }}
          />
        </SettingRow>
      </SettingSection>

      {/* ── 权限模式 ── */}
      <SettingSection
        title={t("agent.permissionMode")}
        icon={<SafetyOutlined />}
      >
        <p
          className="text-[11px] mb-2 mt-0"
          style={{ color: token.colorTextQuaternary }}
        >
          {t("agent.permissionModeHint")}
        </p>
        <Select
          value={config.defaultPermissionMode}
          onChange={(val: AgentSDKPermissionMode) =>
            persistConfig({ ...config, defaultPermissionMode: val || undefined })
          }
          allowClear
          placeholder={t("agent.permissionDefault")}
          className="w-full!"
          size="middle"
          popupMatchSelectWidth
          optionLabelProp="label"
          options={[
            { value: "default", label: t("agent.permissionDefault"), desc: t("agent.permissionDefaultDesc") },
            { value: "acceptEdits", label: t("agent.permissionAcceptEdits"), desc: t("agent.permissionAcceptEditsDesc") },
            { value: "bypassPermissions", label: t("agent.permissionBypass"), desc: t("agent.permissionBypassDesc") },
            { value: "plan", label: t("agent.permissionPlan"), desc: t("agent.permissionPlanDesc") },
            { value: "dontAsk", label: t("agent.permissionDontAsk"), desc: t("agent.permissionDontAskDesc") },
          ]}
          optionRender={(option) => (
            <div className="flex items-center justify-between py-0.5">
              <span className="font-medium text-[13px]">{option.data.label}</span>
              <span className="text-[11px] ml-3" style={{ color: token.colorTextTertiary }}>
                {option.data.desc}
              </span>
            </div>
          )}
        />
      </SettingSection>

      {/* ── 环境变量 ── */}
      <SettingSection
        title={t("agent.advanced")}
        icon={<CodeOutlined />}
        extra={
          <Button
            type="text"
            size="small"
            icon={<PlusOutlined />}
            onClick={handleAddEnvVar}
          >
            {t("agent.addEnvVar")}
          </Button>
        }
      >
        <p
          className="text-[11px] mb-2 mt-0"
          style={{ color: token.colorTextQuaternary }}
        >
          {t("agent.customEnvVarsHint")}
        </p>

        {config.customEnvVars &&
          Object.keys(config.customEnvVars).length > 0 ? (
          <div className="space-y-1.5">
            {Object.entries(config.customEnvVars).map(([key, value]) => (
              <EnvVarRow
                key={key}
                envKey={key}
                envValue={value}
                onChange={handleEnvVarChange}
                onRemove={handleRemoveEnvVar}
              />
            ))}
          </div>
        ) : (
          <div
            className="text-center py-3 text-[11px] rounded-lg"
            style={{
              color: token.colorTextQuaternary,
              backgroundColor: token.colorFillQuaternary,
            }}
          >
            {t("agent.noEnvVars")}
          </div>
        )}
      </SettingSection>
              </div>
            ),
          },
          {
            key: "profiles",
            label: (
              <span className="flex items-center gap-1.5">
                <UserOutlined />
                {t("agent.tabProfiles")}
              </span>
            ),
            children: <AgentProfilesPanel />,
          },
          {
            key: "teams",
            label: (
              <span className="flex items-center gap-1.5">
                <TeamOutlined />
                {t("agent.tabTeams")}
              </span>
            ),
            children: <AgentTeamsPanel />,
          },
        ]}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  AgentProfilesPanel                                                 */
/* ------------------------------------------------------------------ */
function AgentProfilesPanel() {
  const { t } = useTranslation("settings");
  const { token } = useToken();
  const { message } = App.useApp();
  const [profiles, setProfilesState] = useState<AgentProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingProfile, setEditingProfile] = useState<AgentProfile | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const loadProfiles = useCallback(async () => {
    try {
      const data = await getAgentProfiles();
      setProfilesState(data);
    } catch {
      message.error(t("agent.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t, message]);

  useEffect(() => { loadProfiles(); }, [loadProfiles]);

  const handleDelete = useCallback(async (id: string) => {
    const updated = profiles.filter((p) => p.id !== id);
    try {
      await setAgentProfiles(updated);
      setProfilesState(updated);
    } catch {
      message.error(t("agent.saveFailed"));
    }
  }, [profiles, t, message]);

  const handleSaveProfile = useCallback(async (profile: AgentProfile) => {
    const exists = profiles.findIndex((p) => p.id === profile.id);
    const updated = exists >= 0
      ? profiles.map((p) => (p.id === profile.id ? profile : p))
      : [...profiles, profile];
    try {
      await setAgentProfiles(updated);
      setProfilesState(updated);
      setModalOpen(false);
      setEditingProfile(null);
    } catch {
      message.error(t("agent.saveFailed"));
    }
  }, [profiles, t, message]);

  const handleAdd = useCallback(() => {
    setEditingProfile({
      id: `profile_${Date.now()}`,
      name: "",
      description: "",
      prompt: "",
    });
    setModalOpen(true);
  }, []);

  const handleEdit = useCallback((profile: AgentProfile) => {
    setEditingProfile({ ...profile });
    setModalOpen(true);
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <div
          className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: token.colorPrimary, borderTopColor: "transparent" }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SettingSection
        title={t("agent.profilesTitle")}
        icon={<UserOutlined />}
        extra={
          <Button type="text" size="small" icon={<PlusOutlined />} onClick={handleAdd}>
            {t("agent.addProfile")}
          </Button>
        }
      >
        {profiles.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={t("agent.noProfiles")}
          />
        ) : (
          <div className="space-y-2">
            {profiles.map((profile) => (
              <div
                key={profile.id}
                className="flex items-center justify-between px-3 py-2 rounded-lg border"
                style={{
                  borderColor: token.colorBorderSecondary,
                  backgroundColor: token.colorFillQuaternary,
                }}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {profile.color && (
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: profile.color }}
                    />
                  )}
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium truncate" style={{ color: token.colorText }}>
                      {profile.name}
                    </div>
                    <div className="text-[11px] truncate" style={{ color: token.colorTextQuaternary }}>
                      {profile.description}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEdit(profile)} />
                  <Button type="text" size="small" icon={<DeleteOutlined />} danger onClick={() => handleDelete(profile.id)} />
                </div>
              </div>
            ))}
          </div>
        )}
      </SettingSection>

      <ProfileEditModal
        open={modalOpen}
        profile={editingProfile}
        onSave={handleSaveProfile}
        onCancel={() => { setModalOpen(false); setEditingProfile(null); }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ProfileEditModal                                                   */
/* ------------------------------------------------------------------ */
function ProfileEditModal({
  open,
  profile,
  onSave,
  onCancel,
}: {
  open: boolean;
  profile: AgentProfile | null;
  onSave: (profile: AgentProfile) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation("settings");
  const [form, setForm] = useState<AgentProfile>({
    id: "",
    name: "",
    description: "",
    prompt: "",
  });

  useEffect(() => {
    if (profile) setForm({ ...profile });
  }, [profile]);

  const handleOk = useCallback(() => {
    if (!form.name.trim() || !form.prompt.trim()) return;
    onSave(form);
  }, [form, onSave]);

  return (
    <Modal
      open={open}
      title={profile?.name ? t("agent.editProfile") : t("agent.addProfile")}
      onOk={handleOk}
      onCancel={onCancel}
      okButtonProps={{ disabled: !form.name.trim() || !form.prompt.trim() }}
      width={520}
      destroyOnClose
    >
      <div className="space-y-3 mt-4">
        <div>
          <label className="text-[12px] font-medium mb-1 block">{t("agent.profileName")}</label>
          <Input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder={t("agent.profileNamePlaceholder")}
            size="small"
          />
        </div>
        <div>
          <label className="text-[12px] font-medium mb-1 block">{t("agent.profileDesc")}</label>
          <Input
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder={t("agent.profileDescPlaceholder")}
            size="small"
          />
        </div>
        <div>
          <label className="text-[12px] font-medium mb-1 block">{t("agent.profilePrompt")}</label>
          <Input.TextArea
            value={form.prompt}
            onChange={(e) => setForm((f) => ({ ...f, prompt: e.target.value }))}
            placeholder={t("agent.profilePromptPlaceholder")}
            rows={4}
            size="small"
          />
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="text-[12px] font-medium mb-1 block">{t("agent.profileModel")}</label>
            <Input
              value={form.model || ""}
              onChange={(e) => setForm((f) => ({ ...f, model: e.target.value || undefined }))}
              placeholder={t("agent.profileModelPlaceholder")}
              size="small"
            />
          </div>
          <div className="w-20">
            <label className="text-[12px] font-medium mb-1 block">{t("agent.profileMaxTurns")}</label>
            <InputNumber
              value={form.maxTurns}
              onChange={(val) => setForm((f) => ({ ...f, maxTurns: val ?? undefined }))}
              min={1}
              max={100}
              placeholder="auto"
              size="small"
              className="w-full!"
              controls={false}
            />
          </div>
        </div>
        <div>
          <label className="text-[12px] font-medium mb-1 block">{t("agent.profileColor")}</label>
          <ColorPicker
            value={form.color || "#1677ff"}
            onChange={(color) => setForm((f) => ({ ...f, color: color.toHexString() }))}
            size="small"
            presets={[
              {
                label: "Presets",
                colors: [
                  "#1677ff", "#52c41a", "#faad14", "#f5222d",
                  "#722ed1", "#13c2c2", "#eb2f96", "#fa8c16",
                ],
              },
            ]}
          />
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/*  AgentTeamsPanel                                                    */
/* ------------------------------------------------------------------ */
function AgentTeamsPanel() {
  const { t } = useTranslation("settings");
  const { token } = useToken();
  const { message } = App.useApp();
  const [teams, setTeamsState] = useState<AgentTeam[]>([]);
  const [profiles, setProfilesState] = useState<AgentProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTeam, setEditingTeam] = useState<AgentTeam | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [t, p] = await Promise.all([getAgentTeams(), getAgentProfiles()]);
      setTeamsState(t);
      setProfilesState(p);
    } catch {
      message.error(t("agent.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t, message]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleDelete = useCallback(async (id: string) => {
    const updated = teams.filter((team) => team.id !== id);
    try {
      await setAgentTeams(updated);
      setTeamsState(updated);
    } catch {
      message.error(t("agent.saveFailed"));
    }
  }, [teams, t, message]);

  const handleSaveTeam = useCallback(async (team: AgentTeam) => {
    const exists = teams.findIndex((te) => te.id === team.id);
    const updated = exists >= 0
      ? teams.map((te) => (te.id === team.id ? team : te))
      : [...teams, team];
    try {
      await setAgentTeams(updated);
      setTeamsState(updated);
      setModalOpen(false);
      setEditingTeam(null);
    } catch {
      message.error(t("agent.saveFailed"));
    }
  }, [teams, t, message]);

  const handleAdd = useCallback(() => {
    setEditingTeam({
      id: `team_${Date.now()}`,
      name: "",
      description: "",
      agents: [],
    });
    setModalOpen(true);
  }, []);

  const handleEdit = useCallback((team: AgentTeam) => {
    setEditingTeam({ ...team });
    setModalOpen(true);
  }, []);

  // resolve profile name by id
  const getProfileName = useCallback((id: string) => {
    return profiles.find((p) => p.id === id)?.name || id;
  }, [profiles]);

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <div
          className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: token.colorPrimary, borderTopColor: "transparent" }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SettingSection
        title={t("agent.teamsTitle")}
        icon={<TeamOutlined />}
        extra={
          <Button type="text" size="small" icon={<PlusOutlined />} onClick={handleAdd}>
            {t("agent.addTeam")}
          </Button>
        }
      >
        {teams.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={t("agent.noTeams")}
          />
        ) : (
          <div className="space-y-2">
            {teams.map((team) => (
              <div
                key={team.id}
                className="flex items-center justify-between px-3 py-2 rounded-lg border"
                style={{
                  borderColor: token.colorBorderSecondary,
                  backgroundColor: token.colorFillQuaternary,
                }}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium truncate" style={{ color: token.colorText }}>
                      {team.name}
                    </span>
                    {team.isBuiltin && (
                      <Tag color="blue" className="text-[10px]! m-0! leading-none! py-0!">
                        {t("agent.builtin")}
                      </Tag>
                    )}
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: token.colorTextQuaternary }}>
                    {team.agents.map((id) => getProfileName(id)).join(" → ")}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEdit(team)} />
                  {!team.isBuiltin && (
                    <Button type="text" size="small" icon={<DeleteOutlined />} danger onClick={() => handleDelete(team.id)} />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </SettingSection>

      <TeamEditModal
        open={modalOpen}
        team={editingTeam}
        profiles={profiles}
        onSave={handleSaveTeam}
        onCancel={() => { setModalOpen(false); setEditingTeam(null); }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  TeamEditModal                                                      */
/* ------------------------------------------------------------------ */
function TeamEditModal({
  open,
  team,
  profiles,
  onSave,
  onCancel,
}: {
  open: boolean;
  team: AgentTeam | null;
  profiles: AgentProfile[];
  onSave: (team: AgentTeam) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation("settings");
  const [form, setForm] = useState<AgentTeam>({
    id: "",
    name: "",
    description: "",
    agents: [],
  });

  useEffect(() => {
    if (team) setForm({ ...team });
  }, [team]);

  const handleOk = useCallback(() => {
    if (!form.name.trim() || form.agents.length === 0) return;
    onSave(form);
  }, [form, onSave]);

  return (
    <Modal
      open={open}
      title={team?.name ? t("agent.editTeam") : t("agent.addTeam")}
      onOk={handleOk}
      onCancel={onCancel}
      okButtonProps={{ disabled: !form.name.trim() || form.agents.length === 0 }}
      width={480}
      destroyOnClose
    >
      <div className="space-y-3 mt-4">
        <div>
          <label className="text-[12px] font-medium mb-1 block">{t("agent.teamName")}</label>
          <Input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder={t("agent.teamNamePlaceholder")}
            size="small"
          />
        </div>
        <div>
          <label className="text-[12px] font-medium mb-1 block">{t("agent.teamDesc")}</label>
          <Input
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder={t("agent.teamDescPlaceholder")}
            size="small"
          />
        </div>
        <div>
          <label className="text-[12px] font-medium mb-1 block">{t("agent.teamAgents")}</label>
          <Select
            mode="multiple"
            value={form.agents}
            onChange={(val) => setForm((f) => ({ ...f, agents: val }))}
            placeholder={t("agent.teamAgentsPlaceholder")}
            className="w-full!"
            size="small"
            options={profiles.map((p) => ({
              value: p.id,
              label: p.name,
            }))}
          />
          <div className="text-[11px] mt-1" style={{ color: "var(--ant-color-text-quaternary)" }}>
            {t("agent.teamAgentsHint")}
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/*  EnvVarRow                                                          */
/* ------------------------------------------------------------------ */
function EnvVarRow({
  envKey,
  envValue,
  onChange,
  onRemove,
}: {
  envKey: string;
  envValue: string;
  onChange: (oldKey: string, newKey: string, value: string) => void;
  onRemove: (key: string) => void;
}) {
  const { t } = useTranslation("settings");
  const { token } = useToken();
  const [localKey, setLocalKey] = useState(envKey);
  const [localValue, setLocalValue] = useState(envValue);

  const handleBlur = useCallback(() => {
    if (localKey && (localKey !== envKey || localValue !== envValue)) {
      onChange(envKey, localKey, localValue);
    }
  }, [envKey, envValue, localKey, localValue, onChange]);

  return (
    <div
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
      style={{ backgroundColor: token.colorFillQuaternary }}
    >
      <code
        className="shrink-0 text-[11px]"
        style={{ color: token.colorTextQuaternary }}
      >
        $
      </code>
      <Input
        value={localKey}
        onChange={(e) => setLocalKey(e.target.value)}
        onBlur={handleBlur}
        placeholder={t("agent.envVarKey")}
        size="small"
        variant="borderless"
        className="flex-1! font-mono text-[11px]!"
      />
      <span
        className="text-[11px]"
        style={{ color: token.colorTextQuaternary }}
      >
        =
      </span>
      <Input
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={handleBlur}
        placeholder={t("agent.envVarValue")}
        size="small"
        variant="borderless"
        className="flex-[2]! font-mono text-[11px]!"
      />
      <Button
        type="text"
        size="small"
        icon={<DeleteOutlined />}
        onClick={() => onRemove(envKey)}
        danger
        className="shrink-0 w-6! h-6!"
      />
    </div>
  );
}
