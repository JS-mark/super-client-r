// @vitest-environment node

import { existsSync, readFileSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

describe("RecoveryBundleService packAsZip", () => {
	// These tests inject a stub packZip so they don't require adm-zip to be
	// installed. The stub records the invocation and touches the target
	// path so the "source dir removed after pack" flow is observable.
	function makeBundle(packZip: (src: string, tgt: string) => void) {
		return new RecoveryBundleService({
			userRoot: sessions.getUserRoot(),
			sessionStorage: sessions,
			diagnosticExport: diagnostic,
			appVersion: () => "0.0.0-test",
			packZip,
		});
	}

	it("packs the bundle dir into a zip and removes the source dir", () => {
		const s = sessions.create({ projectId: null });
		const packSpy = vi.fn((_src: string, targetZip: string) => {
			// Stand in for adm-zip's writeZip: create an empty file at
			// the target path so callers relying on existsSync see it.
			require("node:fs").writeFileSync(targetZip, "STUB-ZIP", "utf-8");
		});
		const b = makeBundle(packSpy);
		const result = b.exportBundle({
			sessionIds: [s.id],
			packAsZip: true,
		});
		expect(packSpy).toHaveBeenCalledOnce();
		expect(packSpy).toHaveBeenCalledWith(
			result.bundleDir,
			`${result.bundleDir}.zip`,
		);
		expect(result.zipPath).toBe(`${result.bundleDir}.zip`);
		expect(existsSync(result.zipPath!)).toBe(true);
		// Source dir removed after pack.
		expect(existsSync(result.bundleDir)).toBe(false);
	});

	it("does NOT pack or remove the source dir when packAsZip is falsy", () => {
		const s = sessions.create({ projectId: null });
		const packSpy = vi.fn();
		const b = makeBundle(packSpy);
		const result = b.exportBundle({ sessionIds: [s.id] });
		expect(packSpy).not.toHaveBeenCalled();
		expect(result.zipPath).toBeUndefined();
		expect(existsSync(result.bundleDir)).toBe(true);
	});

	it("leaves the bundle dir intact when the pack throws", () => {
		const s = sessions.create({ projectId: null });
		const packSpy = vi.fn(() => {
			throw new Error("adm-zip missing");
		});
		const b = makeBundle(packSpy);
		let caught: unknown;
		let capturedBundleDir: string | undefined;
		try {
			// Peek at the bundleDir via a Proxy would be ideal; simpler:
			// just look for the freshly-created dir under exports/bundles/.
			b.exportBundle({ sessionIds: [s.id], packAsZip: true });
		} catch (error) {
			caught = error;
		}
		expect(caught).toBeInstanceOf(Error);
		expect((caught as Error).message).toContain("adm-zip missing");
		// One bundle dir was created before the failed pack; it must still
		// exist so the caller can salvage as a directory export.
		const bundlesRoot = join(sessions.getUserRoot(), "exports", "bundles");
		const listed = existsSync(bundlesRoot)
			? require("node:fs").readdirSync(bundlesRoot)
			: [];
		expect(listed.length).toBeGreaterThan(0);
		capturedBundleDir = join(bundlesRoot, listed[0]);
		expect(existsSync(capturedBundleDir)).toBe(true);
		// Source data still there.
		expect(
			existsSync(join(capturedBundleDir, "bundle-manifest.json")),
		).toBe(true);
	});
});
