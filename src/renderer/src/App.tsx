import { App as AntdApp, ConfigProvider, theme } from "antd";
import en_US from "antd/locale/en_US";
import zhCN from "antd/locale/zh_CN";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { RouterProvider } from "react-router-dom";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { PluginWindowHandler } from "./components/plugin/PluginWindowHandler";
import { TitleProvider } from "./hooks/useTitle";
import { router } from "./router";
import { useSkinStore } from "./stores/skinStore";
import { initSystemThemeDetection, useThemeStore } from "./stores/themeStore";

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

		// Check if electron API is available
		if (window.electron && window.electron.ipc) {
			window.electron.ipc.on("navigate-to", handleNavigate);
		}

		return () => {
			// Cleanup event listener
			if (window.electron && window.electron.ipc) {
				window.electron.ipc.off("navigate-to", handleNavigate);
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
			List: {
				colorSplit: actualTheme === "dark" ? "#424242" : "#f0f0f0",
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
				<AntdApp className="h-full w-full">
					<PluginWindowHandler />
					<ErrorBoundary>
						<RouterProvider router={router} />
					</ErrorBoundary>
				</AntdApp>
			</TitleProvider>
		</ConfigProvider>
	);
}

export default App;
