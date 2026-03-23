import {
  BulbOutlined,
  CodeOutlined,
  FileTextOutlined,
  SettingOutlined,
  StarOutlined,
  ToolOutlined,
} from "@ant-design/icons";
import { Prompts, Welcome } from "@ant-design/x";
import { Button, Select, Typography, theme } from "antd";
import type * as React from "react";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useModelStore } from "../../stores/modelStore";
import type { ModelProviderPreset } from "../../types/models";
import { ProviderIcon } from "../models/ProviderIcon";

const { Text } = Typography;
const { useToken } = theme;

interface ChatWelcomeScreenProps {
  hasActiveModel: boolean;
  isModelLoading: boolean;
  onInputChange: (text: string) => void;
  messageApi: { success: (msg: string) => void };
}

export function ChatWelcomeScreen({
  hasActiveModel,
  isModelLoading,
  onInputChange,
  messageApi,
}: ChatWelcomeScreenProps) {
  const { t } = useTranslation();
  const { token } = useToken();
  const navigate = useNavigate();
  const getAllEnabledModels = useModelStore((s) => s.getAllEnabledModels);
  const setActiveModel = useModelStore((s) => s.setActiveModel);

  // Suggestion prompts
  const suggestionItems = useMemo(
    () => [
      {
        key: "quantum",
        icon: <BulbOutlined style={{ color: "#7c3aed" }} />,
        label: t("suggestions.quantum", {
          ns: "chat",
          defaultValue: "Explain quantum computing in simple terms",
        }),
      },
      {
        key: "fibonacci",
        icon: <CodeOutlined style={{ color: "#2563eb" }} />,
        label: t("suggestions.fibonacci", {
          ns: "chat",
          defaultValue: "Write a Python function to calculate fibonacci",
        }),
      },
      {
        key: "debug",
        icon: <ToolOutlined style={{ color: "#dc2626" }} />,
        label: t("suggestions.debug", {
          ns: "chat",
          defaultValue: "Help me debug this error in my code",
        }),
      },
      {
        key: "marketing",
        icon: <FileTextOutlined style={{ color: "#16a34a" }} />,
        label: t("suggestions.marketing", {
          ns: "chat",
          defaultValue: "Create a marketing plan for a new product",
        }),
      },
    ],
    [t],
  );

  const handlePromptClick = useCallback(
    (info: { data: { key: string; label?: React.ReactNode } }) => {
      const label = typeof info.data.label === "string" ? info.data.label : "";
      if (label) {
        onInputChange(label);
      }
    },
    [onInputChange],
  );

  return (
    <div className="flex flex-col items-center justify-center h-full w-full overflow-y-auto px-4 sm:px-6">
      <div className="w-full flex flex-col items-center">
        <Welcome
          icon={
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 shadow-2xl">
              <StarOutlined className="text-2xl sm:text-3xl text-white" />
            </div>
          }
          title={t("welcomeTitle", { ns: "chat" })}
          description={t("welcomeSubtitle", {
            ns: "chat",
          })}
          variant="borderless"
          styles={{
            title: {
              fontSize: "1.75rem",
              fontWeight: 700,
            },
            description: {
              color: token.colorTextSecondary,
              fontSize: "1rem",
            },
          }}
        />
        {/* Model selector prompt when no model is active */}
        {!hasActiveModel && !isModelLoading && (
          <ModelSelectPrompt
            token={token}
            t={t}
            getAllEnabledModels={getAllEnabledModels}
            setActiveModel={setActiveModel}
            navigate={navigate}
            messageApi={messageApi}
          />
        )}
        {hasActiveModel && (
          <div className="mt-6 w-full">
            <Prompts
              items={suggestionItems}
              onItemClick={handlePromptClick}
              wrap
              styles={{
                item: {
                  flex: "1 1 calc(50% - 8px)",
                  minWidth: 200,
                },
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Inline model selector shown on the welcome screen when no model is active.
 */
const ModelSelectPrompt: React.FC<{
  token: any;
  t: any;
  getAllEnabledModels: () => { provider: any; model: any }[];
  setActiveModel: (selection: {
    providerId: string;
    modelId: string;
  }) => Promise<void>;
  navigate: (path: string) => void;
  messageApi: any;
}> = ({
  token,
  t,
  getAllEnabledModels,
  setActiveModel,
  navigate,
  messageApi,
}) => {
    const enabledModels = getAllEnabledModels();

    const handleSelect = useCallback(
      async (value: string) => {
        const [providerId, modelId] = value.split("||");
        await setActiveModel({ providerId, modelId });
        messageApi.success(t("modelSelected", "Model selected", { ns: "chat" }));
      },
      [setActiveModel, messageApi, t],
    );

    if (enabledModels.length === 0) {
      return (
        <div
          className="mt-6 p-6 rounded-xl border text-center"
          style={{
            borderColor: token.colorWarningBorder,
            backgroundColor: token.colorWarningBg,
          }}
        >
          <SettingOutlined
            className="text-3xl mb-3"
            style={{ color: token.colorWarning }}
          />
          <div
            className="text-sm font-medium mb-2"
            style={{ color: token.colorText }}
          >
            {t("noModelsConfigured", "No models configured", { ns: "chat" })}
          </div>
          <Text type="secondary" className="text-xs block mb-4">
            {t(
              "noModelsConfiguredDesc",
              "Please add and enable a model provider in settings first.",
              { ns: "chat" },
            )}
          </Text>
          <Button
            type="primary"
            icon={<SettingOutlined />}
            onClick={() => navigate("/settings?tab=models")}
          >
            {t("goToModelSettings", "Go to Model Settings", { ns: "chat" })}
          </Button>
        </div>
      );
    }

    // Group models by provider
    const groupedOptions = enabledModels.reduce<
      Record<
        string,
        {
          providerName: string;
          preset: ModelProviderPreset;
          models: { label: React.ReactNode; value: string }[];
        }
      >
    >((acc, { provider, model }) => {
      if (!acc[provider.id]) {
        acc[provider.id] = {
          providerName: provider.name,
          preset: provider.preset,
          models: [],
        };
      }
      acc[provider.id].models.push({
        label: model.name,
        value: `${provider.id}||${model.id}`,
      });
      return acc;
    }, {});

    const selectOptions = Object.entries(groupedOptions).map(([, group]) => ({
      label: (
        <span className="flex items-center gap-2">
          <ProviderIcon preset={group.preset} size={16} />
          {group.providerName}
        </span>
      ),
      options: group.models,
    }));

    return (
      <div
        className="mt-6 p-6 rounded-xl border w-full"
        style={{
          borderColor: token.colorPrimaryBorder,
          backgroundColor: token.colorPrimaryBg,
        }}
      >
        <div
          className="text-sm font-medium mb-3"
          style={{ color: token.colorText }}
        >
          {t("selectModelToStart", "Select a model to start chatting", {
            ns: "chat",
          })}
        </div>
        <Select
          className="w-full"
          size="large"
          placeholder={t("selectModel", "Select a model...", { ns: "chat" })}
          onChange={handleSelect}
          showSearch={{ optionFilterProp: 'label' }}
          options={selectOptions}
        />
      </div>
    );
  };
