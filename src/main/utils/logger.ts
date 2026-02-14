/**
 * Logger Utility
 * Provides structured logging with multiple levels and SQLite storage
 */

import { logDatabaseService } from "../services/log";

export enum LogLevel {
	DEBUG = "DEBUG",
	INFO = "INFO",
	WARN = "WARN",
	ERROR = "ERROR",
}

interface LogEntry {
	timestamp: string;
	level: LogLevel;
	message: string;
	module?: string;
	meta?: unknown;
	error?: {
		message: string;
		stack?: string;
	};
}

interface LoggerConfig {
	level: LogLevel;
	console: boolean;
	defaultModule: string; // Default module name when none is provided
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
	[LogLevel.DEBUG]: 0,
	[LogLevel.INFO]: 1,
	[LogLevel.WARN]: 2,
	[LogLevel.ERROR]: 3,
};

export class Logger {
	private config: LoggerConfig;

	constructor(config: Partial<LoggerConfig> = {}) {
		this.config = {
			level: LogLevel.INFO,
			console: true,
			defaultModule: "",
			...config,
		};
	}

	/**
	 * Write log entry to SQLite database
	 */
	private write(entry: LogEntry): void {
		try {
			logDatabaseService.insert({
				timestamp: entry.timestamp,
				level: entry.level,
				module: entry.module,
				process: "main",
				message: entry.message,
				meta: entry.meta,
				error_message: entry.error?.message,
				error_stack: entry.error?.stack,
			});
		} catch {
			// Silently ignore DB write failures
		}
	}

	/**
	 * Output to console
	 */
	private consoleOutput(entry: LogEntry): void {
		if (!this.config.console) return;

		const { level, message, module, meta, error } = entry;
		const prefix = `[${level}]${module ? `[${module}]` : ""}`;

		switch (level) {
			case LogLevel.DEBUG:
				console.debug(prefix, message, meta || "");
				break;
			case LogLevel.INFO:
				console.info(prefix, message, meta || "");
				break;
			case LogLevel.WARN:
				console.warn(prefix, message, meta || "");
				break;
			case LogLevel.ERROR:
				console.error(prefix, message, meta || "", error || "");
				break;
		}
	}

	/**
	 * Check if level should be logged
	 */
	private shouldLog(level: LogLevel): boolean {
		return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.config.level];
	}

	/**
	 * Core log method
	 */
	private log(
		level: LogLevel,
		message: string,
		options: {
			module?: string;
			meta?: unknown;
			error?: Error;
		} = {},
	): void {
		if (!this.shouldLog(level)) return;

		const entry: LogEntry = {
			timestamp: new Date().toISOString(),
			level,
			message,
			module: options.module || this.config.defaultModule,
			meta: options.meta,
		};

		if (options.error) {
			entry.error = {
				message: options.error.message,
				stack: options.error.stack,
			};
		}

		this.write(entry);
		this.consoleOutput(entry);
	}

	// Public API methods
	debug(message: string, meta?: unknown, module?: string): void {
		this.log(LogLevel.DEBUG, message, { module, meta });
	}

	info(message: string, meta?: unknown, module?: string): void {
		this.log(LogLevel.INFO, message, { module, meta });
	}

	warn(message: string, meta?: unknown, module?: string): void {
		this.log(LogLevel.WARN, message, { module, meta });
	}

	error(message: string, error?: Error, meta?: unknown, module?: string): void {
		this.log(LogLevel.ERROR, message, { module, meta, error });
	}

	/**
	 * Create a scoped logger with pre-bound context.
	 *
	 * Usage:
	 *   const log = logger.withContext('AgentService');
	 *   log.info('Session created');           // auto module: 'AgentService'
	 *   log.info('Details', { sessionId: 1 }); // auto module + meta
	 *
	 *   const log2 = logger.withContext('MCP', { serverId: 'abc' });
	 *   log2.info('Connected');                // module: 'MCP', meta merged with { serverId: 'abc' }
	 */
	withContext(module: string, baseMeta?: Record<string, unknown>): ScopedLogger {
		return new ScopedLogger(this, module, baseMeta);
	}
}

/**
 * Scoped logger with pre-bound module and optional base metadata.
 * Created via logger.withContext('ModuleName').
 */
export class ScopedLogger {
	private logger: Logger;
	private module: string;
	private baseMeta?: Record<string, unknown>;

	constructor(logger: Logger, module: string, baseMeta?: Record<string, unknown>) {
		this.logger = logger;
		this.module = module;
		this.baseMeta = baseMeta;
	}

	private mergeMeta(meta?: unknown): unknown {
		if (!this.baseMeta) return meta;
		if (meta === undefined || meta === null) return this.baseMeta;
		if (typeof meta === "object" && !Array.isArray(meta)) {
			return { ...this.baseMeta, ...(meta as Record<string, unknown>) };
		}
		return meta;
	}

	debug(message: string, meta?: unknown): void {
		this.logger.debug(message, this.mergeMeta(meta), this.module);
	}

	info(message: string, meta?: unknown): void {
		this.logger.info(message, this.mergeMeta(meta), this.module);
	}

	warn(message: string, meta?: unknown): void {
		this.logger.warn(message, this.mergeMeta(meta), this.module);
	}

	error(message: string, error?: Error, meta?: unknown): void {
		this.logger.error(message, error, this.mergeMeta(meta), this.module);
	}

	/**
	 * Create a child scoped logger that inherits this context and adds more.
	 */
	withContext(subModule: string, extraMeta?: Record<string, unknown>): ScopedLogger {
		const childModule = `${this.module}:${subModule}`;
		const childMeta = extraMeta
			? { ...this.baseMeta, ...extraMeta }
			: this.baseMeta;
		return new ScopedLogger(this.logger, childModule, childMeta);
	}
}

// Create singleton instance with debug level and default module "App"
export const logger = new Logger({ level: LogLevel.DEBUG, defaultModule: "App" });
