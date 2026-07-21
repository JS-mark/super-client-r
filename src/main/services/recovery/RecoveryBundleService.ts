/**
 * RecoveryBundleService — combines the three existing archive exporters
 * (session / project / diagnostic) into one bundle directory tree with a
 * shared top-level manifest.
 *
 * Directory-only today; zip packaging is a separate follow-up. This keeps
 * the API stable — a future `packAsZip: true` option can wrap the same
 * directory tree without changing the contract.
 *
 * Composition strategy (chosen to avoid touching the three underlying
 * exporters):
 *   1. Bundle root = `<userRoot>/exports/bundles/<timestamp>/`
 *   2. For each requested session/project, call the existing exporter
 *      (writes to its own `<userRoot>/exports/<type>/<timestamp>/` dir),
 *      then `renameSync` the resulting dir INTO the bundle root under a
 *      predictable sub-path.
 *   3. If diagnostic is requested, `DiagnosticExportService.export()` +
 *      rename its output dir into `bundle/diagnostic/`.
 *   4. Write `bundle-manifest.json` listing every entry.
 *
 * Guards / edge cases:
 *   - Empty request (no sessions, no projects, no diagnostic) → throws.
 *   - `renameSync` is atomic on the same filesystem; if a rename fails the
 *     bundle dir is left in whatever partial state the exporters produced
 *     (subsequent calls create a new timestamped bundle root).
 *   - Refuses paths containing `..` in ids (the exporters already validate
 *     ids, but we defence-in-depth reject them here too).
 */
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
	RecoveryBundleEntry,
	RecoveryBundleExportOptions,
	RecoveryBundleExportResult,
	RecoveryBundleManifest,
} from "@super-client/shared-types/electron-api";
import type { DiagnosticExportService } from "../diagnostics/DiagnosticExportService";
import type { SessionStorageService } from "../storage/SessionStorageService";
import { packDirectoryToZip } from "./zipHelper";

export interface RecoveryBundleServiceDeps {
	userRoot: string;
	sessionStorage: Pick<
		SessionStorageService,
		"exportSessionArchive" | "exportProjectArchive"
	>;
	diagnosticExport: Pick<DiagnosticExportService, "export">;
	appVersion?: () => string | undefined;
	now?: () => Date;
	/**
	 * Injectable zip packer. Defaults to `packDirectoryToZip` (adm-zip
	 * dynamic require). Tests inject a stub to avoid pulling adm-zip at
	 * test time, and to assert the pack call with a controlled fs.
	 */
	packZip?: (sourceDir: string, targetZipPath: string) => void;
}

const SCHEMA_VERSION = 1 as const;

function safeTimestamp(iso: string): string {
	return iso.replace(/[:.]/g, "-");
}

function assertSafeId(id: string, label: string): void {
	if (!id || id.includes("/") || id.includes("\\") || id.includes("..")) {
		throw new Error(`refusing to bundle ${label} with unsafe id: ${id}`);
	}
}

export class RecoveryBundleService {
	constructor(private readonly deps: RecoveryBundleServiceDeps) {}

	exportBundle(
		options: RecoveryBundleExportOptions = {},
	): RecoveryBundleExportResult {
		const sessionIds = options.sessionIds ?? [];
		const projectIds = options.projectIds ?? [];
		const includeDiagnostic = options.includeDiagnostic === true;
		const includeChatContent = options.includeChatContent === true;

		if (
			sessionIds.length === 0 &&
			projectIds.length === 0 &&
			!includeDiagnostic
		) {
			throw new Error(
				"empty bundle: at least one session, project, or diagnostic must be requested",
			);
		}
		for (const sid of sessionIds) assertSafeId(sid, "session");
		for (const pid of projectIds) assertSafeId(pid, "project");

		const now = (this.deps.now ?? (() => new Date()))();
		const createdAt = now.toISOString();
		const bundleDir = join(
			this.deps.userRoot,
			"exports",
			"bundles",
			safeTimestamp(createdAt),
		);
		mkdirSync(bundleDir, { recursive: true });

		const entries: RecoveryBundleEntry[] = [];

		if (sessionIds.length > 0) {
			mkdirSync(join(bundleDir, "sessions"), { recursive: true });
			for (const sessionId of sessionIds) {
				const result = this.deps.sessionStorage.exportSessionArchive(
					sessionId,
					{
						...(options.appVersion !== undefined && {
							appVersion: options.appVersion,
						}),
						includeChatContent,
					},
				);
				const target = join(bundleDir, "sessions", sessionId);
				renameSync(result.exportDir, target);
				entries.push({
					kind: "session",
					id: sessionId,
					path: `sessions/${sessionId}`,
				});
			}
		}

		if (projectIds.length > 0) {
			mkdirSync(join(bundleDir, "projects"), { recursive: true });
			for (const projectId of projectIds) {
				const result = this.deps.sessionStorage.exportProjectArchive(
					projectId,
					{
						...(options.appVersion !== undefined && {
							appVersion: options.appVersion,
						}),
						includeChatContent,
					},
				);
				const target = join(bundleDir, "projects", projectId);
				renameSync(result.exportDir, target);
				entries.push({
					kind: "project",
					id: projectId,
					path: `projects/${projectId}`,
				});
			}
		}

		if (includeDiagnostic) {
			const result = this.deps.diagnosticExport.export();
			const target = join(bundleDir, "diagnostic");
			renameSync(result.exportDir, target);
			entries.push({
				kind: "diagnostic",
				id: "diagnostic",
				path: "diagnostic",
			});
		}

		const manifest: RecoveryBundleManifest = {
			schemaVersion: SCHEMA_VERSION,
			createdAt,
			...(options.appVersion !== undefined && { appVersion: options.appVersion }),
			includeChatContent,
			entries,
		};
		const manifestPath = join(bundleDir, "bundle-manifest.json");
		writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");

		// Optional zip pack: write `<bundleDir>.zip` and remove the source
		// directory. On failure (adm-zip missing / IO error), the packer
		// throws naturally and bundleDir stays on disk so the caller can
		// salvage as a directory export.
		let zipPath: string | undefined;
		if (options.packAsZip === true) {
			zipPath = `${bundleDir}.zip`;
			const packer = this.deps.packZip ?? packDirectoryToZip;
			packer(bundleDir, zipPath);
			rmSync(bundleDir, { recursive: true, force: true });
		}

		return {
			bundleDir,
			manifestPath,
			manifest,
			...(zipPath !== undefined && { zipPath }),
		};
	}
}
