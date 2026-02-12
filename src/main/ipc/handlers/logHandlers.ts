/**
 * Log IPC Handlers
 * Handles log query, stats, export, and viewer window operations
 */

import { dialog, ipcMain } from "electron";
import { LOG_CHANNELS } from "../channels";
import type {
	LogQueryParams,
	LogQueryResult,
	LogStats,
	RendererLogEntry,
} from "../types";
import { logDatabaseService } from "../../services/log";

let openViewerCallback: (() => void) | null = null;

export function setLogViewerOpener(callback: () => void): void {
	openViewerCallback = callback;
}

export function registerLogHandlers(): void {
	// Query logs with pagination and filters
	ipcMain.handle(
		LOG_CHANNELS.QUERY,
		async (_event, params: LogQueryParams): Promise<LogQueryResult> => {
			try {
				return logDatabaseService.query(params);
			} catch (error) {
				console.error("Failed to query logs:", error);
				return {
					records: [],
					total: 0,
					page: 1,
					pageSize: 50,
					totalPages: 0,
				};
			}
		},
	);

	// Get log stats
	ipcMain.handle(
		LOG_CHANNELS.GET_STATS,
		async (): Promise<LogStats> => {
			try {
				return logDatabaseService.getStats();
			} catch (error) {
				console.error("Failed to get log stats:", error);
				return {
					totalCount: 0,
					countByLevel: {},
					countByModule: {},
					countByProcess: {},
					recentErrorCount: 0,
					timeHistogram: [],
				};
			}
		},
	);

	// Get distinct modules
	ipcMain.handle(
		LOG_CHANNELS.GET_MODULES,
		async (): Promise<string[]> => {
			try {
				return logDatabaseService.getModules();
			} catch (error) {
				console.error("Failed to get modules:", error);
				return [];
			}
		},
	);

	// Receive log entries from renderer process
	ipcMain.handle(
		LOG_CHANNELS.RENDERER_LOG,
		async (_event, entry: RendererLogEntry): Promise<{ success: boolean }> => {
			try {
				logDatabaseService.insert({
					timestamp: new Date().toISOString(),
					level: entry.level,
					module: entry.module || "",
					process: "renderer",
					message: entry.message,
					meta: entry.meta,
					error_message: entry.error_message,
					error_stack: entry.error_stack,
				});
				return { success: true };
			} catch (error) {
				console.error("Failed to insert renderer log:", error);
				return { success: false };
			}
		},
	);

	// Clear all logs in database
	ipcMain.handle(
		LOG_CHANNELS.CLEAR_DB,
		async (): Promise<{ success: boolean }> => {
			try {
				logDatabaseService.clear();
				return { success: true };
			} catch (error) {
				console.error("Failed to clear log DB:", error);
				return { success: false };
			}
		},
	);

	// Export logs to JSON file
	ipcMain.handle(
		LOG_CHANNELS.EXPORT,
		async (_event, params: LogQueryParams): Promise<{ success: boolean; count?: number; filePath?: string }> => {
			try {
				const result = await dialog.showSaveDialog({
					title: "导出日志",
					defaultPath: `logs-export-${new Date().toISOString().slice(0, 10)}.json`,
					filters: [{ name: "JSON", extensions: ["json"] }],
				});

				if (result.canceled || !result.filePath) {
					return { success: false };
				}

				const exportResult = logDatabaseService.exportToFile(
					params,
					result.filePath,
				);
				return {
					success: true,
					count: exportResult.count,
					filePath: result.filePath,
				};
			} catch (error) {
				console.error("Failed to export logs:", error);
				return { success: false };
			}
		},
	);

	// Open log viewer window - uses callback set by main.ts
	ipcMain.handle(LOG_CHANNELS.OPEN_VIEWER, async () => {
		if (openViewerCallback) {
			openViewerCallback();
		}
		return { success: true };
	});
}
