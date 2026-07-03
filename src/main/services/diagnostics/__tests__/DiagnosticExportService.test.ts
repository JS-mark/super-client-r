// @vitest-environment node

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProjectStorageService } from "../../storage/ProjectStorageService";
import { SessionStorageService } from "../../storage/SessionStorageService";
import { DiagnosticExportService } from "../DiagnosticExportService";

let baseDir: string;
let projectDir: string;
let projects: ProjectStorageService;
let sessions: SessionStorageService;

beforeEach(() => {
	baseDir = mkdtempSync(join(tmpdir(), "super-client-diagnostics-"));
	projectDir = mkdtempSync(join(tmpdir(), "super-client-project-secret-"));
	projects = new ProjectStorageService(baseDir, "default");
	sessions = new SessionStorageService(baseDir, "default", projects);
});

afterEach(() => {
	rmSync(baseDir, { recursive: true, force: true });
	rmSync(projectDir, { recursive: true, force: true });
});

describe("DiagnosticExportService", () => {
	it("exports redacted diagnostics without chat content by default", () => {
		const project = projects.add(projectDir);
		const session = sessions.create({ projectId: project.id });
		sessions.appendEvent(session.id, {
			type: "user_message",
			id: "u1",
			ts: 1,
			content: "USER_SECRET_PROMPT with /raw/home/path and attachment words",
			attachmentIds: ["attachment-secret-id"],
		});
		sessions.appendEvent(session.id, {
			type: "assistant_message",
			id: "a1",
			ts: 2,
			content: "ASSISTANT_SECRET_RESPONSE",
		});
		sessions.appendEvent(session.id, {
			type: "tool_call",
			id: "tool1",
			parentId: "a1",
			ts: 3,
			name: "secretTool",
			input: {
				payload: "TOOL_SECRET_INPUT",
				cwd: projectDir,
			},
		});
		sessions.appendEvent(session.id, {
			type: "tool_result",
			toolCallId: "tool1",
			ts: 4,
			output: "TOOL_SECRET_OUTPUT",
		});

		const result = new DiagnosticExportService({
			appUserDataDir: baseDir,
			sessionStorage: sessions,
			appVersion: "test-version",
			now: () => new Date("2026-07-01T01:02:03.004Z"),
		}).export();

		expect(result.exportDir).toBe(
			join(baseDir, "exports", "diagnostics", "2026-07-01T01-02-03-004Z"),
		);
		expect(existsSync(result.manifestPath)).toBe(true);
		expect(existsSync(result.diagnosticPath)).toBe(true);
		expect(readdirSync(result.exportDir).sort()).toEqual([
			"diagnostic.json",
			"manifest.json",
		]);

		const manifestText = readFileSync(result.manifestPath, "utf-8");
		const diagnosticText = readFileSync(result.diagnosticPath, "utf-8");
		const combined = `${manifestText}\n${diagnosticText}`;
		expect(combined).not.toContain("USER_SECRET_PROMPT");
		expect(combined).not.toContain("ASSISTANT_SECRET_RESPONSE");
		expect(combined).not.toContain("TOOL_SECRET_INPUT");
		expect(combined).not.toContain("TOOL_SECRET_OUTPUT");
		expect(combined).not.toContain("attachment-secret-id");
		expect(combined).not.toContain(projectDir);
		expect(combined).not.toContain(baseDir);
		expect(combined).not.toContain(".jsonl");
		expect(combined).not.toContain(".scr-data");

		const manifest = JSON.parse(manifestText) as {
			schemaVersion: number;
			createdAt: string;
			redactionMode: string;
			exportDir: string;
		};
		expect(manifest.schemaVersion).toBe(1);
		expect(manifest.createdAt).toBe("2026-07-01T01:02:03.004Z");
		expect(manifest.redactionMode).toBe("home-and-app-data");
		expect(manifest.exportDir).toBe(
			"<app-data>/exports/diagnostics/2026-07-01T01-02-03-004Z",
		);

		const diagnostic = JSON.parse(diagnosticText) as {
			schemaVersion: number;
			createdAt: string;
			redactionMode: string;
			privacy: {
				chatContentIncluded: boolean;
				attachmentsIncluded: boolean;
				toolPayloadsIncluded: boolean;
				jsonlCopied: boolean;
			};
			sessions: {
				total: number;
				items: Array<{ sessionId: string; messageCount: number }>;
			};
		};
		expect(diagnostic.schemaVersion).toBe(1);
		expect(diagnostic.createdAt).toBe("2026-07-01T01:02:03.004Z");
		expect(diagnostic.redactionMode).toBe("home-and-app-data");
		expect(diagnostic.privacy).toEqual({
			chatContentIncluded: false,
			attachmentsIncluded: false,
			toolPayloadsIncluded: false,
			jsonlCopied: false,
		});
		expect(diagnostic.sessions.total).toBe(1);
		expect(diagnostic.sessions.items[0]).toMatchObject({
			sessionId: session.id,
			messageCount: 2,
		});
	});
});
