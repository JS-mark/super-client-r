/// <reference types="vite/client" />

declare global {
	interface Window {
		electron: import("./src/types/electron").ElectronAPI;
	}
}

export {};
