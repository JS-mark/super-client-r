/**
 * Local API client.
 *
 * Thin wrapper around `fetch` for talking to the in-process Koa HTTP server
 * (see `src/main/server`). Used by services that previously called Electron
 * IPC directly but should now route through the public HTTP API for logging
 * and external-client parity (e.g. `modelService.fetchModels`).
 *
 * Caches the server port and Bearer API key after first lookup. The port is
 * invalidated when the main process emits `server-port-update` (e.g. user
 * restarts the API service on a new port from Settings).
 */

import { apiService } from "./apiService";

let cachedPort: number | null = null;
let cachedKey: string | null = null;
let cachedKeyPromise: Promise<string> | null = null;
let cachedPortPromise: Promise<number> | null = null;

// Invalidate cached port whenever the main process reports a new one.
type PortListenerArg = number | { port?: number };
const ipc = (window as unknown as {
	electron?: { ipc?: { on?: (channel: string, listener: (arg: PortListenerArg) => void) => void } };
}).electron?.ipc;
if (ipc?.on) {
	ipc.on("server-port-update", (arg: PortListenerArg) => {
		cachedPort =
			typeof arg === "number"
				? arg
				: typeof arg?.port === "number"
					? arg.port
					: null;
		cachedPortPromise = null;
	});
}

async function getPort(): Promise<number> {
	if (cachedPort !== null) return cachedPort;
	if (cachedPortPromise) return cachedPortPromise;
	cachedPortPromise = apiService
		.getStatus()
		.then((s) => {
			cachedPort = s.port;
			return s.port;
		})
		.finally(() => {
			cachedPortPromise = null;
		});
	return cachedPortPromise;
}

async function getKey(): Promise<string> {
	if (cachedKey !== null) return cachedKey;
	if (cachedKeyPromise) return cachedKeyPromise;
	cachedKeyPromise = apiService
		.getApiKey()
		.then((k) => {
			cachedKey = k;
			return k;
		})
		.finally(() => {
			cachedKeyPromise = null;
		});
	return cachedKeyPromise;
}

async function baseUrl(): Promise<string> {
	const port = await getPort();
	return `http://localhost:${port}`;
}

interface ApiEnvelope<T> {
	code: number;
	message: string;
	data?: T;
	timestamp?: number;
}

interface HttpJsonOptions {
	method?: "GET" | "POST" | "PUT" | "DELETE";
	body?: unknown;
	signal?: AbortSignal;
}

/**
 * Call a local API endpoint and unwrap the `{ code, message, data }` envelope.
 * Throws if the envelope reports a non-2xx code or the HTTP request fails.
 */
export async function httpJson<T = unknown>(
	path: string,
	opts: HttpJsonOptions = {},
): Promise<T> {
	const [url, key] = await Promise.all([
		baseUrl().then((b) => `${b}${path}`),
		getKey(),
	]);
	const headers: Record<string, string> = {
		Authorization: `Bearer ${key}`,
	};
	let body: string | undefined;
	if (opts.body !== undefined) {
		headers["Content-Type"] = "application/json";
		body = JSON.stringify(opts.body);
	}

	const res = await fetch(url, {
		method: opts.method ?? "GET",
		headers,
		body,
		signal: opts.signal,
	});
	const text = await res.text();
	let envelope: ApiEnvelope<T> | null = null;
	if (text) {
		try {
			envelope = JSON.parse(text) as ApiEnvelope<T>;
		} catch {
			envelope = null;
		}
	}

	if (!res.ok) {
		const msg = envelope?.message || `HTTP ${res.status}`;
		throw new Error(msg);
	}
	if (envelope && typeof envelope.code === "number" && envelope.code !== 200) {
		throw new Error(envelope.message || `Server returned code ${envelope.code}`);
	}
	return (envelope?.data as T) ?? (undefined as T);
}

// ─── Streaming (SSE) helpers ────────────────────────────────────────────────

interface HttpFetchOptions {
	method?: "GET" | "POST" | "PUT" | "DELETE";
	body?: unknown;
	signal?: AbortSignal;
	accept?: string;
}

/**
 * Lower-level fetch wrapper that returns the raw `Response` so the caller can
 * consume `response.body` as a stream (SSE / NDJSON / etc.). Adds the same
 * `Authorization: Bearer <apiKey>` header and resolves the local server's
 * `http://localhost:<port>` base URL via the cached lookups above.
 *
 * Does NOT auto-throw on non-2xx — caller decides (SSE consumers usually want
 * to surface the failure as an inline event, not an exception).
 */
export async function httpFetch(
	path: string,
	opts: HttpFetchOptions = {},
): Promise<Response> {
	const [url, key] = await Promise.all([
		baseUrl().then((b) => `${b}${path}`),
		getKey(),
	]);
	const headers: Record<string, string> = {
		Authorization: `Bearer ${key}`,
	};
	if (opts.accept) headers.Accept = opts.accept;
	let body: string | undefined;
	if (opts.body !== undefined) {
		headers["Content-Type"] = "application/json";
		body = JSON.stringify(opts.body);
	}
	return fetch(url, {
		method: opts.method ?? "GET",
		headers,
		body,
		signal: opts.signal,
	});
}

/**
 * POST a JSON `body` and consume the response as a Server-Sent Events stream,
 * yielding each parsed payload as `TEvent`.
 *
 * The server writes frames in the standard SSE format:
 * ```
 * event: <type>
 * data: <full event JSON>
 *
 * ```
 * (see `src/main/server/routes/llm.ts` / `routes/agent.ts` `writeEvent`).
 * The `event:` line is ignored here because the same `type` field is already
 * inside the `data:` JSON payload — we only parse `data:` and JSON-decode it.
 *
 * - Uses `TextDecoder({ stream: true })` so multi-byte UTF-8 codepoints are
 *   never split across chunk boundaries.
 * - Frames are separated by a blank line (`\n\n` or `\r\n\r\n`). Empty frames
 *   (keep-alive comments) are skipped.
 * - On non-2xx response, throws so the caller can synthesize an event in the
 *   right shape (different consumers want different `type` fields, so we
 *   don't synthesize here).
 *
 * Cancellation: pass an `AbortSignal`. When aborted, `fetch` rejects and the
 * generator silently returns. The server-side route picks up the dropped
 * socket via `ctx.req.on("close", ...)` and stops the underlying stream.
 */
export async function* sseStream<TEvent>(
	path: string,
	body: unknown,
	signal: AbortSignal,
): AsyncGenerator<TEvent> {
	let res: Response;
	try {
		res = await httpFetch(path, {
			method: "POST",
			body,
			signal,
			accept: "text/event-stream",
		});
	} catch (err) {
		if (signal.aborted) return;
		throw err instanceof Error ? err : new Error(String(err));
	}

	if (!res.ok || !res.body) {
		let message = `HTTP ${res.status} ${res.statusText}`.trim();
		try {
			const text = await res.text();
			if (text) {
				try {
					const parsed = JSON.parse(text) as { message?: string };
					if (parsed?.message) message = parsed.message;
				} catch {
					message = text.slice(0, 500);
				}
			}
		} catch {
			// keep the HTTP status message
		}
		throw new Error(message);
	}

	const reader = res.body.getReader();
	const decoder = new TextDecoder("utf-8", { fatal: false });
	let buffer = "";

	try {
		while (true) {
			const { value, done } = await reader.read();
			if (done) {
				buffer += decoder.decode();
				const trimmed = buffer.trim();
				if (trimmed) {
					const evt = parseSseFrame<TEvent>(trimmed);
					if (evt !== null) yield evt;
				}
				return;
			}
			buffer += decoder.decode(value, { stream: true });
			buffer = buffer.replace(/\r\n/g, "\n");

			let sep: number;
			while ((sep = buffer.indexOf("\n\n")) !== -1) {
				const frame = buffer.slice(0, sep);
				buffer = buffer.slice(sep + 2);
				const evt = parseSseFrame<TEvent>(frame);
				if (evt !== null) yield evt;
			}
		}
	} catch (err) {
		if (signal.aborted) return;
		throw err instanceof Error ? err : new Error(String(err));
	} finally {
		try {
			reader.releaseLock();
		} catch {
			// reader may already be closed
		}
	}
}

function parseSseFrame<TEvent>(frame: string): TEvent | null {
	const lines = frame.split("\n");
	const dataParts: string[] = [];
	for (const line of lines) {
		if (line.startsWith(":")) continue; // comment / keep-alive
		if (line.startsWith("data:")) {
			const v = line.slice(5);
			dataParts.push(v.startsWith(" ") ? v.slice(1) : v);
		}
		// `event:` / `id:` / `retry:` ignored — type already lives in data JSON.
	}
	if (dataParts.length === 0) return null;
	try {
		return JSON.parse(dataParts.join("\n")) as TEvent;
	} catch {
		return null;
	}
}
