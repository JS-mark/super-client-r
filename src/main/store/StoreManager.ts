/**
 * 主进程存储管理器
 * 使用 electron-store 持久化配置和数据
 */

import Store from "electron-store";
import type {
	ActiveModelSelection,
	McpServerConfig,
	ModelProvider,
	ProviderModel,
	WebhookConfig,
	IMBotConfig,
	RemoteDevice,
	RelayConfig,
} from "../ipc/types";
import type { RemoteControlEvent } from "../services/remote/types";
import { ensureModelDefaults } from "../services/llm/modelNormalizer";

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
	// Model providers
	modelProviders?: ModelProvider[];
	activeModelSelection?: ActiveModelSelection;
	// MCP servers
	mcpServers?: McpServerConfig[];
	// Plugin related
	plugins?: unknown[];
	pluginsData?: Record<string, unknown>;
	// Keybindings
	keybindings?: Record<string, string>;
	// Active skin (pluginId + themeId)
	activeSkin?: { pluginId: string; themeId: string };
	// Active markdown theme (pluginId + themeId)
	activeMarkdownTheme?: { pluginId: string; themeId: string };
	// Plugin permissions
	pluginPermissions?: Record<string, string[]>;
	// Silicon Flow API
	siliconFlowApiKey?: string;
	// OAuth credentials (client_id only, secret stored on server)
	googleClientId?: string;
	githubClientId?: string;
	// Auth user data
	authUser?: {
		id: string;
		name: string;
		email?: string;
		avatar?: string;
		provider: "google" | "github";
	};
	authTokens?: {
		accessToken: string;
		refreshToken?: string;
		expiresAt?: number;
	};
	// Webhook
	webhookConfigs?: WebhookConfig[];
	// IM Bot
	imbotConfigs?: IMBotConfig[];
	// Remote Device
	remoteDevices?: RemoteDevice[];
	// Relay 配置
	relayConfig?: RelayConfig;
	// App Config 缓存
	appInitConfigCache?: {
		config: any;
		cachedAt: number;
		version: string;
	};
}

export interface AppData {
	sessions: string[];
	lastSessionId?: string;
	remoteControlEvents?: RemoteControlEvent[];
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

	deleteConfig<K extends keyof AppConfig>(key: K): void {
		this.configStore.delete(key);
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

	// ============ MCP 服务器持久化 ============

	getMcpServers(): McpServerConfig[] {
		return this.configStore.get("mcpServers") || [];
	}

	saveMcpServer(config: McpServerConfig): void {
		const servers = this.getMcpServers();
		const existingIndex = servers.findIndex((s) => s.id === config.id);

		if (existingIndex >= 0) {
			servers[existingIndex] = config;
		} else {
			servers.push(config);
		}

		this.configStore.set("mcpServers", servers);
	}

	deleteMcpServer(id: string): void {
		const servers = this.getMcpServers().filter((s) => s.id !== id);
		this.configStore.set("mcpServers", servers);
	}

	// ============ Model Provider 相关 ============

	getModelProviders(): ModelProvider[] {
		const raw = this.configStore.get("modelProviders") || [];
		// Migrate old data: ensure all models have new required fields
		return raw.map((provider: ModelProvider) => ({
			...provider,
			models: provider.models.map((m) =>
				ensureModelDefaults(m as unknown as Record<string, unknown>),
			),
		}));
	}

	getModelProvider(id: string): ModelProvider | undefined {
		return this.getModelProviders().find((p) => p.id === id);
	}

	saveModelProvider(provider: ModelProvider): void {
		const providers = this.getModelProviders();
		const existingIndex = providers.findIndex((p) => p.id === provider.id);

		if (existingIndex >= 0) {
			providers[existingIndex] = provider;
		} else {
			providers.push(provider);
		}

		this.configStore.set("modelProviders", providers);
	}

	deleteModelProvider(id: string): void {
		const providers = this.getModelProviders().filter((p) => p.id !== id);
		this.configStore.set("modelProviders", providers);

		// Clear active selection if it references the deleted provider
		const active = this.getActiveModelSelection();
		if (active?.providerId === id) {
			this.configStore.delete("activeModelSelection" as keyof AppConfig);
		}
	}

	getActiveModelSelection(): ActiveModelSelection | undefined {
		return this.configStore.get("activeModelSelection");
	}

	updateModelConfig(
		providerId: string,
		modelId: string,
		config: Partial<Omit<ProviderModel, "id">>,
	): void {
		const providers = this.getModelProviders();
		const providerIndex = providers.findIndex((p) => p.id === providerId);
		if (providerIndex < 0) {
			throw new Error(`Provider not found: ${providerId}`);
		}
		const provider = providers[providerIndex];
		const modelIndex = provider.models.findIndex((m) => m.id === modelId);
		if (modelIndex < 0) {
			throw new Error(`Model not found: ${modelId}`);
		}
		provider.models[modelIndex] = {
			...provider.models[modelIndex],
			...config,
		};
		provider.updatedAt = Date.now();
		providers[providerIndex] = provider;
		this.configStore.set("modelProviders", providers);
	}

	setActiveModelSelection(selection: ActiveModelSelection | null): void {
		if (selection === null) {
			this.configStore.delete("activeModelSelection" as keyof AppConfig);
		} else {
			this.configStore.set("activeModelSelection", selection);
		}
	}

	// ============ Webhook 配置相关 ============

	getWebhookConfigs(): WebhookConfig[] {
		return this.configStore.get("webhookConfigs") || [];
	}

	saveWebhookConfig(config: WebhookConfig): void {
		const configs = this.getWebhookConfigs();
		const existingIndex = configs.findIndex((c) => c.id === config.id);

		if (existingIndex >= 0) {
			configs[existingIndex] = config;
		} else {
			configs.push(config);
		}

		this.configStore.set("webhookConfigs", configs);
	}

	deleteWebhookConfig(id: string): void {
		const configs = this.getWebhookConfigs().filter((c) => c.id !== id);
		this.configStore.set("webhookConfigs", configs);
	}

	// ============ IM Bot 配置相关 ============

	getIMBotConfigs(): IMBotConfig[] {
		return this.configStore.get("imbotConfigs") || [];
	}

	saveIMBotConfig(config: IMBotConfig): void {
		const configs = this.getIMBotConfigs();
		const existingIndex = configs.findIndex((c) => c.id === config.id);

		if (existingIndex >= 0) {
			configs[existingIndex] = config;
		} else {
			configs.push(config);
		}

		this.configStore.set("imbotConfigs", configs);
	}

	deleteIMBotConfig(id: string): void {
		const configs = this.getIMBotConfigs().filter((c) => c.id !== id);
		this.configStore.set("imbotConfigs", configs);
	}

	// ============ Remote Device 配置相关 ============

	getRemoteDevices(): RemoteDevice[] {
		return this.configStore.get("remoteDevices") || [];
	}

	saveRemoteDevice(device: RemoteDevice): void {
		const devices = this.getRemoteDevices();
		const existingIndex = devices.findIndex((d) => d.id === device.id);

		if (existingIndex >= 0) {
			devices[existingIndex] = device;
		} else {
			devices.push(device);
		}

		this.configStore.set("remoteDevices", devices);
	}

	deleteRemoteDevice(id: string): void {
		const devices = this.getRemoteDevices().filter((d) => d.id !== id);
		this.configStore.set("remoteDevices", devices);
	}

	// ============ Relay 配置相关 ============

	getRelayConfig(): RelayConfig | undefined {
		return this.configStore.get("relayConfig");
	}

	setRelayConfig(config: RelayConfig): void {
		this.configStore.set("relayConfig", config);
	}

	// ============ Remote Control Events 相关 ============

	private static MAX_EVENTS = 500;

	getRemoteControlEvents(): RemoteControlEvent[] {
		return this.dataStore.get("remoteControlEvents") || [];
	}

	appendRemoteControlEvent(event: RemoteControlEvent): void {
		const events = this.getRemoteControlEvents();
		events.push(event);
		// 保持上限
		if (events.length > StoreManager.MAX_EVENTS) {
			events.splice(0, events.length - StoreManager.MAX_EVENTS);
		}
		this.dataStore.set("remoteControlEvents", events);
	}

	clearRemoteControlEvents(): void {
		this.dataStore.set("remoteControlEvents", []);
	}

	// ============ 清除所有数据 ============

	clearAll(): void {
		this.configStore.clear();
		this.dataStore.clear();
	}
}

// 单例实例
export const storeManager = new StoreManager();
