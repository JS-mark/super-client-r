/**
 * 请求日志追踪服务
 * 拦截 global.fetch 和 axios 请求，记录到环形缓冲区并实时推送到 renderer
 */

import { EventEmitter } from "events";
import { BrowserWindow } from "electron";
import axios from "axios";
import { NETWORK_CHANNELS } from "../../ipc/channels";
import { storeManager } from "../../store/StoreManager";
import type { RequestLogEntry } from "../../ipc/types";
import { logger as rootLogger } from "../../utils/logger";

const logger = rootLogger.withContext("RequestLogService");

const MAX_ENTRIES = 500;
const BODY_PREVIEW_MAX = 1024; // 1KB

export class RequestLogService extends EventEmitter {
	private entries: RequestLogEntry[] = [];
	private enabled = false;
	private originalFetch: typeof globalThis.fetch | null = null;
	private axiosRequestInterceptorId: number | null = null;
	private axiosResponseInterceptorId: number | null = null;
	/** Map requestId → partial entry for axios (correlate request ↔ response) */
	private pendingAxios = new Map<string, { entry: RequestLogEntry; startTime: number }>();
	private idCounter = 0;

	/**
	 * 初始化：包装 fetch + axios interceptor
	 */
	initialize(): void {
		this.enabled = storeManager.getRequestLogEnabled();
		this.wrapFetch();
		this.installAxiosInterceptors();
		logger.info("RequestLogService initialized", { enabled: this.enabled });
	}

	/**
	 * 获取是否启用
	 */
	getEnabled(): boolean {
		return this.enabled;
	}

	/**
	 * 设置启用/禁用
	 */
	setEnabled(enabled: boolean): void {
		this.enabled = enabled;
		storeManager.setRequestLogEnabled(enabled);
	}

	/**
	 * 获取所有记录
	 */
	getEntries(): RequestLogEntry[] {
		return [...this.entries];
	}

	/**
	 * 清空记录
	 */
	clearEntries(): void {
		this.entries = [];
	}

	/**
	 * 获取记录数
	 */
	getCount(): number {
		return this.entries.length;
	}

	// ============ fetch 包装 ============

	private wrapFetch(): void {
		this.originalFetch = globalThis.fetch;
		const self = this;

		globalThis.fetch = async function wrappedFetch(
			input: string | URL | Request,
			init?: RequestInit,
		): Promise<Response> {
			if (!self.enabled || !self.originalFetch) {
				return self.originalFetch!.call(globalThis, input, init);
			}

			const entry = self.createEntry(input, init, "fetch");
			const startTime = performance.now();

			try {
				const response = await self.originalFetch.call(globalThis, input, init);
				entry.durationMs = Math.round(performance.now() - startTime);
				entry.responseStatus = response.status;
				entry.responseStatusText = response.statusText;

				// 克隆 response 读取 body（不影响原始消费）
				try {
					const cloned = response.clone();
					const text = await cloned.text();
					entry.responseBodyPreview = self.truncateBody(text);
				} catch {
					// 某些 response 无法读取 body
				}

				self.pushEntry(entry);
				return response;
			} catch (error) {
				entry.durationMs = Math.round(performance.now() - startTime);
				entry.error = error instanceof Error ? error.message : String(error);
				self.pushEntry(entry);
				throw error;
			}
		};
	}

	// ============ axios interceptor ============

	private installAxiosInterceptors(): void {
		const self = this;

		this.axiosRequestInterceptorId = axios.interceptors.request.use(
			(config) => {
				if (!self.enabled) return config;

				const id = self.nextId();
				const url = axios.getUri(config);
				const entry: RequestLogEntry = {
					id,
					timestamp: Date.now(),
					method: (config.method || "GET").toUpperCase(),
					url,
					requestHeaders: self.sanitizeHeaders(config.headers as Record<string, string>),
					requestBodyPreview: self.truncateBody(config.data),
					durationMs: 0,
					source: "axios",
				};

				// 标记到 config 中用于后续关联
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				(config as any).__logId = id;
				self.pendingAxios.set(id, { entry, startTime: performance.now() });

				return config;
			},
			(error) => Promise.reject(error),
		);

		this.axiosResponseInterceptorId = axios.interceptors.response.use(
			(response) => {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const logId = (response.config as any).__logId as string | undefined;
				if (logId && self.pendingAxios.has(logId)) {
					const { entry, startTime } = self.pendingAxios.get(logId)!;
					self.pendingAxios.delete(logId);
					entry.durationMs = Math.round(performance.now() - startTime);
					entry.responseStatus = response.status;
					entry.responseStatusText = response.statusText;
					entry.responseBodyPreview = self.truncateBody(response.data);
					self.pushEntry(entry);
				}
				return response;
			},
			(error) => {
				const config = error?.config as Record<string, unknown> | undefined;
				const logId = config?.__logId as string | undefined;
				if (logId && self.pendingAxios.has(logId)) {
					const { entry, startTime } = self.pendingAxios.get(logId)!;
					self.pendingAxios.delete(logId);
					entry.durationMs = Math.round(performance.now() - startTime);
					entry.responseStatus = error?.response?.status;
					entry.responseStatusText = error?.response?.statusText;
					entry.responseBodyPreview = self.truncateBody(error?.response?.data);
					entry.error = error instanceof Error ? error.message : String(error);
					self.pushEntry(entry);
				}
				return Promise.reject(error);
			},
		);
	}

	// ============ 内部工具 ============

	private nextId(): string {
		return `req_${Date.now()}_${++this.idCounter}`;
	}

	private createEntry(
		input: string | URL | Request,
		init: RequestInit | undefined,
		source: "fetch" | "axios",
	): RequestLogEntry {
		let url = "";
		let method = (init?.method || "GET").toUpperCase();

		if (typeof input === "string") {
			url = input;
		} else if (input instanceof URL) {
			url = input.toString();
		} else if (input instanceof Request) {
			url = input.url;
			method = input.method.toUpperCase();
		}

		return {
			id: this.nextId(),
			timestamp: Date.now(),
			method,
			url,
			requestHeaders: this.sanitizeHeaders(
				init?.headers as Record<string, string> | undefined,
			),
			requestBodyPreview: this.truncateBody(init?.body),
			durationMs: 0,
			source,
		};
	}

	private sanitizeHeaders(
		headers: Record<string, string> | Headers | undefined,
	): Record<string, string> | undefined {
		if (!headers) return undefined;

		const result: Record<string, string> = {};
		if (headers instanceof Headers) {
			headers.forEach((value, key) => {
				result[key] = this.maskSensitiveHeader(key, value);
			});
		} else if (typeof headers === "object") {
			for (const [key, value] of Object.entries(headers)) {
				if (typeof value === "string") {
					result[key] = this.maskSensitiveHeader(key, value);
				}
			}
		}

		return Object.keys(result).length > 0 ? result : undefined;
	}

	private maskSensitiveHeader(key: string, value: string): string {
		const lower = key.toLowerCase();
		if (
			lower === "authorization" ||
			lower === "x-api-key" ||
			lower === "api-key"
		) {
			if (value.length > 12) {
				return `${value.slice(0, 8)}...${value.slice(-4)}`;
			}
			return "***";
		}
		return value;
	}

	private truncateBody(body: unknown): string | undefined {
		if (!body) return undefined;

		let str: string;
		if (typeof body === "string") {
			str = body;
		} else if (body instanceof ArrayBuffer || body instanceof Uint8Array) {
			return `[Binary ${body instanceof ArrayBuffer ? body.byteLength : body.length} bytes]`;
		} else if (typeof body === "object") {
			try {
				str = JSON.stringify(body);
			} catch {
				return "[Unserializable]";
			}
		} else {
			str = String(body);
		}

		if (str.length > BODY_PREVIEW_MAX) {
			return `${str.slice(0, BODY_PREVIEW_MAX)}... (${str.length} bytes total)`;
		}
		return str;
	}

	private pushEntry(entry: RequestLogEntry): void {
		this.entries.push(entry);

		// 环形缓冲区：超出上限则移除最旧
		if (this.entries.length > MAX_ENTRIES) {
			this.entries.splice(0, this.entries.length - MAX_ENTRIES);
		}

		// 广播到所有渲染窗口
		try {
			for (const win of BrowserWindow.getAllWindows()) {
				if (!win.isDestroyed()) {
					win.webContents.send(NETWORK_CHANNELS.REQUEST_LOG_ENTRY, entry);
				}
			}
		} catch {
			// 窗口可能已关闭
		}

		this.emit("entry", entry);
	}
}

// 单例
export const requestLogService = new RequestLogService();
