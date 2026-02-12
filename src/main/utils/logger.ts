/**
 * Logger Utility
 * Provides structured logging with multiple levels and file output
 */

import { app } from "electron";
import {
	appendFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
	unlinkSync,
} from "fs";
import { join } from "path";
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
	logDir: string;
	maxFiles: number; // Maximum number of log files to keep
	maxSize: number; // Maximum size per file in bytes
	console: boolean;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
	[LogLevel.DEBUG]: 0,
	[LogLevel.INFO]: 1,
	[LogLevel.WARN]: 2,
	[LogLevel.ERROR]: 3,
};

export class Logger {
	private config: LoggerConfig;
	private currentFile: string | null = null;
	private currentSize: number = 0;
	private initialized: boolean = false;

	constructor(config: Partial<LoggerConfig> = {}) {
		this.config = {
			level: LogLevel.INFO,
			logDir: "",
			maxFiles: 7,
			maxSize: 10 * 1024 * 1024, // 10MB
			console: true,
			...config,
		};
	}

	/**
	 * Initialize logger with Electron app path
	 */
	private ensureInitialized(): void {
		if (this.initialized) return;

		// Set log directory
		if (!this.config.logDir) {
			const userDataPath = app.getPath("userData");
			this.config.logDir = join(userDataPath, "logs");
		}

		// Create logs directory if not exists
		if (!existsSync(this.config.logDir)) {
			mkdirSync(this.config.logDir, { recursive: true });
		}

		// Rotate to today's log file
		this.rotateLogFile();

		this.initialized = true;
	}

	/**
	 * Get current date string for filename
	 */
	private getDateString(): string {
		const now = new Date();
		return now.toISOString().split("T")[0];
	}

	/**
	 * Rotate log file based on date
	 */
	private rotateLogFile(): void {
		const dateStr = this.getDateString();
		const newFile = join(this.config.logDir, `app-${dateStr}.log`);

		if (this.currentFile !== newFile) {
			this.currentFile = newFile;
			this.currentSize = existsSync(newFile) ? statSync(newFile).size : 0;
		}
	}

	/**
	 * Format log entry to UTF-8 string
	 */
	private formatEntry(entry: LogEntry): string {
		const { timestamp, level, message, module, meta, error } = entry;
		let line = `[${timestamp}] [${level}]`;

		if (module) {
			line += ` [${module}]`;
		}

		line += ` ${message}`;

		if (meta !== undefined) {
			line += ` ${JSON.stringify(meta)}`;
		}

		if (error) {
			line += `\n  Error: ${error.message}`;
			if (error.stack) {
				line += `\n  ${error.stack.split("\n").join("\n  ")}`;
			}
		}

		return line + "\n";
	}

	/**
	 * Write log entry to file with UTF-8 encoding and SQLite database
	 */
	private write(entry: LogEntry): void {
		this.ensureInitialized();
		this.rotateLogFile();

		if (!this.currentFile) return;

		// Check file size rotation
		const content = this.formatEntry(entry);
		const contentSize = Buffer.byteLength(content, "utf8");

		if (this.currentSize + contentSize > this.config.maxSize) {
			// Create new file with timestamp suffix
			const timestamp = Date.now();
			this.currentFile = this.currentFile.replace(
				".log",
				`-${timestamp}.log`,
			);
			this.currentSize = 0;
		}

		// Write with UTF-8 encoding explicitly
		try {
			appendFileSync(this.currentFile, content, { encoding: "utf8" });
			this.currentSize += contentSize;
		} catch (err) {
			console.error("Failed to write log:", err instanceof Error ? err.message : String(err));
		}

		// Dual-write to SQLite database (never let DB errors break file logging)
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
			module: options.module,
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
	 * Get log directory path
	 */
	getLogDir(): string {
		this.ensureInitialized();
		return this.config.logDir;
	}

	/**
	 * Get current log file path
	 */
	getLogFile(): string {
		this.ensureInitialized();
		this.rotateLogFile();
		return this.currentFile || "";
	}

	/**
	 * Get recent log content
	 */
	getRecentLogs(lines: number = 100): string {
		this.ensureInitialized();
		this.rotateLogFile();

		if (!this.currentFile || !existsSync(this.currentFile)) {
			return "";
		}

		try {
			const content = readFileSync(this.currentFile, "utf8");
			const allLines = content.split("\n");
			return allLines.slice(-lines).join("\n");
		} catch (err) {
			return `Error reading logs: ${err}`;
		}
	}

	/**
	 * Get all log files
	 */
	getLogFiles(): { name: string; size: number; modified: number }[] {
		this.ensureInitialized();

		try {
			return readdirSync(this.config.logDir)
				.filter((f) => f.endsWith(".log"))
				.map((f) => {
					const stat = statSync(join(this.config.logDir, f));
					return {
						name: f,
						size: stat.size,
						modified: stat.mtime.getTime(),
					};
				})
				.sort((a, b) => b.modified - a.modified);
		} catch (err) {
			return [];
		}
	}

	/**
	 * Get logs content by filename
	 */
	getLogContent(filename: string): string {
		this.ensureInitialized();

		const filePath = join(this.config.logDir, filename);

		// Security check: ensure file is within log directory
		if (!filePath.startsWith(this.config.logDir)) {
			return "Invalid filename";
		}

		if (!existsSync(filePath)) {
			return "";
		}

		try {
			return readFileSync(filePath, "utf8");
		} catch (err) {
			return `Error reading log file: ${err}`;
		}
	}

	/**
	 * Clear all logs
	 */
	clearLogs(): void {
		this.ensureInitialized();

		try {
			const files = readdirSync(this.config.logDir).filter((f) =>
				f.endsWith(".log"),
			);
			for (const file of files) {
				unlinkSync(join(this.config.logDir, file));
			}
			this.info("All logs cleared", undefined, "Logger");
			this.currentSize = 0;
		} catch (err) {
			console.error("Failed to clear logs:", err instanceof Error ? err.message : String(err));
		}
	}
}

// Create singleton instance with debug level
export const logger = new Logger({ level: LogLevel.DEBUG });
