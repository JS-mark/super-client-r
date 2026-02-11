/**
 * 主进程存储管理器
 * 使用 electron-store 持久化配置和数据
 */

import Store from "electron-store";

export type SearchProviderType =
	| "zhipu"
	| "tavily"
	| "searxng"
	| "exa"
	| "exa_mcp"
	| "bocha"
	| "sogou"
	| "google"
	| "bing"
	| "baidu";

export interface SearchConfig {
	id: string;
	provider: SearchProviderType;
	name: string;
	apiKey: string;
	apiUrl?: string;
	enabled: boolean;
	isDefault?: boolean;
	config?: Record<string, unknown>;
}

export interface AppConfig {
	apiKey?: string;
	model?: string;
	theme?: "light" | "dark" | "auto";
	language?: string;
	apiPort?: number;
	skillsmpApiKey?: string;
	floatWidgetEnabled?: boolean;
	searchConfigs?: SearchConfig[];
	defaultSearchProvider?: SearchProviderType;
	// Plugin related
	plugins?: unknown[];
	pluginsData?: Record<string, unknown>;
	// Keybindings
	keybindings?: Record<string, string>;
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

	// ============ 搜索配置相关 ============

	getSearchConfigs(): SearchConfig[] {
		return this.configStore.get("searchConfigs") || [];
	}

	saveSearchConfig(config: SearchConfig): void {
		const configs = this.getSearchConfigs();
		const existingIndex = configs.findIndex((c) => c.id === config.id);

		if (existingIndex >= 0) {
			configs[existingIndex] = config;
		} else {
			configs.push(config);
		}

		this.configStore.set("searchConfigs", configs);
	}

	deleteSearchConfig(id: string): void {
		const configs = this.getSearchConfigs().filter((c) => c.id !== id);
		this.configStore.set("searchConfigs", configs);
	}

	setDefaultSearchProvider(provider: SearchProviderType | null): void {
		if (provider === null) {
			this.configStore.delete("defaultSearchProvider" as keyof AppConfig);
		} else {
			this.configStore.set("defaultSearchProvider", provider);
		}

		// Update isDefault flag on configs
		const configs = this.getSearchConfigs();
		const updatedConfigs = configs.map((c) => ({
			...c,
			isDefault: c.provider === provider,
		}));
		this.configStore.set("searchConfigs", updatedConfigs);
	}

	getDefaultSearchProvider(): SearchProviderType | undefined {
		return this.configStore.get("defaultSearchProvider");
	}

	// ============ 清除所有数据 ============

	clearAll(): void {
		this.configStore.clear();
		this.dataStore.clear();
	}
}

// 单例实例
export const storeManager = new StoreManager();
