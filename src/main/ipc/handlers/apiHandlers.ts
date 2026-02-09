import { ipcMain } from "electron";
import { localServer } from "../../server";
import { storeManager } from "../../store";
import { API_CHANNELS } from "../channels";

const PORT_MIN = 1024;
const PORT_MAX = 65535;

function validatePort(port: number): { valid: boolean; error?: string } {
	if (isNaN(port)) {
		return { valid: false, error: "Port must be a number" };
	}
	if (!Number.isInteger(port)) {
		return { valid: false, error: "Port must be an integer" };
	}
	if (port < PORT_MIN || port > PORT_MAX) {
		return { valid: false, error: `Port must be between ${PORT_MIN} and ${PORT_MAX}` };
	}
	return { valid: true };
}

export function registerApiHandlers() {
	ipcMain.handle(API_CHANNELS.GET_STATUS, () => {
		return localServer.getStatus();
	});

	ipcMain.handle(API_CHANNELS.START, async () => {
		const status = localServer.getStatus();
		if (status.status === "running") {
			throw new Error("Server is already running");
		}
		await localServer.start();
		return localServer.getStatus();
	});

	ipcMain.handle(API_CHANNELS.STOP, async () => {
		const status = localServer.getStatus();
		if (status.status === "stopped") {
			throw new Error("Server is already stopped");
		}
		await localServer.stop();
		return localServer.getStatus();
	});

	ipcMain.handle(API_CHANNELS.RESTART, async (_, port?: number) => {
		if (port !== undefined) {
			const validation = validatePort(port);
			if (!validation.valid) {
				throw new Error(validation.error);
			}
			storeManager.setConfig("apiPort", port);
		}
		await localServer.restart(port);
		return localServer.getStatus();
	});

	ipcMain.handle(API_CHANNELS.SET_PORT, async (_, port: number) => {
		const validation = validatePort(port);
		if (!validation.valid) {
			throw new Error(validation.error);
		}
		storeManager.setConfig("apiPort", port);
		return true;
	});
}
