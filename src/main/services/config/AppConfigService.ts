/**
 * 应用初始化配置服务
 * 从服务端获取应用配置，包括 OAuth、模型提供商、功能开关等
 */

import { app } from "electron";
import { broadcastConfigUpdate } from "../../ipc/handlers/appConfigHandler";
import { storeManager } from "../../store/StoreManager";
import { logger } from "../../utils/logger";
import { authService } from "../auth/AuthService";

// 配置 API 基础地址（从环境变量读取，支持开发/生产环境切换）
const CONFIG_API_BASE_URL =
	import.meta.env.MAIN_VITE_CONFIG_API_BASE_URL || "https://app.nexo-ai.top";

// 完整的配置接口地址
const CONFIG_API_URL = `${CONFIG_API_BASE_URL}/v1/app/init-config`;

// 配置缓存键
const CONFIG_CACHE_KEY = "appInitConfigCache";

// 缓存有效期（24 小时）
const CACHE_TTL = 24 * 60 * 60 * 1000;

// 定期检查间隔（1 小时）
const CHECK_INTERVAL = 60 * 60 * 1000;

/**
 * 应用初始化配置类型（精简版，仅包含客户端需要的字段）
 */
export interface AppInitConfig {
	version: string;
	updatedAt: number;
	forceUpdate?: {
		fields: string[];
		reason?: string;
	};
	oauth: {
		google: { clientId: string };
		github: { clientId: string; tokenExchangeUrl: string };
	};
	featureFlags: Record<string, boolean>;
	announcements: Array<{
		id: string;
		type: string;
		title: string;
		titleZh: string;
		content: string;
		contentZh: string;
		dismissible: boolean;
		startAt: number;
		endAt: number;
		priority: number;
	}>;
	meta: {
		links: Record<string, string>;
		endpoints: Record<string, string>;
	};
}

interface CachedConfig {
	config: AppInitConfig;
	cachedAt: number;
	version: string;
}

class AppConfigService {
	private config: AppInitConfig | null = null;
	private loading = false;
	private checkTimer: NodeJS.Timeout | null = null;

	/**
	 * 初始化配置服务
	 * 应在应用启动时调用
	 */
	async initialize(): Promise<void> {
		logger.info("[AppConfigService] Initializing...");

		try {
			// 1. 尝试从服务端获取最新配置
			const serverConfig = await this.fetchConfig();

			// 2. 获取本地缓存
			const cached = this.loadCachedConfig();

			// 3. 合并配置（处理 forceUpdate）
			const finalConfig = this.mergeConfigs(cached, serverConfig);

			// 4. 缓存配置
			this.saveToCache(finalConfig);

			// 5. 保存到内存
			this.config = finalConfig;

			// 6. 应用配置
			this.applyConfig(finalConfig);

			logger.info("[AppConfigService] Initialized successfully", {
				version: finalConfig.version,
				forceUpdateFields: finalConfig.forceUpdate?.fields.length || 0,
			});

			// 7. 启动定期检查
			this.startPeriodicCheck();
		} catch (error) {
			logger.error(
				"[AppConfigService] Failed to fetch server config",
				error as Error,
			);

			// 降级：使用本地缓存
			const cached = this.loadCachedConfig();
			if (cached) {
				logger.info("[AppConfigService] Using cached config as fallback");
				this.config = cached.config;
				this.applyConfig(cached.config);

				// 即使使用缓存，也启动定期检查
				this.startPeriodicCheck();
			} else {
				logger.warn("[AppConfigService] No cached config available");
			}
		}
	}

	/**
	 * 获取当前配置
	 */
	getConfig(): AppInitConfig | null {
		return this.config;
	}

	/**
	 * 强制刷新配置
	 */
	async refresh(): Promise<AppInitConfig | null> {
		logger.info("[AppConfigService] Manual refresh triggered");

		try {
			// 1. 获取服务端配置
			const serverConfig = await this.fetchConfig();

			// 2. 获取本地缓存
			const cached = this.loadCachedConfig();

			// 3. 合并配置
			const finalConfig = this.mergeConfigs(cached, serverConfig);

			// 4. 缓存配置
			this.saveToCache(finalConfig);

			// 5. 保存到内存
			this.config = finalConfig;

			// 6. 应用配置
			this.applyConfig(finalConfig);

			logger.info("[AppConfigService] Refresh completed successfully");

			return finalConfig;
		} catch (error) {
			logger.error("[AppConfigService] Refresh failed", error as Error);
			return this.config;
		}
	}

	/**
	 * 从服务端获取配置
	 */
	private async fetchConfig(): Promise<AppInitConfig> {
		if (this.loading) {
			throw new Error("Config fetch already in progress");
		}

		this.loading = true;

		try {
			logger.info("[AppConfigService] Fetching config from server...");

			const response = await fetch(CONFIG_API_URL, {
				method: "GET",
				headers: {
					"X-App-Version": app.getVersion(),
					"X-Platform": process.platform,
					"X-Locale": app.getLocale(),
				},
				signal: AbortSignal.timeout(10000), // 10 秒超时
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			const config = (await response.json()) as AppInitConfig;

			logger.info(
				`[AppConfigService] Fetched config successfully (version: ${config.version})`,
			);

			return config;
		} finally {
			this.loading = false;
		}
	}

	/**
	 * 应用配置到各个服务
	 */
	private applyConfig(config: AppInitConfig): void {
		// 设置 OAuth client IDs（远程配置优先，始终覆盖本地配置）
		if (config.oauth?.google?.clientId) {
			storeManager.setConfig("googleClientId", config.oauth.google.clientId);
			logger.info(
				`[AppConfigService] Applied Google OAuth client ID: ${config.oauth.google.clientId}`,
			);
		}

		if (config.oauth?.github?.clientId) {
			storeManager.setConfig("githubClientId", config.oauth.github.clientId);
			logger.info(
				`[AppConfigService] Applied GitHub OAuth client ID: ${config.oauth.github.clientId}`,
			);
		}

		// 设置 GitHub token exchange URL
		if (config.oauth?.github?.tokenExchangeUrl) {
			authService.setTokenExchangeUrl(config.oauth.github.tokenExchangeUrl);
			logger.info(
				`[AppConfigService] Applied GitHub token exchange URL: ${config.oauth.github.tokenExchangeUrl}`,
			);
		}

		// 广播配置更新到所有窗口
		broadcastConfigUpdate(config);

		logger.info("[AppConfigService] Config applied successfully");
	}

	/**
	 * 合并配置：强制更新的字段使用服务端的值
	 */
	private mergeConfigs(
		cached: CachedConfig | null,
		server: AppInitConfig,
	): AppInitConfig {
		// 如果没有缓存或版本不同，直接使用服务端配置
		if (!cached || cached.version !== server.version) {
			logger.info(
				"[AppConfigService] Using server config (no cache or version mismatch)",
			);
			return server;
		}

		// 如果没有强制更新字段，使用缓存
		if (!server.forceUpdate?.fields || server.forceUpdate.fields.length === 0) {
			logger.info("[AppConfigService] Using cached config (no force update)");
			return cached.config;
		}

		// 合并配置
		logger.info(
			"[AppConfigService] Merging configs with force update fields:",
			server.forceUpdate.fields,
		);

		if (server.forceUpdate.reason) {
			logger.info(
				`[AppConfigService] Force update reason: ${server.forceUpdate.reason}`,
			);
		}

		const merged = { ...cached.config };

		// 强制更新指定的字段
		for (const fieldPath of server.forceUpdate.fields) {
			const value = this.getNestedValue(server, fieldPath);
			this.setNestedValue(merged, fieldPath, value);
			logger.info(`[AppConfigService] Force updated field: ${fieldPath}`);
		}

		// 始终更新元数据
		merged.version = server.version;
		merged.updatedAt = server.updatedAt;
		merged.forceUpdate = server.forceUpdate;

		return merged;
	}

	/**
	 * 获取嵌套对象的值
	 */
	private getNestedValue(obj: any, path: string): any {
		return path.split(".").reduce((current, key) => current?.[key], obj);
	}

	/**
	 * 设置嵌套对象的值
	 */
	private setNestedValue(obj: any, path: string, value: any): void {
		const keys = path.split(".");
		const lastKey = keys.pop()!;
		const target = keys.reduce((current, key) => {
			if (!current[key]) current[key] = {};
			return current[key];
		}, obj);
		target[lastKey] = value;
	}

	/**
	 * 定期检查配置更新
	 */
	private startPeriodicCheck(): void {
		// 清除之前的定时器
		if (this.checkTimer) {
			clearInterval(this.checkTimer);
		}

		logger.info(
			`[AppConfigService] Starting periodic check (interval: ${CHECK_INTERVAL / 1000 / 60} minutes)`,
		);

		this.checkTimer = setInterval(async () => {
			logger.info("[AppConfigService] Periodic check triggered");
			try {
				await this.refresh();
			} catch (error) {
				logger.error(
					"[AppConfigService] Periodic check failed",
					error as Error,
				);
			}
		}, CHECK_INTERVAL);
	}

	/**
	 * 停止定期检查
	 */
	stopPeriodicCheck(): void {
		if (this.checkTimer) {
			clearInterval(this.checkTimer);
			this.checkTimer = null;
			logger.info("[AppConfigService] Periodic check stopped");
		}
	}

	/**
	 * 从本地缓存加载配置
	 */
	private loadCachedConfig(): CachedConfig | null {
		try {
			const cached = storeManager.getConfig(
				CONFIG_CACHE_KEY as keyof import("../../store/StoreManager").AppConfig,
			) as CachedConfig | undefined;

			if (!cached) {
				logger.info("[AppConfigService] No cached config found");
				return null;
			}

			// 检查缓存是否过期
			const age = Date.now() - cached.cachedAt;
			if (age > CACHE_TTL) {
				logger.info(
					`[AppConfigService] Cache expired (age: ${Math.round(age / 1000 / 60)} minutes)`,
				);
				return null;
			}

			logger.info(
				`[AppConfigService] Loaded cached config (version: ${cached.version}, age: ${Math.round(age / 1000 / 60)} minutes)`,
			);
			return cached;
		} catch (error) {
			logger.error(
				"[AppConfigService] Failed to load cached config",
				error as Error,
			);
			return null;
		}
	}

	/**
	 * 保存配置到本地缓存
	 */
	private saveToCache(config: AppInitConfig): void {
		try {
			const cached: CachedConfig = {
				config,
				cachedAt: Date.now(),
				version: config.version,
			};
			storeManager.setConfig(
				CONFIG_CACHE_KEY as keyof import("../../store/StoreManager").AppConfig,
				cached as never,
			);
			logger.info(
				`[AppConfigService] Config cached successfully (version: ${config.version})`,
			);
		} catch (error) {
			logger.warn("[AppConfigService] Failed to save config cache", error);
		}
	}
}

export const appConfigService = new AppConfigService();
