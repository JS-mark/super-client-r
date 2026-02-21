const APP_CHANNELS = {
	GET_INFO: "app:get-info",
	GET_USER_DATA_PATH: "app:get-user-data-path",
	OPEN_PATH: "app:open-path",
	OPEN_EXTERNAL: "app:open-external",
	CHECK_UPDATE: "app:check-update",
	QUIT: "app:quit",
	RELAUNCH: "app:relaunch",
	OPEN_DEV_TOOLS: "app:open-dev-tools",
	GET_LOGS: "app:get-logs",
	GET_LOGS_PATH: "app:get-logs-path",
	LIST_LOG_FILES: "app:list-log-files",
	CLEAR_LOGS: "app:clear-logs",
};

export interface AppInfo {
	name: string;
	version: string;
	electron: string;
	node: string;
	platform: string;
	arch: string;
	v8?: string;
}

export interface UpdateCheckResult {
	updateAvailable: boolean;
	version?: string;
	message: string;
}

export interface LogFileInfo {
	name: string;
	path: string;
	size: number;
	createdAt: string;
	modifiedAt: string;
}

export const appService = {
	getInfo: () =>
		window.electron.ipc.invoke(APP_CHANNELS.GET_INFO) as Promise<AppInfo>,
	getUserDataPath: () =>
		window.electron.ipc.invoke(
			APP_CHANNELS.GET_USER_DATA_PATH,
		) as Promise<string>,
	openPath: (path: string) =>
		window.electron.ipc.invoke(
			APP_CHANNELS.OPEN_PATH,
			path,
		) as Promise<boolean>,
	checkUpdate: () =>
		window.electron.update.check() as Promise<UpdateCheckResult>,
	quit: () => window.electron.ipc.invoke(APP_CHANNELS.QUIT) as Promise<void>,
	relaunch: () =>
		window.electron.ipc.invoke(APP_CHANNELS.RELAUNCH) as Promise<void>,
	openDevTools: () =>
		window.electron.ipc.invoke(APP_CHANNELS.OPEN_DEV_TOOLS) as Promise<void>,
	getLogs: (filePath?: string, tail?: number) =>
		window.electron.ipc.invoke(
			APP_CHANNELS.GET_LOGS,
			filePath,
			tail,
		) as Promise<string>,
	getLogsPath: () =>
		window.electron.ipc.invoke(APP_CHANNELS.GET_LOGS_PATH) as Promise<string>,
	listLogFiles: () =>
		window.electron.ipc.invoke(APP_CHANNELS.LIST_LOG_FILES) as Promise<
			LogFileInfo[]
		>,
	clearLogs: () =>
		window.electron.ipc.invoke(APP_CHANNELS.CLEAR_LOGS) as Promise<boolean>,
	openExternal: (url: string) =>
		window.electron.ipc.invoke(
			APP_CHANNELS.OPEN_EXTERNAL,
			url,
		) as Promise<boolean>,
	// Update methods using typed preload API
	downloadUpdate: () => window.electron.update.download(),
	installUpdate: () => window.electron.update.install(),
	onUpdateChecking: (cb: () => void) => window.electron.update.onChecking(cb),
	onUpdateAvailable: (cb: (info: unknown) => void) =>
		window.electron.update.onAvailable(cb),
	onUpdateNotAvailable: (cb: (info: unknown) => void) =>
		window.electron.update.onNotAvailable(cb),
	onUpdateProgress: (
		cb: (progress: {
			percent: number;
			bytesPerSecond: number;
			transferred: number;
			total: number;
		}) => void,
	) => window.electron.update.onProgress(cb),
	onUpdateDownloaded: (cb: (info: unknown) => void) =>
		window.electron.update.onDownloaded(cb),
	onUpdateError: (cb: (error: string) => void) =>
		window.electron.update.onError(cb),
};
