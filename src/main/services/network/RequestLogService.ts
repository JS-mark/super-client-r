/**
 * 请求日志追踪服务
 *
 * Wraps `globalThis.fetch` + axios so every outbound HTTP request from the
 * main process is captured, persisted to a ring buffer, and streamed live to
 * any renderer window that's listening.
 *
 * Streaming semantics (the important part for LLM SSE):
 *  1. As soon as response headers arrive, push the entry with `state:
 *     "streaming"` so the UI shows it immediately — NOT after the whole body
 *     finishes draining.
 *  2. Body chunks are appended via `network:request-log-update` events
 *     (`appendBody` field); renderer concatenates them into its local copy.
 *  3. When the source stream ends or errors, send a final update with
 *     `state: "complete" | "error"` and timing.
 *
 * Previously this service called `await response.clone().text()` which blocks
 * until the whole SSE stream finishes — meaning a 30s LLM response would only
 * show up in the request log 30s after it started, with no incremental body
 * visibility. The new implementation tees the body via a `TransformStream`.
 */

import { EventEmitter } from "events";
import { app } from "electron";
import axios from "axios";
import { broadcastEvent } from "../../ipc/events";
import { storeManager } from "../../store/StoreManager";
import type {
	RequestLogEntry,
	RequestLogEntryUpdate,
} from "../../ipc/types";
import { logger as rootLogger } from "../../utils/logger";

const logger = rootLogger.withContext("RequestLogService");

const MAX_ENTRIES = 500;
const BODY_PREVIEW_MAX = 32 * 1024; // 32KB per body — enough to see full LLM payloads
const STREAM_TOTAL_MAX = 256 * 1024; // 256KB cap on streamed body to avoid memory blow-up

export class RequestLogService extends EventEmitter {
	private entries: RequestLogEntry[] = [];
	private enabled = false;
	private originalFetch: typeof globalThis.fetch | null = null;
	private axiosRequestInterceptorId: number | null = null;
	private axiosResponseInterceptorId: number | null = null;
	/** Map requestId → partial entry for axios (correlate request ↔ response) */
	private pendingAxios = new Map<
		string,
		{ entry: RequestLogEntry; startTime: number }
	>();
	private idCounter = 0;

	/**
	 * 初始化：包装 fetch + axios interceptor
	 *
	 * In dev (`!app.isPackaged`) we force-enable logging so a fresh checkout
	 * immediately shows requests in the drawer without needing to flip the
	 * setting first. Prod defaults to the persisted setting (off by default).
	 */
	initialize(): void {
		const persisted = storeManager.getRequestLogEnabled();
		const isDev = !app.isPackaged;
		this.enabled = isDev ? true : persisted;
		this.wrapFetch();
		this.installAxiosInterceptors();
		logger.info("RequestLogService initialized", {
			enabled: this.enabled,
			devForcedOn: isDev && !persisted,
		});
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
			entry.state = "pending";
			const startTime = performance.now();

			try {
				const response = await self.originalFetch.call(globalThis, input, init);
				const headersObj = self.headersToObject(response.headers);
				const contentType = (headersObj["content-type"] || "").toLowerCase();
				const transferEncoding = (
					headersObj["transfer-encoding"] || ""
				).toLowerCase();
				const isStreaming =
					contentType.includes("text/event-stream") ||
					contentType.includes("application/x-ndjson") ||
					transferEncoding.includes("chunked");

				entry.responseStatus = response.status;
				entry.responseStatusText = response.statusText;
				entry.responseHeaders = headersObj;
				entry.contentType = contentType || undefined;
				entry.isStreaming = isStreaming;
				entry.state = "streaming";
				entry.durationMs = Math.round(performance.now() - startTime);

				// Push the entry NOW so the UI sees it without waiting for the body.
				self.pushEntry(entry);

				// If there's no body to stream, mark complete and return as-is.
				if (!response.body) {
					self.pushUpdate({
						id: entry.id,
						state: "complete",
						durationMs: entry.durationMs,
					});
					return response;
				}

				// Tee the body through a TransformStream so we observe chunks
				// without blocking the original consumer. The renderer-facing
				// updates fire as data flows; the actual caller continues to
				// read the response normally.
				const decoder = new TextDecoder("utf-8", { fatal: false });
				let receivedBytes = 0;
				let bodyTruncated = false;
				const accumulated: string[] = [];

				const tap = new TransformStream<Uint8Array, Uint8Array>({
					transform(chunk, controller) {
						try {
							if (receivedBytes < STREAM_TOTAL_MAX) {
								const room = STREAM_TOTAL_MAX - receivedBytes;
								const visible =
									chunk.byteLength <= room
										? chunk
										: chunk.subarray(0, room);
								const text = decoder.decode(visible, { stream: true });
								if (text) {
									accumulated.push(text);
									self.pushUpdate({
										id: entry.id,
										appendBody: text,
										state: "streaming",
									});
								}
								receivedBytes += visible.byteLength;
								if (chunk.byteLength > room && !bodyTruncated) {
									bodyTruncated = true;
									self.pushUpdate({
										id: entry.id,
										appendBody: `\n…[truncated at ${STREAM_TOTAL_MAX} bytes]\n`,
									});
								}
							} else if (!bodyTruncated) {
								bodyTruncated = true;
								self.pushUpdate({
									id: entry.id,
									appendBody: `\n…[truncated at ${STREAM_TOTAL_MAX} bytes]\n`,
								});
							}
						} catch (err) {
							logger.warn("stream tap transform failed", {
								error: err instanceof Error ? err.message : String(err),
							});
						}
						// Always forward the chunk so the real caller is unaffected.
						controller.enqueue(chunk);
					},
					flush() {
						// Drain any decoder state into one final chunk.
						const tail = decoder.decode();
						if (tail) {
							accumulated.push(tail);
							self.pushUpdate({
								id: entry.id,
								appendBody: tail,
							});
						}
						// Persist the final body preview on the canonical entry so
						// later refetches via getEntries() include it.
						const fullBody = accumulated.join("");
						entry.responseBodyPreview = self.truncateBody(fullBody);
						entry.durationMs = Math.round(performance.now() - startTime);
						entry.state = "complete";
						self.pushUpdate({
							id: entry.id,
							state: "complete",
							durationMs: entry.durationMs,
						});
					},
				});

				const tapped = response.body.pipeThrough(tap);
				// Return a new Response that wraps the teed stream. Status,
				// headers, etc. are preserved.
				return new Response(tapped, {
					status: response.status,
					statusText: response.statusText,
					headers: response.headers,
				});
			} catch (error) {
				entry.durationMs = Math.round(performance.now() - startTime);
				entry.error = error instanceof Error ? error.message : String(error);
				entry.state = "error";
				if (!self.entries.includes(entry)) {
					self.pushEntry(entry);
				} else {
					self.pushUpdate({
						id: entry.id,
						state: "error",
						durationMs: entry.durationMs,
						error: entry.error,
					});
				}
				throw error;
			}
		};
	}

	/**
	 * Convert Fetch `Headers` to a plain lower-cased object with sensitive
	 * values masked. Lower-casing keys avoids casing surprises in the UI.
	 */
	private headersToObject(headers: Headers): Record<string, string> {
		const out: Record<string, string> = {};
		headers.forEach((value, key) => {
			out[key.toLowerCase()] = this.maskSensitiveHeader(key, value);
		});
		return out;
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
					requestHeaders: self.sanitizeHeaders(
						config.headers as Record<string, string>,
					),
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
					const headers = response.headers ?? {};
					entry.responseHeaders = self.sanitizeHeaders(
						headers as Record<string, string>,
					);
					entry.contentType =
						typeof headers === "object" &&
						headers &&
						"content-type" in headers
							? String((headers as Record<string, string>)["content-type"])
									.toLowerCase()
									.split(";")[0]
							: undefined;
					entry.responseBodyPreview = self.truncateBody(response.data);
					entry.state = "complete";
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
					entry.state = "error";
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
			return `${str.slice(0, BODY_PREVIEW_MAX)}…[preview capped at ${BODY_PREVIEW_MAX} bytes of ${str.length}]`;
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
		broadcastEvent("network:request-log-entry", entry);

		this.emit("entry", entry);
	}

	/**
	 * Broadcast an incremental update for an already-pushed entry. Renderer
	 * matches by `id` and merges fields locally (appending `appendBody`).
	 *
	 * We also keep `this.entries` in sync so that a late-arriving renderer
	 * pulling `getEntries()` sees the latest state.
	 */
	private pushUpdate(update: RequestLogEntryUpdate): void {
		const target = this.entries.find((e) => e.id === update.id);
		if (target) {
			if (update.state) target.state = update.state;
			if (update.responseStatus !== undefined) {
				target.responseStatus = update.responseStatus;
			}
			if (update.responseStatusText !== undefined) {
				target.responseStatusText = update.responseStatusText;
			}
			if (update.responseHeaders) {
				target.responseHeaders = update.responseHeaders;
			}
			if (update.contentType) target.contentType = update.contentType;
			if (typeof update.isStreaming === "boolean") {
				target.isStreaming = update.isStreaming;
			}
			if (typeof update.durationMs === "number") {
				target.durationMs = update.durationMs;
			}
			if (update.error) target.error = update.error;
			if (update.appendBody) {
				const existing = target.responseBodyPreview ?? "";
				const next = existing + update.appendBody;
				target.responseBodyPreview =
					next.length > BODY_PREVIEW_MAX
						? `${next.slice(0, BODY_PREVIEW_MAX)}…[preview capped at ${BODY_PREVIEW_MAX} bytes]`
						: next;
			}
		}

		broadcastEvent("network:request-log-update", update);
		this.emit("update", update);
	}
}

// 单例
export const requestLogService = new RequestLogService();
