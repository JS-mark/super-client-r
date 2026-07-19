import {
	existsSync,
	mkdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AgentTraceSummary } from "@super-client/shared-types/agent-trace";
import type { SessionMeta } from "@super-client/shared-types/project";
import type {
	DiagnosticExportFileEntry,
	DiagnosticExportManifest,
	DiagnosticExportRedactionMode,
	DiagnosticExportResult,
} from "@super-client/shared-types/electron-api";
import {
	redactDiagnosticValue,
	redactPath,
	type PrivacyRedactionContext,
} from "../privacy/redaction";
import type { AgentTraceCollector } from "../agent/trace/AgentTraceCollector";
import type { SessionStorageService } from "../storage/SessionStorageService";

// Re-export the canonical shared-types contracts so existing importers
// (e.g. IPC handlers inferring from the service return type) keep working
// without tracking the type's source.
export type {
	DiagnosticExportFileEntry,
	DiagnosticExportManifest,
	DiagnosticExportRedactionMode,
	DiagnosticExportResult,
};

export interface DiagnosticSessionEntry {
	sessionId: string;
	projectId: string | null;
	createdAt?: number;
	updatedAt?: number;
	messageCount: number;
	chatMode?: string;
	storageRoot?: string;
	storageFallbackReason?: string;
	corrupted?: boolean;
}

export interface DiagnosticExportDocument {
	schemaVersion: 1;
	createdAt: string;
	appVersion: string;
	redactionMode: DiagnosticExportRedactionMode;
	privacy: {
		chatContentIncluded: false;
		attachmentsIncluded: false;
		toolPayloadsIncluded: false;
		jsonlCopied: false;
	};
	sessions: {
		total: number;
		byProjectId: Record<string, number>;
		items: DiagnosticSessionEntry[];
	};
	traces?: {
		total: number;
		items: Array<Omit<AgentTraceSummary, "promptPreview">>;
	};
}

export interface DiagnosticExportServiceOptions {
	appUserDataDir: string;
	sessionStorage: Pick<SessionStorageService, "listAll">;
	traceCollector?: Pick<AgentTraceCollector, "list">;
	appVersion?: string;
	now?: () => Date;
}

const SCHEMA_VERSION = 1;
const REDACTION_MODE: DiagnosticExportRedactionMode = "home-and-app-data";
const DIAGNOSTIC_FILE_NAME = "diagnostic.json";
const PROJECTLESS_KEY = "<none>";

export class DiagnosticExportService {
	private readonly redactionContext: PrivacyRedactionContext;

	constructor(private readonly options: DiagnosticExportServiceOptions) {
		this.redactionContext = {
			appUserDataDir: options.appUserDataDir,
			homeDir: homedir(),
		};
	}

	export(): DiagnosticExportResult {
		const createdAt = this.now().toISOString();
		const exportDir = join(
			this.options.appUserDataDir,
			"exports",
			"diagnostics",
			safeTimestamp(createdAt),
		);
		mkdirSync(exportDir, { recursive: true });

		const diagnostic = this.buildDiagnostic(createdAt);
		const diagnosticPath = join(exportDir, DIAGNOSTIC_FILE_NAME);
		writeJson(diagnosticPath, diagnostic);

		const manifestPath = join(exportDir, "manifest.json");
		const manifest: DiagnosticExportManifest = {
			schemaVersion: SCHEMA_VERSION,
			createdAt,
			appVersion: this.appVersion(),
			redactionMode: REDACTION_MODE,
			exportDir: redactPath(exportDir, this.redactionContext),
			files: [
				{ path: "manifest.json", kind: "manifest" },
				fileEntry(diagnosticPath, DIAGNOSTIC_FILE_NAME, "diagnostic-json"),
			],
		};
		writeJson(manifestPath, manifest);

		return {
			exportDir,
			manifestPath,
			diagnosticPath,
			manifest,
		};
	}

	private buildDiagnostic(createdAt: string): DiagnosticExportDocument {
		const sessions = this.options.sessionStorage
			.listAll()
			.map((meta) => this.sessionEntry(meta));
		const diagnostic: DiagnosticExportDocument = {
			schemaVersion: SCHEMA_VERSION,
			createdAt,
			appVersion: this.appVersion(),
			redactionMode: REDACTION_MODE,
			privacy: {
				chatContentIncluded: false,
				attachmentsIncluded: false,
				toolPayloadsIncluded: false,
				jsonlCopied: false,
			},
			sessions: {
				total: sessions.length,
				byProjectId: countByProjectId(sessions),
				items: sessions,
			},
			...this.traceSummary(),
		};
		return redactDiagnosticValue(
			diagnostic,
			this.redactionContext,
		) as DiagnosticExportDocument;
	}

	private sessionEntry(meta: SessionMeta): DiagnosticSessionEntry {
		return {
			sessionId: meta.id,
			projectId: meta.projectId,
			createdAt: meta.createdAt,
			updatedAt: meta.updatedAt,
			messageCount: meta.messageCount,
			chatMode: meta.chatMode,
			storageRoot: meta.storageRoot,
			storageFallbackReason: meta.storageFallbackReason,
			corrupted: meta.corrupted,
		};
	}

	private traceSummary(): Pick<DiagnosticExportDocument, "traces"> {
		const summaries = this.options.traceCollector?.list({ limit: 50 }) ?? [];
		if (summaries.length === 0) return {};
		return {
			traces: {
				total: summaries.length,
				items: summaries.map(
					({ promptPreview: _promptPreview, ...rest }) => rest,
				),
			},
		};
	}

	private appVersion(): string {
		return this.options.appVersion ?? "unknown";
	}

	private now(): Date {
		return this.options.now?.() ?? new Date();
	}
}

function countByProjectId(
	sessions: DiagnosticSessionEntry[],
): Record<string, number> {
	const counts: Record<string, number> = {};
	for (const session of sessions) {
		const key = session.projectId ?? PROJECTLESS_KEY;
		counts[key] = (counts[key] ?? 0) + 1;
	}
	return counts;
}

function writeJson(path: string, value: unknown): void {
	writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function fileEntry(
	filePath: string,
	archivePath: string,
	kind: DiagnosticExportFileEntry["kind"],
): DiagnosticExportFileEntry {
	if (!existsSync(filePath)) {
		return { path: archivePath, kind };
	}
	const data = readFileSync(filePath);
	return {
		path: archivePath,
		kind,
		byteLength: statSync(filePath).size,
		sha256: createHash("sha256").update(data).digest("hex"),
	};
}

function safeTimestamp(value: string): string {
	return value.replace(/[:.]/g, "-");
}
