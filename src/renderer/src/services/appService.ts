const APP_CHANNELS = {
  GET_INFO: 'app:get-info',
  GET_USER_DATA_PATH: 'app:get-user-data-path',
  OPEN_PATH: 'app:open-path',
  CHECK_UPDATE: 'app:check-update',
  QUIT: 'app:quit',
  RELAUNCH: 'app:relaunch',
  OPEN_DEV_TOOLS: 'app:open-dev-tools',
  GET_LOGS: 'app:get-logs',
  GET_LOGS_PATH: 'app:get-logs-path',
  LIST_LOG_FILES: 'app:list-log-files',
  CLEAR_LOGS: 'app:clear-logs',
}

export interface AppInfo {
  name: string
  version: string
  electron: string
  node: string
  platform: string
  arch: string
}

export interface UpdateCheckResult {
  updateAvailable: boolean
  message: string
}

export interface LogFileInfo {
  name: string
  path: string
  size: number
  createdAt: string
  modifiedAt: string
}

export const appService = {
  getInfo: () => window.electron.ipc.invoke(APP_CHANNELS.GET_INFO) as Promise<AppInfo>,
  getUserDataPath: () => window.electron.ipc.invoke(APP_CHANNELS.GET_USER_DATA_PATH) as Promise<string>,
  openPath: (path: string) => window.electron.ipc.invoke(APP_CHANNELS.OPEN_PATH, path) as Promise<boolean>,
  checkUpdate: () => window.electron.ipc.invoke(APP_CHANNELS.CHECK_UPDATE) as Promise<UpdateCheckResult>,
  quit: () => window.electron.ipc.invoke(APP_CHANNELS.QUIT) as Promise<void>,
  relaunch: () => window.electron.ipc.invoke(APP_CHANNELS.RELAUNCH) as Promise<void>,
  openDevTools: () => window.electron.ipc.invoke(APP_CHANNELS.OPEN_DEV_TOOLS) as Promise<void>,
  getLogs: (filePath?: string, tail?: number) => window.electron.ipc.invoke(APP_CHANNELS.GET_LOGS, filePath, tail) as Promise<string>,
  getLogsPath: () => window.electron.ipc.invoke(APP_CHANNELS.GET_LOGS_PATH) as Promise<string>,
  listLogFiles: () => window.electron.ipc.invoke(APP_CHANNELS.LIST_LOG_FILES) as Promise<LogFileInfo[]>,
  clearLogs: () => window.electron.ipc.invoke(APP_CHANNELS.CLEAR_LOGS) as Promise<boolean>,
}
