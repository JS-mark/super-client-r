const API_CHANNELS = {
	GET_STATUS: "api:get-status",
	START: "api:start",
	STOP: "api:stop",
	RESTART: "api:restart",
	SET_PORT: "api:set-port",
	GET_API_KEY: "api:get-api-key",
};

export interface ApiStatus {
	status: "running" | "stopped";
	port: number;
}

export const apiService = {
	getStatus: () =>
		window.electron.ipc.invoke(API_CHANNELS.GET_STATUS) as Promise<ApiStatus>,
	start: () =>
		window.electron.ipc.invoke(API_CHANNELS.START) as Promise<ApiStatus>,
	stop: () =>
		window.electron.ipc.invoke(API_CHANNELS.STOP) as Promise<ApiStatus>,
	restart: (port?: number) =>
		window.electron.ipc.invoke(
			API_CHANNELS.RESTART,
			port,
		) as Promise<ApiStatus>,
	setPort: (port: number) =>
		window.electron.ipc.invoke(API_CHANNELS.SET_PORT, port) as Promise<boolean>,
	getApiKey: () =>
		window.electron.ipc.invoke(API_CHANNELS.GET_API_KEY) as Promise<string>,
};
