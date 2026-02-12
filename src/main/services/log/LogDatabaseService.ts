/**
 * Log Database Service
 * SQLite-backed structured log storage using better-sqlite3
 */

import { app } from "electron";
import { EventEmitter } from "events";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
} from "fs";
import { join } from "path";
import Database from "better-sqlite3";
import type BetterSqlite3 from "better-sqlite3";

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

export interface LogInsertEntry {
	timestamp: string;
	level: string;
	module?: string;
	process?: string;
	message: string;
	meta?: unknown;
	error_message?: string;
	error_stack?: string;
	session_id?: string;
}

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

const MAX_ROWS = 100_000;
const PRUNE_BATCH = 10_000;

export class LogDatabaseService extends EventEmitter {
	private db: BetterSqlite3.Database | null = null;
	private insertStmt: BetterSqlite3.Statement | null = null;
	private initialized = false;
	private dbPath = "";

	initialize(): void {
		if (this.initialized) return;

		const userDataPath = app.getPath("userData");
		const logDir = join(userDataPath, "logs");

		if (!existsSync(logDir)) {
			mkdirSync(logDir, { recursive: true });
		}

		this.dbPath = join(logDir, "logs.db");

		try {
			this.db = new Database(this.dbPath);

			// WAL mode for concurrent reads during writes
			this.db.pragma("journal_mode = WAL");
			this.db.pragma("synchronous = NORMAL");

			this.createTables();
			this.prepareStatements();
			this.initialized = true;
			this.emit("initialized");

			// Background migration from flat files
			this.migrateExistingLogs(logDir);
		} catch (error) {
			console.error("Failed to initialize LogDatabaseService:", error);
		}
	}

	private createTables(): void {
		if (!this.db) return;

		this.db.exec(`
			CREATE TABLE IF NOT EXISTS logs (
				id           INTEGER PRIMARY KEY AUTOINCREMENT,
				timestamp    TEXT NOT NULL,
				timestamp_ms INTEGER NOT NULL,
				level        TEXT NOT NULL,
				module       TEXT DEFAULT '',
				process      TEXT NOT NULL DEFAULT 'main',
				message      TEXT NOT NULL,
				meta         TEXT,
				error_message TEXT,
				error_stack  TEXT,
				session_id   TEXT
			);

			CREATE INDEX IF NOT EXISTS idx_logs_timestamp_ms ON logs(timestamp_ms);
			CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level);
			CREATE INDEX IF NOT EXISTS idx_logs_module ON logs(module);
			CREATE INDEX IF NOT EXISTS idx_logs_process ON logs(process);
		`);

		// FTS5 table for keyword search
		const ftsExists = this.db
			.prepare(
				"SELECT name FROM sqlite_master WHERE type='table' AND name='logs_fts'",
			)
			.get();

		if (!ftsExists) {
			this.db.exec(`
				CREATE VIRTUAL TABLE logs_fts USING fts5(
					message, meta, error_message,
					content='logs', content_rowid='id'
				);

				CREATE TRIGGER IF NOT EXISTS logs_ai AFTER INSERT ON logs BEGIN
					INSERT INTO logs_fts(rowid, message, meta, error_message)
					VALUES (new.id, new.message, new.meta, new.error_message);
				END;

				CREATE TRIGGER IF NOT EXISTS logs_ad AFTER DELETE ON logs BEGIN
					INSERT INTO logs_fts(logs_fts, rowid, message, meta, error_message)
					VALUES ('delete', old.id, old.message, old.meta, old.error_message);
				END;
			`);
		}
	}

	private prepareStatements(): void {
		if (!this.db) return;

		this.insertStmt = this.db.prepare(`
			INSERT INTO logs (timestamp, timestamp_ms, level, module, process, message, meta, error_message, error_stack, session_id)
			VALUES (@timestamp, @timestamp_ms, @level, @module, @process, @message, @meta, @error_message, @error_stack, @session_id)
		`);
	}

	insert(entry: LogInsertEntry): void {
		if (!this.insertStmt) return;

		try {
			const timestampMs = new Date(entry.timestamp).getTime();
			this.insertStmt.run({
				timestamp: entry.timestamp,
				timestamp_ms: timestampMs,
				level: entry.level,
				module: entry.module || "",
				process: entry.process || "main",
				message: entry.message,
				meta: entry.meta ? JSON.stringify(entry.meta) : null,
				error_message: entry.error_message || null,
				error_stack: entry.error_stack || null,
				session_id: entry.session_id || null,
			});
		} catch (error) {
			console.error("Failed to insert log entry:", error);
		}
	}

	query(params: LogQueryParams): LogQueryResult {
		if (!this.db) {
			return { records: [], total: 0, page: 1, pageSize: 50, totalPages: 0 };
		}

		const page = params.page || 1;
		const pageSize = params.pageSize || 50;
		const sortOrder = params.sortOrder || "desc";

		const conditions: string[] = [];
		const bindings: Record<string, unknown> = {};

		if (params.level?.length) {
			const placeholders = params.level.map((_, i) => `@level_${i}`);
			conditions.push(`level IN (${placeholders.join(",")})`);
			params.level.forEach((l, i) => {
				bindings[`level_${i}`] = l;
			});
		}

		if (params.module?.length) {
			const placeholders = params.module.map((_, i) => `@module_${i}`);
			conditions.push(`module IN (${placeholders.join(",")})`);
			params.module.forEach((m, i) => {
				bindings[`module_${i}`] = m;
			});
		}

		if (params.process?.length) {
			const placeholders = params.process.map((_, i) => `@process_${i}`);
			conditions.push(`process IN (${placeholders.join(",")})`);
			params.process.forEach((p, i) => {
				bindings[`process_${i}`] = p;
			});
		}

		if (params.startTime) {
			conditions.push("timestamp_ms >= @startTime");
			bindings.startTime = params.startTime;
		}

		if (params.endTime) {
			conditions.push("timestamp_ms <= @endTime");
			bindings.endTime = params.endTime;
		}

		let usesFts = false;
		if (params.keyword?.trim()) {
			usesFts = true;
			conditions.push(
				"logs.id IN (SELECT rowid FROM logs_fts WHERE logs_fts MATCH @keyword)",
			);
			// Escape FTS special chars and wrap in quotes for phrase search
			bindings.keyword = params.keyword
				.replace(/['"]/g, "")
				.split(/\s+/)
				.filter(Boolean)
				.map((w) => `"${w}"`)
				.join(" OR ");
		}

		const whereClause =
			conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

		const countSql = `SELECT COUNT(*) as total FROM logs ${whereClause}`;
		const countResult = this.db.prepare(countSql).get(bindings) as {
			total: number;
		};
		const total = countResult.total;
		const totalPages = Math.ceil(total / pageSize);

		const offset = (page - 1) * pageSize;
		const dataSql = `SELECT * FROM logs ${whereClause} ORDER BY timestamp_ms ${sortOrder} LIMIT @limit OFFSET @offset`;
		const records = this.db
			.prepare(dataSql)
			.all({ ...bindings, limit: pageSize, offset }) as LogRecord[];

		return { records, total, page, pageSize, totalPages };
	}

	getStats(): LogStats {
		if (!this.db) {
			return {
				totalCount: 0,
				countByLevel: {},
				countByModule: {},
				countByProcess: {},
				recentErrorCount: 0,
				timeHistogram: [],
			};
		}

		const totalCount = (
			this.db.prepare("SELECT COUNT(*) as c FROM logs").get() as { c: number }
		).c;

		const byLevel = this.db
			.prepare(
				"SELECT level, COUNT(*) as c FROM logs GROUP BY level",
			)
			.all() as { level: string; c: number }[];
		const countByLevel: Record<string, number> = {};
		for (const row of byLevel) countByLevel[row.level] = row.c;

		const byModule = this.db
			.prepare(
				"SELECT module, COUNT(*) as c FROM logs WHERE module != '' GROUP BY module ORDER BY c DESC LIMIT 20",
			)
			.all() as { module: string; c: number }[];
		const countByModule: Record<string, number> = {};
		for (const row of byModule) countByModule[row.module] = row.c;

		const byProcess = this.db
			.prepare(
				"SELECT process, COUNT(*) as c FROM logs GROUP BY process",
			)
			.all() as { process: string; c: number }[];
		const countByProcess: Record<string, number> = {};
		for (const row of byProcess) countByProcess[row.process] = row.c;

		const oneHourAgo = Date.now() - 3600_000;
		const recentErrorCount = (
			this.db
				.prepare(
					"SELECT COUNT(*) as c FROM logs WHERE level = 'ERROR' AND timestamp_ms >= ?",
				)
				.get(oneHourAgo) as { c: number }
		).c;

		const histogram = this.db
			.prepare(
				`SELECT substr(timestamp, 1, 13) as hour, COUNT(*) as count
				 FROM logs
				 WHERE timestamp_ms >= ?
				 GROUP BY hour
				 ORDER BY hour`,
			)
			.all(Date.now() - 86400_000) as { hour: string; count: number }[];

		return {
			totalCount,
			countByLevel,
			countByModule,
			countByProcess,
			recentErrorCount,
			timeHistogram: histogram,
		};
	}

	getModules(): string[] {
		if (!this.db) return [];

		const rows = this.db
			.prepare(
				"SELECT DISTINCT module FROM logs WHERE module != '' ORDER BY module",
			)
			.all() as { module: string }[];

		return rows.map((r) => r.module);
	}

	clear(): void {
		if (!this.db) return;

		this.db.exec("DELETE FROM logs");
		this.db.exec("DELETE FROM logs_fts");
		this.emit("cleared");
	}

	exportToFile(
		params: LogQueryParams,
		filePath: string,
	): { count: number } {
		const allParams = { ...params, page: 1, pageSize: MAX_ROWS };
		const result = this.query(allParams);

		const { writeFileSync } = require("fs");
		writeFileSync(filePath, JSON.stringify(result.records, null, 2), "utf8");

		return { count: result.records.length };
	}

	pruneOldLogs(): void {
		if (!this.db) return;

		const count = (
			this.db.prepare("SELECT COUNT(*) as c FROM logs").get() as { c: number }
		).c;

		if (count > MAX_ROWS) {
			const deleteCount = count - MAX_ROWS + PRUNE_BATCH;
			this.db.exec(
				`DELETE FROM logs WHERE id IN (SELECT id FROM logs ORDER BY timestamp_ms ASC LIMIT ${deleteCount})`,
			);
			this.emit("pruned", deleteCount);
		}
	}

	close(): void {
		if (this.db) {
			this.db.close();
			this.db = null;
			this.insertStmt = null;
			this.initialized = false;
		}
	}

	/**
	 * Migrate existing .log files into the database (background, non-blocking)
	 */
	private migrateExistingLogs(logDir: string): void {
		if (!this.db) return;

		const count = (
			this.db.prepare("SELECT COUNT(*) as c FROM logs").get() as { c: number }
		).c;

		// Only migrate if DB is empty
		if (count > 0) return;

		const logFiles = readdirSync(logDir)
			.filter((f) => f.endsWith(".log"))
			.sort();

		if (logFiles.length === 0) return;

		// Parse log files in background batches
		setImmediate(() => {
			try {
				const insertMany = this.db!.transaction(
					(entries: LogInsertEntry[]) => {
						for (const entry of entries) {
							this.insert(entry);
						}
					},
				);

				for (const file of logFiles) {
					const content = readFileSync(join(logDir, file), "utf8");
					const entries = this.parseLogFile(content);
					if (entries.length > 0) {
						insertMany(entries);
					}
				}

				this.pruneOldLogs();
				this.emit("migration-complete");
			} catch (error) {
				console.error("Log migration failed:", error);
			}
		});
	}

	private parseLogFile(content: string): LogInsertEntry[] {
		const entries: LogInsertEntry[] = [];
		const lines = content.split("\n");
		// Pattern: [2025-01-01T00:00:00.000Z] [LEVEL] [Module] message
		const lineRegex =
			/^\[([^\]]+)\]\s+\[(\w+)\](?:\s+\[([^\]]*)\])?\s+(.*)$/;

		let currentEntry: LogInsertEntry | null = null;
		let errorLines: string[] = [];

		for (const line of lines) {
			const match = line.match(lineRegex);
			if (match) {
				// Save previous entry
				if (currentEntry) {
					if (errorLines.length > 0) {
						const errText = errorLines.join("\n");
						const errMatch = errText.match(/^\s*Error:\s*(.*)/);
						if (errMatch) {
							currentEntry.error_message = errMatch[1];
							currentEntry.error_stack = errText;
						}
					}
					entries.push(currentEntry);
				}

				currentEntry = {
					timestamp: match[1],
					level: match[2],
					module: match[3] || "",
					process: "main",
					message: match[4],
				};
				errorLines = [];
			} else if (currentEntry && line.trim()) {
				errorLines.push(line);
			}
		}

		// Push last entry
		if (currentEntry) {
			if (errorLines.length > 0) {
				const errText = errorLines.join("\n");
				const errMatch = errText.match(/^\s*Error:\s*(.*)/);
				if (errMatch) {
					currentEntry.error_message = errMatch[1];
					currentEntry.error_stack = errText;
				}
			}
			entries.push(currentEntry);
		}

		return entries;
	}
}

// Singleton export
export const logDatabaseService = new LogDatabaseService();
