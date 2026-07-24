import * as React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { createLogger } from "./services/logService";
import "./i18n";
import "./styles/index.css";
import "./styles/interaction-profile.css";

const log = createLogger("main");

ReactDOM.createRoot(document.getElementById("root")!).render(
	<React.StrictMode>
		<App />
	</React.StrictMode>,
);

// Use contextBridge
window.ipcRenderer?.on("main-process-message", (_event, message) => {
	log.info(String(message));
});
