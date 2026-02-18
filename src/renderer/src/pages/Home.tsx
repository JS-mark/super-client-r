import {
  ApiOutlined,
  CloudOutlined,
  CodeOutlined,
  HomeOutlined,
  MessageOutlined,
  RobotOutlined,
  SettingOutlined,
  ThunderboltOutlined,
  ToolOutlined,
} from "@ant-design/icons";
import { Button, Card, Statistic, Tag, theme } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { MainLayout } from "../components/layout/MainLayout";
import { useTitle } from "../hooks/useTitle";
import { type ApiStatus, apiService } from "../services/apiService";
import { useChatStore } from "../stores/chatStore";
import { useMcpStore } from "../stores/mcpStore";
import { useModelStore } from "../stores/modelStore";
import { useSkillStore } from "../stores/skillStore";

interface QuickAction {
  key: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  onClick: () => void;
}

const { useToken } = theme;

const Home = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { token } = useToken();

  // 设置标题栏
  const pageTitle = useMemo(
    () => (
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center">
          <HomeOutlined className="text-white text-xs" />
        </div>
        <span style={{ color: token.colorText }} className="text-sm font-medium">
          {t("home", "首页", { ns: "menu" })}
        </span>
      </div>
    ),
    [t, token.colorText],
  );
  useTitle(pageTitle);
  const messages = useChatStore((state) => state.messages);
  const servers = useMcpStore((state) => state.servers);
  const installedSkills = useSkillStore((state) => state.installedSkills);
  const getAllEnabledModels = useModelStore((state) => state.getAllEnabledModels);
  const [apiStatus, setApiStatus] = useState<ApiStatus>({
    status: "stopped",
    port: 0,
  });

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const status = await apiService.getStatus();
        setApiStatus(status);
      } catch {
        // ignore
      }
    };
    checkStatus();
  }, []);

  const connectedMcpServers = servers.filter(
    (s) => s.status === "connected",
  ).length;
  const enabledModels = getAllEnabledModels().length;

  const quickActions: QuickAction[] = [
    {
      key: "chat",
      title: t("quickActions.chat", "Start Chat", { ns: "home" }),
      description: t("quickActions.chatDesc", "Chat with AI assistant", {
        ns: "home",
      }),
      icon: <MessageOutlined className="text-2xl" />,
      color: "from-blue-500 to-blue-600",
      onClick: () => navigate("/chat"),
    },
    {
      key: "models",
      title: t("quickActions.models", "Models", { ns: "home" }),
      description: t("quickActions.modelsDesc", "Configure AI models", {
        ns: "home",
      }),
      icon: <CloudOutlined className="text-2xl" />,
      color: "from-purple-500 to-purple-600",
      onClick: () => navigate("/models"),
    },
    {
      key: "skills",
      title: t("quickActions.skills", "Skills", { ns: "home" }),
      description: t("quickActions.skillsDesc", "Browse skill marketplace", {
        ns: "home",
      }),
      icon: <ToolOutlined className="text-2xl" />,
      color: "from-orange-500 to-orange-600",
      onClick: () => navigate("/skills"),
    },
    {
      key: "mcp",
      title: t("quickActions.mcp", "MCP", { ns: "home" }),
      description: t("quickActions.mcpDesc", "Manage MCP servers", {
        ns: "home",
      }),
      icon: <ApiOutlined className="text-2xl" />,
      color: "from-cyan-500 to-cyan-600",
      onClick: () => navigate("/mcp"),
    },
  ];

  return (
    <MainLayout>
      <div className="space-y-8">
        {/* Hero Section */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8 md:p-12">
          {/* Background Pattern - 使用静态渐变替代动画以提高性能 */}
          <div className="absolute inset-0 opacity-20">
            <div className="absolute top-0 left-0 w-96 h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl" />
            <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl" />
            <div className="absolute -bottom-32 left-1/2 w-96 h-96 bg-pink-500 rounded-full mix-blend-multiply filter blur-3xl" />
          </div>

          <div className="relative z-10">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-400 via-purple-500 to-pink-500 flex items-center justify-center shadow-xl shadow-purple-500/30">
                <RobotOutlined className="text-3xl text-white" />
              </div>
              <div>
                <h1 className="text-3xl md:text-4xl font-bold text-white">
                  {t("welcome", "Welcome to Super Client", { ns: "home" })}
                </h1>
                <p className="text-slate-300 mt-1">
                  {t("subtitle", "Your AI-powered desktop assistant", {
                    ns: "home",
                  })}
                </p>
              </div>
            </div>

            <p className="text-slate-400 max-w-2xl mb-6">
              {t(
                "home.description",
                "Super Client is a powerful AI desktop application that integrates multiple AI services, skills, and MCP servers for seamless productivity.",
              )}
            </p>

            <div className="flex flex-wrap gap-3">
              <Button
                type="primary"
                size="large"
                icon={<MessageOutlined />}
                onClick={() => navigate("/chat")}
                className="!bg-white !text-slate-900 hover:!bg-slate-100 !border-0 !rounded-xl !h-12 !px-6"
              >
                {t("startChat", "Start Chatting", { ns: "home" })}
              </Button>
              <Button
                size="large"
                icon={<SettingOutlined />}
                onClick={() => navigate("/settings")}
                className="!bg-white/10 !text-white !border-white/20 hover:!bg-white/20 !rounded-xl !h-12 !px-6"
              >
                {t("settings", "Settings", { ns: "home" })}
              </Button>
            </div>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card
            className="!rounded-2xl"
            style={{
              background: `linear-gradient(to bottom right, ${token.colorPrimaryBg}, ${token.colorInfoBg})`,
              borderColor: token.colorPrimaryBorder,
            }}
          >
            <Statistic
              title={
                <span style={{ color: token.colorPrimary }}>
                  {t("stats.messages", "Messages", { ns: "home" })}
                </span>
              }
              value={messages.length}
              prefix={<MessageOutlined className="mr-2" />}
              valueStyle={{ color: token.colorPrimary }}
            />
          </Card>

          <Card
            className="!rounded-2xl"
            style={{
              background: `linear-gradient(to bottom right, #f3e8ff, #e9d5ff)`,
              borderColor: "#c084fc",
            }}
          >
            <Statistic
              title={
                <span style={{ color: "#9333ea" }}>
                  {t("stats.models", "Active Models", { ns: "home" })}
                </span>
              }
              value={enabledModels}
              prefix={<CloudOutlined className="mr-2" />}
              valueStyle={{ color: "#9333ea" }}
            />
          </Card>

          <Card
            className="!rounded-2xl"
            style={{
              background: `linear-gradient(to bottom right, #ffedd5, #fed7aa)`,
              borderColor: "#fb923c",
            }}
          >
            <Statistic
              title={
                <span style={{ color: "#ea580c" }}>
                  {t("stats.skills", "Skills", { ns: "home" })}
                </span>
              }
              value={installedSkills.length}
              prefix={<ToolOutlined className="mr-2" />}
              valueStyle={{ color: "#ea580c" }}
            />
          </Card>

          <Card
            className="!rounded-2xl"
            style={{
              background: `linear-gradient(to bottom right, #cffafe, #a5f3fc)`,
              borderColor: "#22d3ee",
            }}
          >
            <Statistic
              title={
                <span style={{ color: "#0891b2" }}>
                  {t("stats.mcp", "MCP Connected", { ns: "home" })}
                </span>
              }
              value={connectedMcpServers}
              prefix={<ApiOutlined className="mr-2" />}
              valueStyle={{ color: "#0891b2" }}
            />
          </Card>
        </div>

        {/* Quick Actions */}
        <div>
          <h2
            className="text-xl font-bold mb-4 flex items-center gap-2"
            style={{ color: token.colorTextHeading }}
          >
            <ThunderboltOutlined className="text-yellow-500" />
            {t("quickActions.title", "Quick Actions", { ns: "home" })}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {quickActions.map((action) => (
              <button
                key={action.key}
                onClick={action.onClick}
                className="group relative overflow-hidden rounded-2xl p-6 text-left transition-all duration-300 hover:scale-[1.02] hover:shadow-xl"
              >
                <div
                  className={`absolute inset-0 bg-gradient-to-br ${action.color} opacity-90 transition-opacity group-hover:opacity-100`}
                />
                <div className="relative z-10">
                  <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center mb-4 text-white">
                    {action.icon}
                  </div>
                  <h3 className="text-lg font-bold text-white mb-1">
                    {action.title}
                  </h3>
                  <p className="text-white/80 text-sm">{action.description}</p>
                </div>
                <div className="absolute bottom-0 right-0 w-32 h-32 bg-white/10 rounded-full -mb-16 -mr-16 transition-transform group-hover:scale-150" />
              </button>
            ))}
          </div>
        </div>

        {/* Status Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card
            title={
              <div className="flex items-center gap-2">
                <CodeOutlined className="text-blue-500" />
                <span>
                  {t("apiStatus.title", "API Service Status", { ns: "home" })}
                </span>
              </div>
            }
            className="!rounded-2xl"
            style={{ borderColor: token.colorBorder }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={`w-3 h-3 rounded-full ${apiStatus.status === "running"
                    ? "bg-green-500 animate-pulse"
                    : "bg-slate-400"
                    }`}
                />
                <span className="font-medium">
                  {apiStatus.status === "running"
                    ? t("apiStatus.running", "Running", { ns: "home" })
                    : t("apiStatus.stopped", "Stopped", { ns: "home" })}
                </span>
              </div>
              {apiStatus.status === "running" && (
                <Tag color="success" className="!rounded-lg">
                  Port {apiStatus.port}
                </Tag>
              )}
            </div>
            {apiStatus.status === "stopped" && (
              <Button
                type="primary"
                size="small"
                className="mt-4 !rounded-lg"
                onClick={() => apiService.start()}
              >
                {t("apiStatus.start", "Start Service", { ns: "home" })}
              </Button>
            )}
          </Card>

          <Card
            title={
              <div className="flex items-center gap-2">
                <RobotOutlined className="text-purple-500" />
                <span>
                  {t("featured.title", "Featured Features", { ns: "home" })}
                </span>
              </div>
            }
            className="!rounded-2xl"
            style={{ borderColor: token.colorBorder }}
          >
            <div className="space-y-3">
              <div
                className="flex items-center gap-3 p-3 rounded-xl"
                style={{ backgroundColor: token.colorBgContainer }}
              >
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: token.colorPrimaryBg }}
                >
                  <MessageOutlined style={{ color: token.colorPrimary }} />
                </div>
                <div>
                  <div className="font-medium">
                    {t("featured.chat", "Multi-Mode Chat", { ns: "home" })}
                  </div>
                  <div style={{ color: token.colorTextSecondary }} className="text-sm">
                    {t(
                      "featured.chatDesc",
                      "Direct, Agent, Skill & MCP modes",
                      { ns: "home" },
                    )}
                  </div>
                </div>
              </div>
              <div
                className="flex items-center gap-3 p-3 rounded-xl"
                style={{ backgroundColor: token.colorBgContainer }}
              >
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: "#f3e8ff" }}
                >
                  <ApiOutlined style={{ color: "#9333ea" }} />
                </div>
                <div>
                  <div className="font-medium">
                    {t("featured.mcp", "MCP Integration", { ns: "home" })}
                  </div>
                  <div style={{ color: token.colorTextSecondary }} className="text-sm">
                    {t("featured.mcpDesc", "Connect to external tool servers", {
                      ns: "home",
                    })}
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </MainLayout>
  );
};

export default Home;
