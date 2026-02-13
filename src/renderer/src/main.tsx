import * as React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./i18n";
import "./styles/index.css";

// 开发环境连接 React DevTools 独立应用
if (import.meta.env.DEV) {
	const script = document.createElement("script");
	script.src = "http://localhost:8097";
	script.async = true;
	script.onerror = () => {
		console.log(
			"[React DevTools] Standalone app not running. Start with: npx react-devtools",
		);
	};
	document.head.appendChild(script);
}

ReactDOM.createRoot(document.getElementById("root")!).render(
	<React.StrictMode>
		<App />
	</React.StrictMode>,
);

// Use contextBridge
window.ipcRenderer?.on("main-process-message", (_event, message) => {
	console.log(message);
});
