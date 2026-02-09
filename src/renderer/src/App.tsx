import { App as AntdApp, ConfigProvider } from "antd";
import { RouterProvider } from "react-router-dom";
import { router } from "./router";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useEffect } from "react";

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

	return (
		<ConfigProvider
			theme={{
				token: {
					colorPrimary: "#1890ff",
				},
			}}
		>
			<AntdApp>
				<ErrorBoundary>
					<RouterProvider router={router} />
				</ErrorBoundary>
			</AntdApp>
		</ConfigProvider>
	);
}

export default App;
