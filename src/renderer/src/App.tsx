import { App as AntdApp, ConfigProvider, theme } from "antd";
import { useEffect } from "react";
import { RouterProvider } from "react-router-dom";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { TitleProvider } from "./hooks/useTitle";
import { router } from "./router";

const { darkAlgorithm, compactAlgorithm } = theme;
function App() {
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

	const theme = {
		algorithm: [darkAlgorithm, compactAlgorithm],
	};

	return (
		<ConfigProvider
			theme={theme}
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
