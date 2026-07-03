import { app, ipcMain } from "electron";
import { DIAGNOSTICS_CHANNELS } from "../channels";
import { getAgentTraceCollector } from "../../services/agent/trace/AgentTraceCollector";
import { DiagnosticExportService } from "../../services/diagnostics/DiagnosticExportService";
import { getSessionStorage } from "../../services/storage/SessionStorageService";

export function registerDiagnosticsHandlers(): void {
	ipcMain.handle(DIAGNOSTICS_CHANNELS.EXPORT, async () => {
		try {
			const service = new DiagnosticExportService({
				appUserDataDir: app.getPath("userData"),
				sessionStorage: getSessionStorage(),
				traceCollector: getAgentTraceCollector(),
				appVersion: app.getVersion(),
			});
			return { success: true, data: service.export() };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	});
}
