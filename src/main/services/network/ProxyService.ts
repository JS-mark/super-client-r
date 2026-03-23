/**
 * 网络代理管理服务
 * 使用 undici ProxyAgent 覆盖 global.fetch + 设置环境变量覆盖 axios/子进程
 */

import { EventEmitter } from "events";
import net from "net";
import { Agent, ProxyAgent, setGlobalDispatcher } from "undici";
import { storeManager } from "../../store/StoreManager";
import type { ProxyConfig } from "../../ipc/types";
import { logger as rootLogger } from "../../utils/logger";

const logger = rootLogger.withContext("ProxyService");

/** 用于测试连通性的 URL 列表（按优先级排列） */
const TEST_URLS = [
	"http://www.gstatic.com/generate_204",
	"http://connectivitycheck.gstatic.com/generate_204",
	"http://clients3.google.com/generate_204",
];

export class ProxyService extends EventEmitter {
	private currentConfig: ProxyConfig | null = null;

	/**
	 * 初始化：从 StoreManager 读取配置，若 enabled 则 apply
	 */
	initialize(): void {
		const config = storeManager.getProxyConfig();
		if (config?.enabled && config.host && config.port) {
			try {
				this.applyProxy(config);
			} catch (error) {
				logger.error("Failed to apply saved proxy config", error instanceof Error ? error : new Error(String(error)));
			}
		}
		logger.info("ProxyService initialized", {
			enabled: config?.enabled ?? false,
		});
	}

	/**
	 * 获取当前代理配置
	 */
	getConfig(): ProxyConfig | undefined {
		return storeManager.getProxyConfig();
	}

	/**
	 * 更新配置并重新 apply/disable
	 */
	updateConfig(config: ProxyConfig): void {
		storeManager.setProxyConfig(config);

		if (config.enabled && config.host && config.port) {
			this.applyProxy(config);
		} else {
			this.disableProxy();
		}

		this.emit("config-changed", config);
	}

	/**
	 * 应用代理
	 */
	applyProxy(config: ProxyConfig): void {
		try {
			const proxyUrl = this.buildProxyUrl(config);

			// 1. undici ProxyAgent — 覆盖所有 global.fetch 调用
			const proxyAgent = new ProxyAgent({
				uri: proxyUrl,
				...(config.bypassList
					? {
							requestTls: undefined,
						}
					: {}),
			});
			setGlobalDispatcher(proxyAgent);

			// 2. 根据 protocols 选择性设置环境变量
			const protocols = config.protocols ?? ["http", "https"];

			if (protocols.includes("http")) {
				process.env.HTTP_PROXY = proxyUrl;
				process.env.http_proxy = proxyUrl;
			} else {
				delete process.env.HTTP_PROXY;
				delete process.env.http_proxy;
			}

			if (protocols.includes("https")) {
				process.env.HTTPS_PROXY = proxyUrl;
				process.env.https_proxy = proxyUrl;
			} else {
				delete process.env.HTTPS_PROXY;
				delete process.env.https_proxy;
			}

			// ALL_PROXY 在两种都选时设置
			if (protocols.includes("http") && protocols.includes("https")) {
				process.env.ALL_PROXY = proxyUrl;
				process.env.all_proxy = proxyUrl;
			} else {
				delete process.env.ALL_PROXY;
				delete process.env.all_proxy;
			}

			if (config.bypassList) {
				process.env.NO_PROXY = config.bypassList;
				process.env.no_proxy = config.bypassList;
			}

			this.currentConfig = config;
			logger.info(`Proxy applied: ${config.host}:${config.port} [${protocols.join(",")}]`);
		} catch (error) {
			logger.error("Failed to apply proxy", error instanceof Error ? error : new Error(String(error)));
			throw error;
		}
	}

	/**
	 * 禁用代理，恢复默认 dispatcher
	 */
	disableProxy(): void {
		try {
			// 恢复默认 Agent
			setGlobalDispatcher(new Agent());

			// 删除环境变量
			for (const key of [
				"HTTP_PROXY",
				"HTTPS_PROXY",
				"ALL_PROXY",
				"http_proxy",
				"https_proxy",
				"all_proxy",
				"NO_PROXY",
				"no_proxy",
			]) {
				delete process.env[key];
			}

			this.currentConfig = null;
			logger.info("Proxy disabled");
		} catch (error) {
			logger.error("Failed to disable proxy", error instanceof Error ? error : new Error(String(error)));
		}
	}

	/**
	 * TCP 探测：检测代理端口是否可达
	 */
	private tcpProbe(host: string, port: number, timeoutMs = 5000): Promise<void> {
		return new Promise((resolve, reject) => {
			const socket = net.createConnection({ host, port });
			const timer = setTimeout(() => {
				socket.destroy();
				reject(new Error(`TCP connect to ${host}:${port} timed out (${timeoutMs}ms)`));
			}, timeoutMs);

			socket.on("connect", () => {
				clearTimeout(timer);
				socket.destroy();
				resolve();
			});

			socket.on("error", (err) => {
				clearTimeout(timer);
				socket.destroy();
				reject(err);
			});
		});
	}

	/**
	 * 测试代理连接（两阶段：TCP 探测 → HTTP 代理请求）
	 */
	async testConnection(config: ProxyConfig): Promise<{ success: boolean; latencyMs: number; error?: string }> {
		const start = Date.now();

		// Phase 1: TCP 探测代理端口
		try {
			await this.tcpProbe(config.host, config.port);
		} catch (err) {
			const detail = err instanceof Error ? err.message : String(err);
			return {
				success: false,
				latencyMs: Date.now() - start,
				error: `Proxy ${config.host}:${config.port} unreachable — ${detail}`,
			};
		}

		// Phase 2: 通过代理发出 HTTP 请求验证端到端连通
		const proxyUrl = this.buildProxyUrl(config);
		const testAgent = new ProxyAgent({ uri: proxyUrl });

		for (const testUrl of TEST_URLS) {
			try {
				const resp = await fetch(testUrl, {
					dispatcher: testAgent as unknown as RequestInit["dispatcher"],
					signal: AbortSignal.timeout(10000),
				});
				const latencyMs = Date.now() - start;

				if (resp.status === 204 || resp.ok) {
					return { success: true, latencyMs };
				}
				// 非 OK 状态但能收到响应 — 代理本身可用，目标返回异常
				return { success: true, latencyMs };
			} catch {
				// 尝试下一个 URL
				continue;
			}
		}

		// 所有 URL 都失败了，用最后一个 URL 重试一次以获取详细错误
		try {
			await fetch(TEST_URLS[0], {
				dispatcher: testAgent as unknown as RequestInit["dispatcher"],
				signal: AbortSignal.timeout(10000),
			});
		} catch (error) {
			const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : "";
			const msg = error instanceof Error ? error.message : String(error);
			return {
				success: false,
				latencyMs: Date.now() - start,
				error: cause ? `${msg} (${cause})` : msg,
			};
		}

		return {
			success: false,
			latencyMs: Date.now() - start,
			error: "All test URLs failed",
		};
	}

	/**
	 * 构建代理 URL — 始终使用 http:// scheme（undici ProxyAgent 只支持 HTTP CONNECT）
	 */
	private buildProxyUrl(config: ProxyConfig): string {
		const { host, port, auth, username } = config;
		const pw = (config as unknown as Record<string, unknown>)["password"] as string | undefined;

		if (auth && username && pw) {
			return `http://${encodeURIComponent(username)}:${encodeURIComponent(pw)}@${host}:${port}`;
		}
		return `http://${host}:${port}`;
	}
}

// 单例
export const proxyService = new ProxyService();
