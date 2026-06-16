import type {
	IPCResponse,
	WorkspaceConfig,
} from "../types/electron";

export const workspaceRuntimeService = {
	listConfigs: (): Promise<IPCResponse<WorkspaceConfig[]>> =>
		window.electron.workspaceRuntime.listConfigs(),

	getConfig: (
		id: string,
	): Promise<IPCResponse<WorkspaceConfig | null>> =>
		window.electron.workspaceRuntime.getConfig(id),

	saveConfig: (
		config: WorkspaceConfig,
	): Promise<IPCResponse<WorkspaceConfig>> =>
		window.electron.workspaceRuntime.saveConfig(config),

	deleteConfig: (id: string): Promise<IPCResponse<boolean>> =>
		window.electron.workspaceRuntime.deleteConfig(id),

	getCurrentId: (): Promise<IPCResponse<string>> =>
		window.electron.workspaceRuntime.getCurrentId(),

	setCurrentId: (id: string): Promise<IPCResponse<string>> =>
		window.electron.workspaceRuntime.setCurrentId(id),

	getDefaultId: (): Promise<IPCResponse<string>> =>
		window.electron.workspaceRuntime.getDefaultId(),

	setDefaultId: (id: string): Promise<IPCResponse<string>> =>
		window.electron.workspaceRuntime.setDefaultId(id),
};
