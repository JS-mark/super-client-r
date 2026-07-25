import { App as AntdApp, ConfigProvider, Spin, theme } from "antd";
import en_US from "antd/locale/en_US";
import zhCN from "antd/locale/zh_CN";
import { Suspense, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { RouterProvider } from "react-router-dom";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { LegacyImportPrompt } from "./components/legacy/LegacyImportPrompt";
import { PluginWindowHandler } from "./components/plugin/PluginWindowHandler";
import { GlobalRequestLogHost } from "./components/settings/GlobalRequestLogHost";
import { TitleProvider } from "./hooks/useTitle";
import { router } from "./router";
import { featureFlagsService } from "./services/featureFlagsService";
import { useChatStore } from "./stores/chatStore";
import {
	getFeatureFlagsSnapshot,
	useFeatureFlagsStore,
} from "./stores/featureFlagsStore";
import { useSkinStore } from "./stores/skinStore";
import { initSystemThemeDetection, useThemeStore } from "./stores/themeStore";
import { useProjectStore } from "./stores/projectStore";
import { useUpdateStore } from "./stores/updateStore";

const ANTD_LOCALES: Record<string, typeof zhCN> = {
	zh: zhCN,
	en: en_US,
};

const { darkAlgorithm, compactAlgorithm, defaultAlgorithm } = theme;

/**
 * Renders the active markdown theme CSS as an inline <style> tag.
 * This approach is more reliable than Electron's insertCSS since it
 * survives Vite HMR re-injections and page navigations.
 */
function MarkdownThemeStyle() {
	const css = useSkinStore((state) => state.markdownThemeCSS);
	if (!css) return null;
	// biome-ignore lint/security/noDangerouslySetInnerHtml: CSS from trusted plugin source
	return <style dangerouslySetInnerHTML={{ __html: css }} />;
}

function App() {
	// 从 store 获取实际主题
	const actualTheme = useThemeStore((state) => state.actualTheme);
	const { i18n } = useTranslation();
	const antdTokenOverrides = useSkinStore((state) => state.antdTokenOverrides);
	const initSkin = useSkinStore((state) => state.initialize);
	const setAntdTokenOverrides = useSkinStore(
		(state) => state.setAntdTokenOverrides,
	);
	const setMarkdownThemeCSS = useSkinStore(
		(state) => state.setMarkdownThemeCSS,
	);
	const antdLocale = useMemo(
		() => ANTD_LOCALES[i18n.language] || zhCN,
		[i18n.language],
	);
	// 初始化主题
	useEffect(() => {
		initSystemThemeDetection();
	}, []);

	// §22 rollback flags: 把 renderer 端的 flags 同步到 main，
	// 让 RuntimePolicyService 等主进程消费方读取到最新 enforcement 位。
	useEffect(() => {
		featureFlagsService.push(getFeatureFlagsSnapshot()).catch(() => {});
		const unsubscribe = useFeatureFlagsStore.subscribe((state) => {
			featureFlagsService
				.push({
					unifiedNavigation: state.unifiedNavigation,
					runtimeEnforcement: state.runtimeEnforcement,
					fileArtifacts: state.fileArtifacts,
					profileLayouts: state.profileLayouts,
				})
				.catch(() => {});
		});
		return unsubscribe;
	}, []);

	// E-5: load Project registry for sidebar / TitleBar / NewConversationModal.
	useEffect(() => {
		void useProjectStore.getState().load();
	}, []);

	// SUP-17: 全局订阅自动更新事件，使 main 进程的自动检查结果对用户可见
	// （生产环境启动时会自动 checkForUpdates）。store 内有幂等守卫，
	// 与设置页的订阅不冲突。
	useEffect(() => useUpdateStore.getState().subscribe(), []);

	// 同步 body 背景色到当前主题（确保 Error 等全屏页面背景正确）
	// 浮窗路由 (#/float) 需要保持透明，否则 body 白底会盖在透明窗口上，
	// 让胶囊圆角外、capsule 与 panel 间的间隙都泛白。
	useEffect(() => {
		// dev 用 loadURL 得到 hash `#/float`；prod 用 loadFile({ hash: "float" })
		// 得到 hash `#float`。两者都视为浮窗。
		const hash = window.location.hash;
		const isFloatWindow = hash === "#/float" || hash === "#float";
		if (isFloatWindow) {
			document.documentElement.style.backgroundColor = "transparent";
			document.body.style.backgroundColor = "transparent";
			document.body.style.color =
				actualTheme === "dark"
					? "rgba(255, 255, 255, 0.88)"
					: "rgba(0, 0, 0, 0.88)";
			return;
		}
		document.body.style.backgroundColor =
			actualTheme === "dark" ? "#141414" : "#ffffff";
		document.body.style.color =
			actualTheme === "dark"
				? "rgba(255, 255, 255, 0.88)"
				: "rgba(0, 0, 0, 0.88)";
	}, [actualTheme]);

	// 初始化皮肤
	useEffect(() => {
		initSkin();
		const unsubscribeSkin = window.electron.skin.onTokensChanged((tokens) => {
			setAntdTokenOverrides(tokens);
		});
		const unsubscribeMarkdown = window.electron.markdownTheme.onCSSChanged(
			(css) => {
				setMarkdownThemeCSS(css);
			},
		);
		return () => {
			unsubscribeSkin();
			unsubscribeMarkdown();
		};
	}, [initSkin, setAntdTokenOverrides, setMarkdownThemeCSS]);

	useEffect(() => {
		// Global navigation handler from main process
		const handleNavigate = (_event: any, ...args: any[]) => {
			const path = args[0] as string;
			router.navigate(path);
		};

		// Float widget pending message handler
		const handleFloatMessage = (_event: any, ...args: any[]) => {
			const data = args[0] as { message: string } | undefined;
			if (data?.message) {
				useChatStore.getState().setPendingInput(data.message);
				useChatStore.getState().setPendingAutoSend(true);
			}
		};

		// Check if electron API is available
		if (window.electron && window.electron.ipc) {
			window.electron.ipc.on("navigate-to", handleNavigate);
			window.electron.ipc.on("float:pending-message", handleFloatMessage);
		}

		return () => {
			// Cleanup event listeners
			if (window.electron && window.electron.ipc) {
				window.electron.ipc.off("navigate-to", handleNavigate);
				window.electron.ipc.off("float:pending-message", handleFloatMessage);
			}
		};
	}, []);

	// Extract skin token overrides (supports light/dark format)
	const skinOverrides = useMemo(() => {
		const data = antdTokenOverrides as Record<string, unknown> | null;
		if (!data) return { token: undefined, components: undefined };
		// New format: { light: { token, components }, dark: { token, components } }
		if (data.light || data.dark) {
			const modeData = (actualTheme === "dark" ? data.dark : data.light) as
				| Record<string, unknown>
				| undefined;
			return {
				token: modeData?.token as Record<string, unknown> | undefined,
				components: modeData?.components as Record<string, unknown> | undefined,
			};
		}
		// Legacy format: { token, components }
		return {
			token: data.token as Record<string, unknown> | undefined,
			components: data.components as Record<string, unknown> | undefined,
		};
	}, [antdTokenOverrides, actualTheme]);
	const skinTokens = skinOverrides.token;
	const skinComponents = skinOverrides.components;

	// 根据实际主题选择算法
	const antdTheme = {
		algorithm:
			actualTheme === "dark"
				? [darkAlgorithm, compactAlgorithm]
				: [defaultAlgorithm, compactAlgorithm],
		// 自定义 token 以匹配 Tailwind 主题
		token: {
			// 颜色
			colorPrimary: "#1890ff",
			colorSuccess: "#52c41a",
			colorWarning: "#faad14",
			colorError: "#f5222d",
			colorInfo: "#1890ff",
			// 文字颜色
			colorTextBase:
				actualTheme === "dark"
					? "rgba(255, 255, 255, 0.88)"
					: "rgba(0, 0, 0, 0.88)",
			colorBgBase: actualTheme === "dark" ? "#141414" : "#ffffff",
			// 圆角
			borderRadius: 6,
			// 字体
			fontFamily:
				"-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
			// Skin token overrides
			...skinTokens,
		},
		components: {
			Layout: {
				headerBg: actualTheme === "dark" ? "#1f1f1f" : "#ffffff",
				siderBg: actualTheme === "dark" ? "#141414" : "#f5f5f5",
				triggerBg: actualTheme === "dark" ? "#262626" : "#ffffff",
				triggerColor:
					actualTheme === "dark"
						? "rgba(255, 255, 255, 0.65)"
						: "rgba(0, 0, 0, 0.65)",
			},
			Menu: {
				darkItemBg: "#141414",
				darkItemSelectedBg: "#1890ff",
				darkItemColor: "rgba(255, 255, 255, 0.65)",
				darkItemSelectedColor: "#ffffff",
			},
			Card: {
				colorBgContainer: actualTheme === "dark" ? "#1f1f1f" : "#ffffff",
			},
			Input: {
				colorBgContainer: actualTheme === "dark" ? "#141414" : "#ffffff",
				colorBorder: actualTheme === "dark" ? "#424242" : "#d9d9d9",
			},
			Select: {
				colorBgContainer: actualTheme === "dark" ? "#141414" : "#ffffff",
				colorBorder: actualTheme === "dark" ? "#424242" : "#d9d9d9",
			},
			Button: {
				colorBgContainer: actualTheme === "dark" ? "transparent" : "#ffffff",
				colorBorder: actualTheme === "dark" ? "#424242" : "#d9d9d9",
			},
			Modal: {
				contentBg: actualTheme === "dark" ? "#1f1f1f" : "#ffffff",
				headerBg: actualTheme === "dark" ? "#1f1f1f" : "#ffffff",
				footerBg: actualTheme === "dark" ? "#1f1f1f" : "#ffffff",
			},
			Drawer: {
				colorBgElevated: actualTheme === "dark" ? "#1f1f1f" : "#ffffff",
			},
			Table: {
				colorBgContainer: actualTheme === "dark" ? "#1f1f1f" : "#ffffff",
				headerBg: actualTheme === "dark" ? "#262626" : "#fafafa",
				borderColor: actualTheme === "dark" ? "#424242" : "#f0f0f0",
			},
				Divider: {
				colorSplit: actualTheme === "dark" ? "#424242" : "#f0f0f0",
			},
			Tooltip: {
				colorBgSpotlight:
					actualTheme === "dark" ? "#434343" : "rgba(0, 0, 0, 0.75)",
			},
			Popover: {
				colorBgElevated: actualTheme === "dark" ? "#1f1f1f" : "#ffffff",
			},
			Dropdown: {
				colorBgElevated: actualTheme === "dark" ? "#1f1f1f" : "#ffffff",
			},
			// Skin component overrides
			...skinComponents,
		},
	};

	return (
		<ConfigProvider
			theme={antdTheme}
			locale={antdLocale}
			// 禁用动画以提高性能
			wave={{ disabled: true }}
		>
			<MarkdownThemeStyle />
			<TitleProvider>
				<AntdApp className="h-full w-full" message={{ maxCount: 3, top: 48 }}>
					<PluginWindowHandler />
					<LegacyImportPrompt />
					<GlobalRequestLogHost />
					<ErrorBoundary>
						{/*
						 * router 内部使用了 React.lazy（例如 /log-viewer、
						 * /debug/agent-traces 弹出窗口）。一旦命中这些路由就会
						 * suspend，没有 Suspense 边界 React 19 会直接抛错，
						 * 让独立窗口在加载时白屏并被 errorElement 兜住。
						 */}
						<Suspense
							fallback={
								<div className="flex h-full w-full items-center justify-center">
									<Spin />
								</div>
							}
						>
							<RouterProvider router={router} />
						</Suspense>
					</ErrorBoundary>
				</AntdApp>
			</TitleProvider>
		</ConfigProvider>
	);
}

export default App;
