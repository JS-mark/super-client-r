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

interface IPCResult<T = unknown> {
	success: boolean;
	data?: T;
	error?: string;
}

function unwrap<T>(result: IPCResult<T>): T {
	if (!result.success) throw new Error(result.error || "IPC call failed");
	return result.data as T;
}

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
	error?: string;
}

export interface LogFileInfo {
	name: string;
	path: string;
	size: number;
	createdAt: string;
	modifiedAt: string;
}

const api = window.electron.ipc;

export const appService = {
	getInfo: async () =>
		unwrap<AppInfo>(await api.invoke(APP_CHANNELS.GET_INFO) as IPCResult<AppInfo>),
	getUserDataPath: async () =>
		unwrap<string>(await api.invoke(APP_CHANNELS.GET_USER_DATA_PATH) as IPCResult<string>),
	openPath: async (path: string) =>
		unwrap<boolean>(await api.invoke(APP_CHANNELS.OPEN_PATH, path) as IPCResult<boolean>),
	checkUpdate: () =>
		window.electron.update.check() as Promise<UpdateCheckResult>,
	quit: async () =>
		unwrap<void>(await api.invoke(APP_CHANNELS.QUIT) as IPCResult<void>),
	relaunch: async () =>
		unwrap<void>(await api.invoke(APP_CHANNELS.RELAUNCH) as IPCResult<void>),
	openDevTools: async () =>
		unwrap<void>(await api.invoke(APP_CHANNELS.OPEN_DEV_TOOLS) as IPCResult<void>),
	getLogs: async (filePath?: string, tail?: number) =>
		unwrap<string>(await api.invoke(APP_CHANNELS.GET_LOGS, filePath, tail) as IPCResult<string>),
	getLogsPath: async () =>
		unwrap<string>(await api.invoke(APP_CHANNELS.GET_LOGS_PATH) as IPCResult<string>),
	listLogFiles: async () =>
		unwrap<LogFileInfo[]>(await api.invoke(APP_CHANNELS.LIST_LOG_FILES) as IPCResult<LogFileInfo[]>),
	clearLogs: async () =>
		unwrap<boolean>(await api.invoke(APP_CHANNELS.CLEAR_LOGS) as IPCResult<boolean>),
	openExternal: async (url: string) =>
		unwrap<boolean>(await api.invoke(APP_CHANNELS.OPEN_EXTERNAL, url) as IPCResult<boolean>),
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
