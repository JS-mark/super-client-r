/**
 * 主进程存储管理器
 * 使用 electron-store 持久化配置和数据
 */

import Store from "electron-store";
import type {
	ActiveModelSelection,
	AgentSDKConfig,
	AgentProfile,
	AgentTeam,
	McpServerConfig,
	ModelProvider,
	ProxyConfig,
	ProviderModel,
	WebhookConfig,
	IMBotConfig,
	RemoteDevice,
	RelayConfig,
	WorkspaceConfig,
} from "../ipc/types";
import type { RemoteControlEvent } from "../services/remote/types";
import { ensureModelDefaults } from "../services/llm/modelNormalizer";
import { encryptedKeyStore } from "./encryptedKeyStore";

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

const DEFAULT_WORKSPACE_ID = "default";

function createDefaultWorkspaceConfig(): WorkspaceConfig {
	const now = Date.now();
	return {
		id: DEFAULT_WORKSPACE_ID,
		name: "默认工作区",
		interactionProfile: "hybrid",
		runtimePolicy: {
			approvalMode: "request",
			sandboxMode: "workspace-write",
			writableRoots: [],
			networkAccess: "approval-required",
			externalAppAccess: "approval-required",
		},
		enabledCapabilities: [],
		contextPolicy: {
			defaultAttachmentMode: "ask-before-read",
			includeWorkspaceKnowledge: false,
		},
		createdAt: now,
		updatedAt: now,
	};
}

function requireWorkspaceConfig(config: WorkspaceConfig): void {
	if (!config || typeof config !== "object") {
		throw new Error("Workspace config must be an object");
	}
	if (!config.id || typeof config.id !== "string") {
		throw new Error("Workspace config id is required");
	}
	if (!config.name || typeof config.name !== "string") {
		throw new Error("Workspace config name is required");
	}
}

function isOneOf<T extends string>(
	value: unknown,
	values: readonly T[],
): value is T {
	return typeof value === "string" && values.includes(value as T);
}

function normalizeWorkspaceConfig(config: WorkspaceConfig): WorkspaceConfig {
	requireWorkspaceConfig(config);

	if (config.runtimePolicy?.sandboxMode === "system-access") {
		throw new Error("System access requires an explicit approval flow");
	}
	if (config.runtimePolicy?.networkAccess === "allowed") {
		throw new Error(
			"Always-allowed network access requires an explicit approval flow",
		);
	}
	if (config.runtimePolicy?.externalAppAccess === "allowed") {
		throw new Error(
			"Always-allowed external app access requires an explicit approval flow",
		);
	}

	const defaults = createDefaultWorkspaceConfig();
	return {
		...config,
		// R-1: 显式收编 icon/order，避免被 spread 接受任意类型。
		icon: typeof config.icon === "string" ? config.icon : undefined,
		order: typeof config.order === "number" ? config.order : undefined,
		interactionProfile: isOneOf(config.interactionProfile, [
			"claude-code",
			"codex",
			"hybrid",
		])
			? config.interactionProfile
			: defaults.interactionProfile,
		runtimePolicy: {
			approvalMode: isOneOf(config.runtimePolicy?.approvalMode, [
				"request",
				"auto-safe",
				"full-access",
			])
				? config.runtimePolicy.approvalMode
				: defaults.runtimePolicy.approvalMode,
			sandboxMode:
				config.runtimePolicy?.sandboxMode === "read-only" ||
				config.runtimePolicy?.sandboxMode === "workspace-write"
					? config.runtimePolicy.sandboxMode
					: defaults.runtimePolicy.sandboxMode,
			writableRoots: Array.isArray(config.runtimePolicy?.writableRoots)
				? config.runtimePolicy.writableRoots.filter(
						(root) => typeof root === "string",
					)
				: defaults.runtimePolicy.writableRoots,
			networkAccess:
				config.runtimePolicy?.networkAccess === "blocked" ||
				config.runtimePolicy?.networkAccess === "approval-required"
					? config.runtimePolicy.networkAccess
					: defaults.runtimePolicy.networkAccess,
			externalAppAccess:
				config.runtimePolicy?.externalAppAccess === "blocked" ||
				config.runtimePolicy?.externalAppAccess === "approval-required"
					? config.runtimePolicy.externalAppAccess
					: defaults.runtimePolicy.externalAppAccess,
		},
		enabledCapabilities: Array.isArray(config.enabledCapabilities)
			? config.enabledCapabilities
			: [],
		contextPolicy: {
			defaultAttachmentMode: isOneOf(
				config.contextPolicy?.defaultAttachmentMode,
				["include-content", "reference-only", "ask-before-read", "ignore"],
			)
				? config.contextPolicy.defaultAttachmentMode
				: defaults.contextPolicy.defaultAttachmentMode,
			includeWorkspaceKnowledge:
				typeof config.contextPolicy?.includeWorkspaceKnowledge === "boolean"
					? config.contextPolicy.includeWorkspaceKnowledge
					: defaults.contextPolicy.includeWorkspaceKnowledge,
			maxAttachmentBytes:
				typeof config.contextPolicy?.maxAttachmentBytes === "number"
					? config.contextPolicy.maxAttachmentBytes
					: undefined,
			ignoreRules: Array.isArray(config.contextPolicy?.ignoreRules)
				? config.contextPolicy.ignoreRules.filter(
						(rule) => typeof rule === "string",
					)
				: undefined,
		},
	};
}

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
		provider: "google" | "github" | "email";
	};
	authTokens?: {
		accessToken?: string;
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
	// Agent SDK 配置
	agentSDKConfig?: AgentSDKConfig;
	// Multi-Agent 角色和团队
	agentProfiles?: AgentProfile[];
	agentTeams?: AgentTeam[];
	builtinAgentVersion?: number;
	// Network proxy
	proxyConfig?: ProxyConfig;
	requestLogEnabled?: boolean;
	// Workspace runtime configs
	workspaceConfigs?: WorkspaceConfig[];
	currentWorkspaceId?: string;
	defaultWorkspaceId?: string;
	workspaceBackfillDone?: boolean;
	// App Config 缓存
	appInitConfigCache?: {
		config: any;
		cachedAt: number;
		version: string;
	};
	// project-session-redesign A-7 (S7) — §9.5 picker sticky 默认值。
	newConversationDefaults?: {
		lastKind: "casual" | "project";
		lastProjectId?: string;
	};
	// project-session-redesign B-4 — runMigration 幂等 flag
	migrationV2Done?: boolean;
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
				// projectName is a fallback for environments where Electron's
				// `app.name` is unavailable (vitest unit tests). Electron itself
				// prefers `app.name` from the running app, so this doesn't affect
				// production behaviour.
				projectName: "super-client-r",
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
				projectName: "super-client-r",
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

	private ensureWorkspaceConfigs(): WorkspaceConfig[] {
		const configs = this.configStore.get("workspaceConfigs") || [];
		if (configs.length > 0) {
			return configs;
		}

		const defaultConfig = createDefaultWorkspaceConfig();
		this.configStore.set("workspaceConfigs", [defaultConfig]);
		this.configStore.set("defaultWorkspaceId", defaultConfig.id);
		this.configStore.set("currentWorkspaceId", defaultConfig.id);
		return [defaultConfig];
	}

	getWorkspaceConfigs(): WorkspaceConfig[] {
		return this.ensureWorkspaceConfigs();
	}

	getWorkspaceConfig(id: string): WorkspaceConfig | undefined {
		return this.ensureWorkspaceConfigs().find((config) => config.id === id);
	}

	saveWorkspaceConfig(config: WorkspaceConfig): WorkspaceConfig {
		const now = Date.now();
		const normalizedConfig = normalizeWorkspaceConfig(config);
		const configs = this.ensureWorkspaceConfigs();
		const existingIndex = configs.findIndex(
			(item) => item.id === normalizedConfig.id,
		);
		const existing = existingIndex >= 0 ? configs[existingIndex] : undefined;
		const nextConfig: WorkspaceConfig = {
			...normalizedConfig,
			createdAt: existing?.createdAt || normalizedConfig.createdAt || now,
			updatedAt: now,
		};
		const nextConfigs =
			existingIndex >= 0
				? configs.map((item) => (item.id === nextConfig.id ? nextConfig : item))
				: [...configs, nextConfig];

		this.configStore.set("workspaceConfigs", nextConfigs);
		if (!this.configStore.get("defaultWorkspaceId")) {
			this.configStore.set("defaultWorkspaceId", nextConfig.id);
		}
		if (!this.configStore.get("currentWorkspaceId")) {
			this.configStore.set("currentWorkspaceId", nextConfig.id);
		}
		return nextConfig;
	}

	/**
	 * One-time backfill of renderer-persisted Workspace[] into main-process
	 * WorkspaceConfig[]. Idempotent: only runs when this main process has
	 * never received a backfill AND the only workspace currently stored is
	 * the auto-created default placeholder. After backfill, the renderer
	 * store transitions to a read-through cache.
	 *
	 * Renderer's `defaultModel: string` cannot be safely mapped to
	 * `ModelSelection { providerId, modelId }` without a split rule, so it
	 * is dropped on backfill — users will reset model defaults in the new
	 * workspace settings UI.
	 */
	backfillWorkspaceConfigsFromRenderer(
		payload: Array<{
			id: string;
			name: string;
			createdAt?: number;
			updatedAt?: number;
			icon?: string;
			order?: number;
		}>,
	): { applied: boolean; reason?: string } {
		if (this.configStore.get("workspaceBackfillDone")) {
			return { applied: false, reason: "already-done" };
		}

		const existing = this.configStore.get("workspaceConfigs") || [];
		const isFreshDefault =
			existing.length === 0 ||
			(existing.length === 1 &&
				existing[0].id === DEFAULT_WORKSPACE_ID &&
				existing[0].createdAt === existing[0].updatedAt);
		if (!isFreshDefault) {
			this.configStore.set("workspaceBackfillDone", true);
			return { applied: false, reason: "user-data-present" };
		}

		const cleaned = payload.filter((w) => w?.id && w?.name);
		if (cleaned.length === 0) {
			this.configStore.set("workspaceBackfillDone", true);
			return { applied: false, reason: "empty-payload" };
		}

		const now = Date.now();
		const defaults = createDefaultWorkspaceConfig();
		const configs: WorkspaceConfig[] = cleaned.map((w) => ({
			...defaults,
			id: w.id,
			name: w.name,
			icon: typeof w.icon === "string" ? w.icon : undefined,
			order: typeof w.order === "number" ? w.order : undefined,
			createdAt: w.createdAt || now,
			updatedAt: w.updatedAt || now,
		}));

		// Ensure a default workspace always exists; if the renderer payload
		// did not include one with id "default", keep the placeholder.
		if (!configs.some((c) => c.id === DEFAULT_WORKSPACE_ID)) {
			configs.unshift(defaults);
		}

		this.configStore.set("workspaceConfigs", configs);
		if (!this.configStore.get("defaultWorkspaceId")) {
			this.configStore.set("defaultWorkspaceId", configs[0].id);
		}
		if (!this.configStore.get("currentWorkspaceId")) {
			this.configStore.set("currentWorkspaceId", configs[0].id);
		}
		this.configStore.set("workspaceBackfillDone", true);
		return { applied: true };
	}

	deleteWorkspaceConfig(id: string): boolean {
		if (id === this.getDefaultWorkspaceId()) {
			return false;
		}

		const configs = this.ensureWorkspaceConfigs();
		const nextConfigs = configs.filter((config) => config.id !== id);
		if (nextConfigs.length === configs.length) {
			return false;
		}

		this.configStore.set("workspaceConfigs", nextConfigs);
		if (this.getCurrentWorkspaceId() === id) {
			this.configStore.set("currentWorkspaceId", this.getDefaultWorkspaceId());
		}
		return true;
	}

	getCurrentWorkspaceId(): string {
		const currentId = this.configStore.get("currentWorkspaceId");
		if (currentId && this.getWorkspaceConfig(currentId)) {
			return currentId;
		}
		const defaultId = this.getDefaultWorkspaceId();
		this.configStore.set("currentWorkspaceId", defaultId);
		return defaultId;
	}

	setCurrentWorkspaceId(id: string): string {
		if (!this.getWorkspaceConfig(id)) {
			throw new Error(`Workspace config not found: ${id}`);
		}
		this.configStore.set("currentWorkspaceId", id);
		return id;
	}

	getDefaultWorkspaceId(): string {
		const defaultId = this.configStore.get("defaultWorkspaceId");
		if (defaultId && this.getWorkspaceConfig(defaultId)) {
			return defaultId;
		}
		const fallback =
			this.ensureWorkspaceConfigs()[0]?.id || DEFAULT_WORKSPACE_ID;
		this.configStore.set("defaultWorkspaceId", fallback);
		return fallback;
	}

	setDefaultWorkspaceId(id: string): string {
		if (!this.getWorkspaceConfig(id)) {
			throw new Error(`Workspace config not found: ${id}`);
		}
		this.configStore.set("defaultWorkspaceId", id);
		return id;
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

	// E1 密钥安全改造：搜索配置的 apiKey 同样加密分表存储，getSearchConfigs
	// 对外一律脱敏；主进程内部按 configId 用 getSearchConfigApiKey 解密取用。

	private searchKeyRef(id: string): string {
		return `searchConfig:${id}`;
	}

	private getRawSearchConfigs(): SearchConfig[] {
		return this.configStore.get("searchConfigs") || [];
	}

	/** 对外返回的搜索配置——apiKey 一律脱敏为空串（密钥不出主进程）。 */
	getSearchConfigs(): SearchConfig[] {
		return this.getRawSearchConfigs().map((c) => ({ ...c, apiKey: "" }));
	}

	/** 主进程内部按 configId 解密取用搜索密钥；回退历史明文字段。 */
	getSearchConfigApiKey(id: string): string {
		const fromStore = encryptedKeyStore.getKey(this.searchKeyRef(id));
		if (fromStore) return fromStore;
		const legacy = this.getRawSearchConfigs().find((c) => c.id === id);
		return legacy?.apiKey ?? "";
	}

	saveSearchConfig(config: SearchConfig): void {
		const configs = this.getRawSearchConfigs();
		const existingIndex = configs.findIndex((c) => c.id === config.id);

		// 空 apiKey 视为"不修改密钥"。
		if (config.apiKey) {
			encryptedKeyStore.setKey(this.searchKeyRef(config.id), config.apiKey);
		}
		const sanitized: SearchConfig = { ...config, apiKey: "" };
		if (existingIndex >= 0) {
			configs[existingIndex] = sanitized;
		} else {
			configs.push(sanitized);
		}
		this.configStore.set(
			"searchConfigs",
			configs.map((c) => ({ ...c, apiKey: "" })),
		);
	}

	deleteSearchConfig(id: string): void {
		const configs = this.getRawSearchConfigs().filter((c) => c.id !== id);
		this.configStore.set(
			"searchConfigs",
			configs.map((c) => ({ ...c, apiKey: "" })),
		);
		encryptedKeyStore.deleteKey(this.searchKeyRef(id));
	}

	/**
	 * 明文 → 加密一次性迁移搜索配置密钥；清除 config 里的明文。幂等。
	 * 加密不可用时不迁移。返回迁移条数。
	 */
	migrateSearchConfigKeys(): { migrated: number; available: boolean } {
		if (!encryptedKeyStore.isAvailable()) {
			return { migrated: 0, available: false };
		}
		const raw = this.getRawSearchConfigs();
		let migrated = 0;
		let dirty = false;
		for (const c of raw) {
			if (c.apiKey) {
				if (!encryptedKeyStore.hasKey(this.searchKeyRef(c.id))) {
					encryptedKeyStore.setKey(this.searchKeyRef(c.id), c.apiKey);
					migrated++;
				}
				dirty = true;
			}
		}
		if (dirty) {
			this.configStore.set(
				"searchConfigs",
				raw.map((c) => ({ ...c, apiKey: "" })),
			);
		}
		return { migrated, available: true };
	}

	setDefaultSearchProvider(provider: SearchProviderType | null): void {
		if (provider === null) {
			this.configStore.delete("defaultSearchProvider" as keyof AppConfig);
		} else {
			this.configStore.set("defaultSearchProvider", provider);
		}

		// Update isDefault flag on configs（保持 apiKey 脱敏，密钥只在 keystore）
		const configs = this.getRawSearchConfigs();
		const updatedConfigs = configs.map((c) => ({
			...c,
			apiKey: "",
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
	//
	// E1 密钥安全改造：provider 的 apiKey **不再明文写入 config store**。
	// 密钥经 safeStorage 加密后由 EncryptedKeyStore 分表落盘，主 config 里
	// `apiKey` 字段仅作占位（对渲染端一律返回空串——密钥不出主进程）。
	// 主进程内部按 providerId 用 `getModelProviderApiKey()` 解密取用。

	/**
	 * 从原始 config 记录里读出 provider 数组（含历史明文 apiKey），仅供内部
	 * 迁移/解密逻辑使用，不直接对外暴露。
	 */
	private getRawModelProviders(): ModelProvider[] {
		const raw = this.configStore.get("modelProviders") || [];
		return raw.map((provider: ModelProvider) => ({
			...provider,
			models: provider.models.map((m) =>
				ensureModelDefaults(m as unknown as Record<string, unknown>),
			),
		}));
	}

	/**
	 * 返回给渲染端 / IPC 层的 provider 列表——apiKey 一律脱敏为空串，
	 * 密钥永不离开主进程。
	 */
	getModelProviders(): ModelProvider[] {
		return this.getRawModelProviders().map((provider) => ({
			...provider,
			apiKey: "",
		}));
	}

	getModelProvider(id: string): ModelProvider | undefined {
		return this.getModelProviders().find((p) => p.id === id);
	}

	/**
	 * 主进程内部按 providerId 解密取用真实 apiKey。渲染端拿不到此方法。
	 * 优先从加密 keystore 读；找不到再回退到历史明文字段（迁移前的旧数据）。
	 */
	getModelProviderApiKey(id: string): string {
		const fromStore = encryptedKeyStore.getKey(this.providerKeyRef(id));
		if (fromStore) return fromStore;
		const legacy = this.getRawModelProviders().find((p) => p.id === id);
		return legacy?.apiKey ?? "";
	}

	private providerKeyRef(id: string): string {
		return `modelProvider:${id}`;
	}

	/**
	 * 保存 provider。返回加密可用性，供上层（渲染端）在密钥无法加密落盘时
	 * 向用户提示「仅内存不落盘」降级。空 apiKey 视为"不修改密钥"。
	 */
	saveModelProvider(provider: ModelProvider): {
		encryptionAvailable: boolean;
		keyPersisted: boolean;
	} {
		const providers = this.getRawModelProviders();
		const existingIndex = providers.findIndex((p) => p.id === provider.id);

		// 空 apiKey 视为"不修改密钥"：沿用已存的密钥（渲染端保存时通常不回传
		// 明文，只有用户明确输入了新 key 才更新）。
		const incomingKey = provider.apiKey ?? "";
		if (incomingKey) {
			encryptedKeyStore.setKey(this.providerKeyRef(provider.id), incomingKey);
		}

		// 无论如何，写入 config 的记录都不含明文 apiKey。
		const sanitized: ModelProvider = { ...provider, apiKey: "" };
		if (existingIndex >= 0) {
			providers[existingIndex] = sanitized;
		} else {
			providers.push(sanitized);
		}
		// 保底：清除任何历史残留的明文字段。
		this.configStore.set(
			"modelProviders",
			providers.map((p) => ({ ...p, apiKey: "" })),
		);

		const encryptionAvailable = encryptedKeyStore.isAvailable();
		return {
			encryptionAvailable,
			// 只有实际写了新密钥且加密可用时才算"已加密落盘"。
			keyPersisted: incomingKey ? encryptionAvailable : true,
		};
	}

	deleteModelProvider(id: string): void {
		const providers = this.getRawModelProviders().filter((p) => p.id !== id);
		this.configStore.set(
			"modelProviders",
			providers.map((p) => ({ ...p, apiKey: "" })),
		);
		encryptedKeyStore.deleteKey(this.providerKeyRef(id));

		// Clear active selection if it references the deleted provider
		const active = this.getActiveModelSelection();
		if (active?.providerId === id) {
			this.configStore.delete("activeModelSelection" as keyof AppConfig);
		}
	}

	/**
	 * 明文 → 加密一次性迁移：把 config store 里历史明文 apiKey 读出、加密写入
	 * keystore，并把 config 里的明文字段清空。幂等——重复调用无副作用。
	 *
	 * 加密不可用时（safeStorage 不可用）不迁移、不清明文（否则会丢失用户密钥），
	 * 返回 available=false 供上层提示。
	 */
	migrateModelProviderKeys(): {
		migrated: number;
		available: boolean;
	} {
		const available = encryptedKeyStore.isAvailable();
		if (!available) {
			return { migrated: 0, available: false };
		}
		const raw = this.getRawModelProviders();
		let migrated = 0;
		let dirty = false;
		for (const p of raw) {
			if (p.apiKey) {
				// 只有当 keystore 尚无该密钥时才写入，避免覆盖更新过的值。
				if (!encryptedKeyStore.hasKey(this.providerKeyRef(p.id))) {
					encryptedKeyStore.setKey(this.providerKeyRef(p.id), p.apiKey);
					migrated++;
				}
				dirty = true;
			}
		}
		if (dirty) {
			// 原子重写 config：清除全部明文 apiKey 字段。
			this.configStore.set(
				"modelProviders",
				raw.map((p) => ({ ...p, apiKey: "" })),
			);
		}
		return { migrated, available: true };
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

	// ============ Agent SDK 配置相关 ============

	getAgentSDKConfig(): AgentSDKConfig {
		return this.configStore.get("agentSDKConfig") || {};
	}

	setAgentSDKConfig(config: AgentSDKConfig): void {
		this.configStore.set("agentSDKConfig", config);
	}

	// ============ project-session-redesign A-7: §9.5 picker sticky ============

	getNewConversationDefaults(): {
		lastKind: "casual" | "project";
		lastProjectId?: string;
	} {
		return (
			this.configStore.get("newConversationDefaults") || {
				lastKind: "casual",
			}
		);
	}

	setNewConversationDefaults(value: {
		lastKind: "casual" | "project";
		lastProjectId?: string;
	}): void {
		this.configStore.set("newConversationDefaults", value);
	}

	// ============ project-session-redesign B-4: 迁移幂等 flag ============

	isMigrationV2Done(): boolean {
		return this.configStore.get("migrationV2Done") === true;
	}

	markMigrationV2Done(): void {
		this.configStore.set("migrationV2Done", true);
	}

	// ============ Agent Profiles & Teams 相关 ============

	getAgentProfiles(): AgentProfile[] {
		return this.configStore.get("agentProfiles") || [];
	}

	setAgentProfiles(profiles: AgentProfile[]): void {
		this.configStore.set("agentProfiles", profiles);
	}

	getAgentTeams(): AgentTeam[] {
		return this.configStore.get("agentTeams") || [];
	}

	setAgentTeams(teams: AgentTeam[]): void {
		this.configStore.set("agentTeams", teams);
	}

	getBuiltinAgentVersion(): number {
		return (this.configStore.get("builtinAgentVersion") as number) || 0;
	}

	setBuiltinAgentVersion(version: number): void {
		this.configStore.set("builtinAgentVersion", version);
	}

	// ============ Network Proxy 配置相关 ============

	getProxyConfig(): ProxyConfig | undefined {
		const raw = this.configStore.get("proxyConfig") as
			| (Record<string, unknown> & { protocol?: string; protocols?: string[] })
			| undefined;
		if (!raw) return undefined;

		// 迁移旧配置: protocol (string) → protocols (string[])
		if (typeof raw.protocol === "string" && !raw.protocols) {
			const { protocol: _, ...rest } = raw;
			const migrated = {
				...rest,
				protocols: ["http", "https"],
			} as unknown as ProxyConfig;
			this.configStore.set("proxyConfig", migrated);
			return migrated;
		}
		return raw as unknown as ProxyConfig;
	}

	setProxyConfig(config: ProxyConfig): void {
		this.configStore.set("proxyConfig", config);
	}

	getRequestLogEnabled(): boolean {
		return this.configStore.get("requestLogEnabled") ?? false;
	}

	setRequestLogEnabled(enabled: boolean): void {
		this.configStore.set("requestLogEnabled", enabled);
	}

	// ============ 清除所有数据 ============

	clearAll(): void {
		this.configStore.clear();
		this.dataStore.clear();
	}
}

// 单例实例
export const storeManager = new StoreManager();
