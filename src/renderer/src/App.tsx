import { App as AntdApp, ConfigProvider, theme } from "antd";
import { useEffect } from "react";
import { RouterProvider } from "react-router-dom";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { TitleProvider } from "./hooks/useTitle";
import { useThemeStore, initSystemThemeDetection } from "./stores/themeStore";
import { router } from "./router";

const { darkAlgorithm, compactAlgorithm, defaultAlgorithm } = theme;

function App() {
	// 从 store 获取实际主题
	const actualTheme = useThemeStore((state) => state.actualTheme);

	// 初始化主题
	useEffect(() => {
		initSystemThemeDetection();
	}, []);

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
			colorTextBase: actualTheme === "dark" ? "rgba(255, 255, 255, 0.88)" : "rgba(0, 0, 0, 0.88)",
			colorBgBase: actualTheme === "dark" ? "#141414" : "#ffffff",
			// 圆角
			borderRadius: 6,
			// 字体
			fontFamily:
				"-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
		},
		components: {
			Layout: {
				headerBg: actualTheme === "dark" ? "#1f1f1f" : "#ffffff",
				siderBg: actualTheme === "dark" ? "#141414" : "#f5f5f5",
				triggerBg: actualTheme === "dark" ? "#262626" : "#ffffff",
				triggerColor: actualTheme === "dark" ? "rgba(255, 255, 255, 0.65)" : "rgba(0, 0, 0, 0.65)",
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
				colorBgSpotlight: actualTheme === "dark" ? "#434343" : "rgba(0, 0, 0, 0.75)",
			},
			Popover: {
				colorBgElevated: actualTheme === "dark" ? "#1f1f1f" : "#ffffff",
			},
			Dropdown: {
				colorBgElevated: actualTheme === "dark" ? "#1f1f1f" : "#ffffff",
			},
		},
	};

	return (
		<ConfigProvider
			theme={antdTheme}
			// 禁用动画以提高性能
			wave={{ disabled: true }}
		>
			<TitleProvider>
				<AntdApp className="h-full w-full">
					<ErrorBoundary>
						<RouterProvider router={router} />
					</ErrorBoundary>
				</AntdApp>
			</TitleProvider>
		</ConfigProvider>
	);
}

export default App;
