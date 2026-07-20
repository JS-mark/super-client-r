// @vitest-environment node

import { existsSync, readFileSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProjectStorageService } from "../../storage/ProjectStorageService";
import { SessionStorageService } from "../../storage/SessionStorageService";
import { DiagnosticExportService } from "../../diagnostics/DiagnosticExportService";
import { RecoveryBundleService } from "../RecoveryBundleService";

let baseDir: string;
let projects: ProjectStorageService;
let sessions: SessionStorageService;
let diagnostic: DiagnosticExportService;
let bundle: RecoveryBundleService;

beforeEach(() => {
	baseDir = mkdtempSync(join(tmpdir(), "super-client-bundle-"));
	projects = new ProjectStorageService(baseDir, "default");
	sessions = new SessionStorageService(baseDir, "default", projects);
	diagnostic = new DiagnosticExportService({
		appUserDataDir: baseDir,
		sessionStorage: sessions,
		appVersion: "0.0.0-test",
	});
	bundle = new RecoveryBundleService({
		userRoot: sessions.getUserRoot(),
		sessionStorage: sessions,
		diagnosticExport: diagnostic,
		appVersion: () => "0.0.0-test",
	});
});

afterEach(() => {
	rmSync(baseDir, { recursive: true, force: true });
});

describe("RecoveryBundleService", () => {
	it("exports a bundle containing a session archive + diagnostic + manifest", () => {
		const s = sessions.create({ projectId: null });
		sessions.appendEvent(s.id, {
			type: "user_message",
			id: "u1",
			ts: 1,
			content: "hi",
		});

		const result = bundle.exportBundle({
			sessionIds: [s.id],
			includeDiagnostic: true,
			appVersion: "0.0.0-test",
		});

		// Bundle dir + manifest exist.
		expect(existsSync(result.bundleDir)).toBe(true);
		expect(existsSync(result.manifestPath)).toBe(true);
		// Session archive was moved into bundle/sessions/<sid>/.
		const sessionEntry = join(result.bundleDir, "sessions", s.id);
		expect(existsSync(sessionEntry)).toBe(true);
		expect(existsSync(join(sessionEntry, "manifest.json"))).toBe(true);
		// Diagnostic snapshot was moved into bundle/diagnostic/.
		const diagnosticEntry = join(result.bundleDir, "diagnostic");
		expect(existsSync(diagnosticEntry)).toBe(true);
		// Top-level manifest lists both entries.
		const manifest = JSON.parse(readFileSync(result.manifestPath, "utf-8"));
		expect(manifest.schemaVersion).toBe(1);
		expect(manifest.appVersion).toBe("0.0.0-test");
		expect(manifest.includeChatContent).toBe(false);
		expect(manifest.entries).toHaveLength(2);
		const kinds = manifest.entries.map(
			(e: { kind: string }) => e.kind,
		);
		expect(kinds).toContain("session");
		expect(kinds).toContain("diagnostic");
	});

	it("supports selective bundles (sessions only, no diagnostic)", () => {
		const s = sessions.create({ projectId: null });
		const result = bundle.exportBundle({
			sessionIds: [s.id],
			includeDiagnostic: false,
		});
		expect(result.manifest.entries).toHaveLength(1);
		expect(result.manifest.entries[0].kind).toBe("session");
		expect(existsSync(join(result.bundleDir, "diagnostic"))).toBe(false);
	});

	it("supports project archives in the bundle", () => {
		const projectCwd = mkdtempSync(join(tmpdir(), "bundle-project-"));
		try {
			const p = projects.add(projectCwd);
			const result = bundle.exportBundle({
				projectIds: [p.id],
				includeDiagnostic: false,
			});
			expect(result.manifest.entries).toHaveLength(1);
			expect(result.manifest.entries[0]).toMatchObject({
				kind: "project",
				id: p.id,
				path: `projects/${p.id}`,
			});
			expect(
				existsSync(join(result.bundleDir, "projects", p.id, "manifest.json")),
			).toBe(true);
		} finally {
			rmSync(projectCwd, { recursive: true, force: true });
		}
	});

	it("refuses an empty request (no sessions, projects, or diagnostic)", () => {
		expect(() => bundle.exportBundle({})).toThrow(/empty bundle/);
		expect(() =>
			bundle.exportBundle({ sessionIds: [], projectIds: [] }),
		).toThrow(/empty bundle/);
	});

	it("refuses unsafe session/project ids", () => {
		expect(() =>
			bundle.exportBundle({ sessionIds: ["../etc"] }),
		).toThrow(/unsafe/);
		expect(() =>
			bundle.exportBundle({ projectIds: ["foo/bar"] }),
		).toThrow(/unsafe/);
	});
});
