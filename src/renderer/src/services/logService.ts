/**
 * Log Service - Client wrapper for log IPC APIs
 */

export interface LogQueryParams {
	page?: number;
	pageSize?: number;
	level?: string[];
	module?: string[];
	process?: string[];
	keyword?: string;
	startTime?: number;
	endTime?: number;
	sortOrder?: "asc" | "desc";
}

export interface LogRecord {
	id: number;
	timestamp: string;
	timestamp_ms: number;
	level: string;
	module: string;
	process: string;
	message: string;
	meta: string | null;
	error_message: string | null;
	error_stack: string | null;
	session_id: string | null;
}

export interface LogQueryResult {
	records: LogRecord[];
	total: number;
	page: number;
	pageSize: number;
	totalPages: number;
}

export interface LogStats {
	totalCount: number;
	countByLevel: Record<string, number>;
	countByModule: Record<string, number>;
	countByProcess: Record<string, number>;
	recentErrorCount: number;
	timeHistogram: { hour: string; count: number }[];
}

/**
 * Create a scoped logger for use in renderer process components/services.
 * Logs are forwarded to the main process via IPC and stored in SQLite.
 *
 * Usage:
 *   const log = createLogger('ChatPage');
 *   log.info('Message sent');
 *   log.error('Failed to send', error);
 *   log.info('Details', { userId: 123 });
 *
 *   // Child context for sub-modules:
 *   const subLog = log.child('MessageList');
 *   subLog.debug('Rendering');  // module: 'ChatPage:MessageList'
 */
export function createLogger(
	module: string,
	baseMeta?: Record<string, unknown>,
) {
	const mergeMeta = (meta?: unknown): unknown => {
		if (!baseMeta) return meta;
		if (meta === undefined || meta === null) return baseMeta;
		if (typeof meta === "object" && !Array.isArray(meta)) {
			return { ...baseMeta, ...(meta as Record<string, unknown>) };
		}
		return meta;
	};

	const send = (
		level: string,
		message: string,
		meta?: unknown,
		error?: Error,
	) => {
		// The IPC bridge may be absent during early boot / teardown / tests.
		// Logging must never throw, so degrade silently when it isn't wired up.
		const log = window.electron?.log;
		if (!log?.rendererLog) return;
		log.rendererLog({
			level,
			message,
			module,
			meta: mergeMeta(meta),
			error_message: error?.message,
			error_stack: error?.stack,
		});
	};

	return {
		debug: (message: string, meta?: unknown) => send("DEBUG", message, meta),
		info: (message: string, meta?: unknown) => send("INFO", message, meta),
		warn: (message: string, meta?: unknown) => send("WARN", message, meta),
		error: (message: string, error?: Error, meta?: unknown) =>
			send("ERROR", message, meta, error),
		child: (subModule: string, extraMeta?: Record<string, unknown>) => {
			const childModule = `${module}:${subModule}`;
			const childMeta = extraMeta ? { ...baseMeta, ...extraMeta } : baseMeta;
			return createLogger(childModule, childMeta);
		},
	};
}

export type RendererLogger = ReturnType<typeof createLogger>;

/**
 * register.ts 把每个 RPC 返回值都包成 `{ success, data, error }`，但
 * `window.electron.log.*` 的类型还按"裸返回值"声明。store / 组件直接
 * 读 `result.totalCount` 时就会拿到 envelope 的 undefined 字段，触发
 * `Cannot read properties of undefined (reading 'toLocaleString')`。
 * 本文件集中解包 envelope，让消费方继续按业务模型消费。
 */
interface IpcEnvelope<T> {
	success: boolean;
	data?: T;
	error?: string;
}

function isEnvelope(value: unknown): value is IpcEnvelope<unknown> {
	return (
		typeof value === "object" &&
		value !== null &&
		"success" in (value as Record<string, unknown>)
	);
}

async function unwrap<T>(promise: Promise<unknown>, fallback: T): Promise<T> {
	const res = await promise;
	if (isEnvelope(res)) {
		const env = res as IpcEnvelope<T>;
		return env.success && env.data !== undefined ? env.data : fallback;
	}
	// 兼容（理论上不再触发的）历史直返实现。
	return (res as T) ?? fallback;
}

/** 把 envelope `{success, data: {...}}` 摊平到一个状态结果对象 */
async function flatten<T extends object>(
	promise: Promise<unknown>,
): Promise<{ success: boolean } & Partial<T>> {
	const res = await promise;
	if (isEnvelope(res)) {
		const env = res as IpcEnvelope<T>;
		return { success: env.success, ...(env.data ?? ({} as T)) };
	}
	return { success: true, ...((res as T) ?? ({} as T)) };
}

const EMPTY_STATS: LogStats = {
	totalCount: 0,
	countByLevel: {},
	countByModule: {},
	countByProcess: {},
	recentErrorCount: 0,
	timeHistogram: [],
};

const EMPTY_QUERY_RESULT: LogQueryResult = {
	records: [],
	total: 0,
	page: 1,
	pageSize: 50,
	totalPages: 0,
};

export const logService = {
	query: (params: LogQueryParams): Promise<LogQueryResult> =>
		unwrap<LogQueryResult>(
			window.electron.log.query(params) as unknown as Promise<unknown>,
			EMPTY_QUERY_RESULT,
		),

	getStats: (): Promise<LogStats> =>
		unwrap<LogStats>(
			window.electron.log.getStats() as unknown as Promise<unknown>,
			EMPTY_STATS,
		),

	getModules: (): Promise<string[]> =>
		unwrap<string[]>(
			window.electron.log.getModules() as unknown as Promise<unknown>,
			[],
		),

	rendererLog: (
		level: string,
		message: string,
		module?: string,
		meta?: unknown,
		error?: Error,
	): Promise<{ success: boolean }> =>
		flatten<{ success: boolean }>(
			window.electron.log.rendererLog({
				level,
				message,
				module,
				meta,
				error_message: error?.message,
				error_stack: error?.stack,
			}) as unknown as Promise<unknown>,
		),

	clearDb: (): Promise<{ success: boolean }> =>
		flatten<{ success: boolean }>(
			window.electron.log.clearDb() as unknown as Promise<unknown>,
		),

	exportLogs: (
		params: LogQueryParams,
	): Promise<{ success: boolean; count?: number; filePath?: string }> =>
		flatten<{ count?: number; filePath?: string }>(
			window.electron.log.exportLogs(params) as unknown as Promise<unknown>,
		),

	openViewer: (): Promise<{ success: boolean }> =>
		flatten<{ success: boolean }>(
			window.electron.log.openViewer() as unknown as Promise<unknown>,
		),
};
