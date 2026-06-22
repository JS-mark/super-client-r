export interface ApiStatus {
	status: "running" | "stopped";
	port: number;
}

interface IPCResult<T = unknown> {
	success: boolean;
	data?: T;
	error?: string;
}

function unwrap<T>(result: IPCResult<T>): T {
	if (!result.success) throw new Error(result.error || "IPC call failed");
	return result.data as T;
}

const api = window.electron.ipc;

export const apiService = {
	getStatus: async (): Promise<ApiStatus> =>
		unwrap((await api.invoke("api:get-status")) as IPCResult<ApiStatus>),
	start: async (): Promise<ApiStatus> =>
		unwrap((await api.invoke("api:start")) as IPCResult<ApiStatus>),
	stop: async (): Promise<ApiStatus> =>
		unwrap((await api.invoke("api:stop")) as IPCResult<ApiStatus>),
	restart: async (port?: number): Promise<ApiStatus> =>
		unwrap((await api.invoke("api:restart", port)) as IPCResult<ApiStatus>),
	setPort: async (port: number): Promise<boolean> =>
		unwrap((await api.invoke("api:set-port", port)) as IPCResult<boolean>),
	getApiKey: async (): Promise<string> =>
		unwrap((await api.invoke("api:get-api-key")) as IPCResult<string>),
};
