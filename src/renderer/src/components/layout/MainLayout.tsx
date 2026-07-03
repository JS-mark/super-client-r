import { theme } from "antd";
import { AnimatePresence, motion } from "motion/react";
import type React from "react";
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAppShortcuts } from "../../hooks/useAppShortcuts";
import { useEffectiveInteractionProfile } from "../../hooks/useEffectiveInteractionProfile";
import { type AppInfo, appService } from "../../services/appService";
import { useFeatureFlagsStore } from "../../stores/featureFlagsStore";
import { useMenuStore } from "../../stores/menuStore";
import { useModelStore } from "../../stores/modelStore";
import { AboutModal } from "../AboutModal";
import { NewConversationModal } from "../chat/NewConversationModal";
import { SettingsRail } from "../settings/SettingsRail";
import { TerminalPanel } from "../terminal/TerminalPanel";
import { AppSidebar } from "./AppSidebar";
import { ClaudeSidebar } from "./ClaudeSidebar";
import { TitleBar } from "./TitleBar";

const { useToken } = theme;

// Page transition config
const pageTransition = {
  duration: 0.2,
  ease: [0.4, 0, 0.2, 1] as [number, number, number, number],
};

// --- Main Layout ---

export const MainLayout: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const location = useLocation();
  const { token } = useToken();

  useAppShortcuts();

  const setPluginItems = useMenuStore((state) => state.setPluginItems);
  const loadProviders = useModelStore((s) => s.loadProviders);
  const loadActiveModel = useModelStore((s) => s.loadActiveModel);

  // Effective interactionProfile drives which sidebar to render shell-wide.
  const interactionProfile = useEffectiveInteractionProfile();

  const [aboutModalOpen, setAboutModalOpen] = useState(false);
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);

  // Initialize model store on app mount so all pages can access providers
  useEffect(() => {
    loadProviders();
    loadActiveModel();
  }, [loadProviders, loadActiveModel]);

  useEffect(() => {
    appService.getInfo().then((info) => {
      setAppInfo(info);
    });
  }, []);

  useEffect(() => {
    const handleShowAboutModal = () => {
      setAboutModalOpen(true);
    };
    window.electron.ipc.on("show-about-modal", handleShowAboutModal);
    return () => {
      window.electron.ipc.off("show-about-modal", handleShowAboutModal);
    };
  }, []);

  // Sync plugin sidebar contributions
  useEffect(() => {
    const syncContributions = (contributions: unknown) => {
      const data = contributions as {
        sidebars?: Array<{
          pluginId: string;
          id: string;
          label: string;
          icon: string;
          iconType: "default" | "emoji";
          path: string;
          order?: number;
        }>;
      };
      if (data?.sidebars) {
        setPluginItems(
          data.sidebars.map((s) => ({
            id: `plugin:${s.pluginId}/${s.id}`,
            label: s.label,
            path: s.path,
            iconType: s.iconType,
            iconContent: s.icon,
            enabled: true,
            action: "navigate" as const,
          })),
        );
      }
    };

    // Load initial contributions
    window.electron.plugin
      .getUIContributions()
      .then((result) => {
        if (result.success && result.data) {
          syncContributions(result.data);
        }
      })
      .catch(() => { });

    // Listen for changes
    const unsubscribe =
      window.electron.plugin.onUIContributionsChanged(syncContributions);
    return unsubscribe;
  }, [setPluginItems]);

  // §22 rollback flag: 关闭 profileLayouts 时强制走 AppSidebar，忽略 profile。
  const profileLayouts = useFeatureFlagsStore((s) => s.profileLayouts);
  const useClaudeSidebar =
    profileLayouts &&
    (interactionProfile === "claude-code" || interactionProfile === "hybrid");

  // Settings shell provides its own left rail. Hide the app-level sidebar
  // whenever we're inside `/settings/*` so SettingsRail can take that slot.
  const isSettingsRoute = location.pathname.startsWith("/settings");

  return (
    <div
      className="h-screen overflow-hidden flex bg-linear-to-br from-slate-50 via-blue-50/20 to-purple-50/10"
      data-interaction-profile={interactionProfile}
    >
      {/* Sidebar slot — Settings shell replaces the workspace sidebar with
          SettingsRail so the settings navigation matches the workspace's
          left-sidebar + right-column structure (rail spans full height,
          TitleBar sits inside the right column only). */}
      {isSettingsRoute ? (
        <SettingsRail />
      ) : useClaudeSidebar ? (
        <ClaudeSidebar onOpenAbout={() => setAboutModalOpen(true)} />
      ) : (
        <AppSidebar onOpenAbout={() => setAboutModalOpen(true)} />
      )}

      {/* Right column */}
      <div className="flex-1 h-full flex flex-col overflow-hidden">
        {/* Title bar */}
        <TitleBar />

        {/* Scrollable content area */}
        <div
          className="flex-1 overflow-y-auto"
          style={{ background: token.colorBgContainer }}
        >
          <AnimatePresence mode="wait">
            {/*
              Settings shell shares a single transition key across all
              `/settings/*` sub-routes so that switching between Rail tabs
              re-renders only the Outlet, not the whole page. Entering
              Settings from workspace slides up from bottom; leaving slides
              back down. Other routes keep the original subtle fade.
            */}
            <motion.div
              key={
                isSettingsRoute ? "settings-shell" : location.pathname
              }
              initial={
                isSettingsRoute
                  ? { opacity: 0, y: "100%" }
                  : { opacity: 0, y: 8 }
              }
              animate={{ opacity: 1, y: 0 }}
              exit={
                isSettingsRoute
                  ? { opacity: 0, y: "100%" }
                  : { opacity: 0, y: -4 }
              }
              transition={
                isSettingsRoute
                  ? {
                      duration: 0.28,
                      ease: [0.4, 0, 0.2, 1] as [
                        number,
                        number,
                        number,
                        number,
                      ],
                    }
                  : pageTransition
              }
              className="h-full"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Bottom-docked terminal panel; renders nothing when closed.
				    Sits in the right column flex flow so the content area
				    above naturally shrinks to make room. */}
        <TerminalPanel />
      </div>

      {/* About modal */}
      <AboutModal
        open={aboutModalOpen}
        onClose={() => setAboutModalOpen(false)}
        appInfo={appInfo}
      />

      {/* §25.3 advanced "新建任务…" modal — listens for the
			    `chat:open-new-conversation` window event dispatched by
			    TitleBar More menu. */}
      <NewConversationModal />
    </div>
  );
};
