/**
 * 主进程存储管理器
 * 使用 electron-store 持久化配置和数据
 */

import Store from "electron-store";

export interface AppConfig {
	apiKey?: string;
	model?: string;
	theme?: "light" | "dark" | "auto";
	language?: string;
	apiPort?: number;
	skillsmpApiKey?: string;
	floatWidgetEnabled?: boolean;
}

export interface AppData {
	sessions: string[];
	lastSessionId?: string;
}

export class StoreManager {
	private _configStore: Store<AppConfig> | null = null;
	private _dataStore: Store<AppData> | null = null;

	private get configStore(): Store<AppConfig> {
		if (!this._configStore) {
			const StoreClass = (Store as any).default || Store;
			this._configStore = new StoreClass({
				name: "config",
				defaults: {
					theme: "auto",
					language: "en",
					floatWidgetEnabled: false,
				},
			}) as Store<AppConfig>;
		}
		return this._configStore;
	}

	private get dataStore(): Store<AppData> {
		if (!this._dataStore) {
			const StoreClass = (Store as any).default || Store;
			this._dataStore = new StoreClass({
				name: "data",
				defaults: {
					sessions: [],
				},
			}) as Store<AppData>;
		}
		return this._dataStore;
	}

	// ============ 配置相关 ============

	getConfig<K extends keyof AppConfig>(key: K): AppConfig[K] | undefined {
		return this.configStore.get(key);
	}

	setConfig<K extends keyof AppConfig>(key: K, value: AppConfig[K]): void {
		this.configStore.set(key, value);
	}

	getAllConfig(): AppConfig {
		return this.configStore.store;
	}

	// ============ 数据相关 ============

	getData<K extends keyof AppData>(key: K): AppData[K] | undefined {
		return this.dataStore.get(key);
	}

	setData<K extends keyof AppData>(key: K, value: AppData[K]): void {
		this.dataStore.set(key, value);
	}

	getAllData(): AppData {
		return this.dataStore.store;
	}

	// ============ 会话管理 ============

	addSession(sessionId: string): void {
		const sessions = this.getData("sessions") || [];
		if (!sessions.includes(sessionId)) {
			this.setData("sessions", [...sessions, sessionId]);
		}
	}

	removeSession(sessionId: string): void {
		const sessions = this.getData("sessions") || [];
		this.setData(
			"sessions",
			sessions.filter((id) => id !== sessionId),
		);
	}

	setLastSession(sessionId: string): void {
		this.setData("lastSessionId", sessionId);
	}

	getLastSession(): string | undefined {
		return this.getData("lastSessionId");
	}

	// ============ 清除所有数据 ============

	clearAll(): void {
		this.configStore.clear();
		this.dataStore.clear();
	}
}

// 单例实例
export const storeManager = new StoreManager();
