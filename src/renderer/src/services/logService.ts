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
		window.electron.log.rendererLog({
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

export const logService = {
	query: (params: LogQueryParams): Promise<LogQueryResult> =>
		window.electron.log.query(params),

	getStats: (): Promise<LogStats> => window.electron.log.getStats(),

	getModules: (): Promise<string[]> => window.electron.log.getModules(),

	rendererLog: (
		level: string,
		message: string,
		module?: string,
		meta?: unknown,
		error?: Error,
	): Promise<{ success: boolean }> =>
		window.electron.log.rendererLog({
			level,
			message,
			module,
			meta,
			error_message: error?.message,
			error_stack: error?.stack,
		}),

	clearDb: (): Promise<{ success: boolean }> => window.electron.log.clearDb(),

	exportLogs: (
		params: LogQueryParams,
	): Promise<{ success: boolean; count?: number; filePath?: string }> =>
		window.electron.log.exportLogs(params),

	openViewer: (): Promise<{ success: boolean }> =>
		window.electron.log.openViewer(),
};
