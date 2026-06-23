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
