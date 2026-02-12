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

export const logService = {
	query: (params: LogQueryParams): Promise<LogQueryResult> =>
		window.electron.log.query(params),

	getStats: (): Promise<LogStats> =>
		window.electron.log.getStats(),

	getModules: (): Promise<string[]> =>
		window.electron.log.getModules(),

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

	clearDb: (): Promise<{ success: boolean }> =>
		window.electron.log.clearDb(),

	exportLogs: (
		params: LogQueryParams,
	): Promise<{ success: boolean; count?: number; filePath?: string }> =>
		window.electron.log.exportLogs(params),

	openViewer: (): Promise<{ success: boolean }> =>
		window.electron.log.openViewer(),
};
