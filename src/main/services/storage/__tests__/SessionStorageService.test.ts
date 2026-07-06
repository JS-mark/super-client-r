// @vitest-environment node
//
// A-5 SessionStorageService 测试。tmp dir + ProjectStorageService 真实联动。

import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProjectStorageService } from "../ProjectStorageService";
import { SessionStorageService } from "../SessionStorageService";

let baseDir: string;
let projects: ProjectStorageService;
let sessions: SessionStorageService;

beforeEach(() => {
	baseDir = mkdtempSync(join(tmpdir(), "super-client-test-"));
	projects = new ProjectStorageService(baseDir, "default");
	sessions = new SessionStorageService(baseDir, "default", projects);
});

afterEach(() => {
	rmSync(baseDir, { recursive: true, force: true });
});

const userRoot = () => join(baseDir, "default");
const casualPath = (sid: string, ext: ".jsonl" | ".meta.json") =>
	join(userRoot(), "casual-sessions", `${sid}${ext}`);
const projectSessionPath = (
	pid: string,
	sid: string,
	ext: ".jsonl" | ".meta.json",
) => join(userRoot(), "projects", pid, "sessions", `${sid}${ext}`);
const legacyProjectScrSessionPath = (
	cwd: string,
	sid: string,
	ext: ".jsonl" | ".meta.json",
) => join(cwd, ".scr-data", "sessions", `${sid}${ext}`);
const listRelativeFiles = (dir: string, prefix = ""): string[] =>
	readdirSync(join(dir, prefix), { withFileTypes: true }).flatMap((entry) => {
		const relativePath = prefix ? join(prefix, entry.name) : entry.name;
		return entry.isDirectory()
			? listRelativeFiles(dir, relativePath)
			: [relativePath];
	});

describe("create — lazy 落盘", () => {
	it("casual session: writes meta.json only, no jsonl", () => {
		const s = sessions.create({ projectId: null });
		expect(s.projectId).toBeNull();
		expect(s.chatMode).toBe("agent");
		expect(s.messageCount).toBe(0);
		expect(existsSync(casualPath(s.id, ".meta.json"))).toBe(true);
		expect(existsSync(casualPath(s.id, ".jsonl"))).toBe(false);
	});

	it("project session: lands under projects/<id>/sessions/", () => {
		const p = projects.add("/a/b");
		const s = sessions.create({ projectId: p.id });
		expect(s.projectId).toBe(p.id);
		// G-2: 即使 project.cwd 缺失，路由也走 userData 下；
		// fallback 原因从 "cwd-missing" 变成 "scr-data-disabled-by-policy"
		// （因为我们不再去探测 .scr-data 是否可写）
		expect(s.storageRoot).toBe("project-app-data-fallback");
		expect(s.storageFallbackReason).toBe("scr-data-disabled-by-policy");
		expect(existsSync(projectSessionPath(p.id, s.id, ".meta.json"))).toBe(true);
		expect(existsSync(projectSessionPath(p.id, s.id, ".jsonl"))).toBe(false);
	});

	it("project session with writable cwd still lands under userData (G-2: no .scr-data inside project)", () => {
		const cwd = mkdtempSync(join(tmpdir(), "super-client-project-"));
		const p = projects.add(cwd);
		const s = sessions.create({ projectId: p.id });
		// G-2 关键回归：即便项目 cwd 可写，也**不**应该往 project.cwd/.scr-data 里写
		expect(s.storageRoot).toBe("project-app-data-fallback");
		expect(s.storageFallbackReason).toBe("scr-data-disabled-by-policy");
		expect(existsSync(legacyProjectScrSessionPath(cwd, s.id, ".meta.json"))).toBe(
			false,
		);
		expect(existsSync(projectSessionPath(p.id, s.id, ".meta.json"))).toBe(true);
		rmSync(cwd, { recursive: true, force: true });
	});

	it("project not found rejects creation", () => {
		expect(() => sessions.create({ projectId: "nonexistent" })).toThrow(
			"project not found",
		);
	});
});

describe("list", () => {
	it("list(null) returns only casuals", () => {
		const p = projects.add("/a/b");
		const c1 = sessions.create({ projectId: null });
		const c2 = sessions.create({ projectId: null });
		sessions.create({ projectId: p.id });
		const ids = sessions.list(null).map((s) => s.id);
		expect(ids.sort()).toEqual([c1.id, c2.id].sort());
	});

	it("list(projectId) returns only that project's sessions", () => {
		const p = projects.add("/a/b");
		const q = projects.add("/c/d");
		const s1 = sessions.create({ projectId: p.id });
		sessions.create({ projectId: q.id });
		const list = sessions.list(p.id);
		expect(list).toHaveLength(1);
		expect(list[0].id).toBe(s1.id);
	});

	it("list returns [] for missing dir", () => {
		expect(sessions.list(null)).toEqual([]);
		expect(sessions.list("never-existed")).toEqual([]);
	});
});

describe("appendEvent + readMessages", () => {
	it("first appendEvent creates jsonl; readMessages reduces it", () => {
		const s = sessions.create({ projectId: null });
		expect(existsSync(casualPath(s.id, ".jsonl"))).toBe(false);
		sessions.appendEvent(s.id, {
			type: "user_message",
			id: "u1",
			ts: 1,
			content: "hello",
		});
		expect(existsSync(casualPath(s.id, ".jsonl"))).toBe(true);
		const msgs = sessions.readMessages(s.id);
		expect(msgs).toHaveLength(1);
		expect(msgs[0].content).toBe("hello");
	});

	it("appendEvent updates messageCount + preview for user_message", () => {
		const s = sessions.create({ projectId: null });
		sessions.appendEvent(s.id, {
			type: "user_message",
			id: "u1",
			ts: 1,
			content: "first ever message",
		});
		const meta = sessions.getMeta(s.id);
		expect(meta.messageCount).toBe(1);
		expect(meta.preview).toBe("first ever message");
	});

	it("appendEvent does NOT bump messageCount when a same-id assistant_message is re-emitted", () => {
		const s = sessions.create({ projectId: null });
		// Initial empty placeholder
		sessions.appendEvent(s.id, {
			type: "assistant_message",
			id: "a1",
			ts: 1,
			content: "",
		});
		expect(sessions.getMeta(s.id).messageCount).toBe(1);

		// Stream-end finalize: same id, real content + metadata
		sessions.appendEvent(s.id, {
			type: "assistant_message",
			id: "a1",
			ts: 2,
			content: "final",
			metadata: { model: "claude", tokens: 10 },
		});
		expect(sessions.getMeta(s.id).messageCount).toBe(1);

		// Reduced view shows the latest content (upsert by id)
		const msgs = sessions.readMessages(s.id);
		expect(msgs).toHaveLength(1);
		expect(msgs[0].content).toBe("final");
		expect(msgs[0].metadata).toMatchObject({ model: "claude", tokens: 10 });
	});

	it("appendEvent counts assistant.part_start once per assistant message", () => {
		const s = sessions.create({ projectId: null });
		sessions.appendEvent(s.id, {
			type: "assistant.part_start",
			messageId: "a-parts",
			ts: 1,
			part: {
				id: "p1",
				type: "text",
				state: "streaming",
				createdAt: 1,
				updatedAt: 1,
				content: "hello",
			},
		});
		expect(sessions.getMeta(s.id).messageCount).toBe(1);

		sessions.appendEvent(s.id, {
			type: "assistant.part_start",
			messageId: "a-parts",
			ts: 2,
			part: {
				id: "p2",
				type: "code_block",
				state: "streaming",
				createdAt: 2,
				updatedAt: 2,
				language: "ts",
				content: "const value = 1;",
			},
		});
		expect(sessions.getMeta(s.id).messageCount).toBe(1);
	});

	it("repairs messageCount from unique user/assistant/assistant.part_start events", () => {
		const s = sessions.create({ projectId: null });
		sessions.appendEvent(s.id, {
			type: "user_message",
			id: "u1",
			ts: 1,
			content: "first",
		});
		sessions.appendEvent(s.id, {
			type: "assistant_message",
			id: "a1",
			ts: 2,
			content: "",
		});
		sessions.appendEvent(s.id, {
			type: "assistant_message",
			id: "a1",
			ts: 3,
			content: "final",
		});
		sessions.appendEvent(s.id, {
			type: "assistant.part_start",
			messageId: "a2",
			ts: 4,
			part: {
				id: "p1",
				type: "text",
				state: "complete",
				createdAt: 4,
				updatedAt: 4,
				content: "structured",
			},
		});
		sessions.appendEvent(s.id, {
			type: "assistant.part_start",
			messageId: "a2",
			ts: 5,
			part: {
				id: "p2",
				type: "text",
				state: "complete",
				createdAt: 5,
				updatedAt: 5,
				content: "more",
			},
		});

		const meta = JSON.parse(
			readFileSync(casualPath(s.id, ".meta.json"), "utf-8"),
		);
		writeFileSync(
			casualPath(s.id, ".meta.json"),
			JSON.stringify({ ...meta, messageCount: 0, metaNeedsRepair: true }),
		);

		const repaired = sessions.getMeta(s.id);
		expect(repaired.messageCount).toBe(3);
		expect(repaired.preview).toBe("first");
		expect(repaired.metaNeedsRepair).toBeUndefined();
	});

	it("sealInflightToolCalls writes synthetic tool_error for orphan tool_call", () => {
		const s = sessions.create({ projectId: null });
		sessions.appendEvent(s.id, {
			type: "tool_call",
			id: "tc-orphan",
			ts: 1,
			name: "pwd",
			input: {},
		});
		sessions.appendEvent(s.id, {
			type: "tool_call",
			id: "tc-completed",
			ts: 2,
			name: "ls",
			input: {},
		});
		sessions.appendEvent(s.id, {
			type: "tool_result",
			toolCallId: "tc-completed",
			ts: 3,
			output: "ok",
		});

		const sealed = sessions.sealInflightToolCalls(s.id, "中断：测试");
		expect(sealed).toBe(1);

		const msgs = sessions.readMessages(s.id);
		const orphan = msgs.find((m) => m.toolCall?.id === "tc-orphan");
		const completed = msgs.find((m) => m.toolCall?.id === "tc-completed");
		expect(orphan?.toolCall?.status).toBe("error");
		expect(orphan?.toolCall?.error).toBe("中断：测试");
		expect(completed?.toolCall?.status).toBe("success");

		// Calling again is a no-op — the orphan is now sealed.
		expect(sessions.sealInflightToolCalls(s.id, "中断：测试")).toBe(0);
	});

	it("sealInflightToolCalls returns 0 for session with no jsonl", () => {
		const s = sessions.create({ projectId: null });
		expect(sessions.sealInflightToolCalls(s.id, "中断")).toBe(0);
	});

	it("sealAllInflightToolCalls walks every session and reports totals", () => {
		const a = sessions.create({ projectId: null });
		const b = sessions.create({ projectId: null });
		// session a: 1 orphan, 1 completed
		sessions.appendEvent(a.id, {
			type: "tool_call",
			id: "a-orphan",
			ts: 1,
			name: "f",
			input: {},
		});
		sessions.appendEvent(a.id, {
			type: "tool_call",
			id: "a-ok",
			ts: 2,
			name: "g",
			input: {},
		});
		sessions.appendEvent(a.id, {
			type: "tool_result",
			toolCallId: "a-ok",
			ts: 3,
			output: "",
		});
		// session b: 2 orphans
		sessions.appendEvent(b.id, {
			type: "tool_call",
			id: "b1",
			ts: 1,
			name: "f",
			input: {},
		});
		sessions.appendEvent(b.id, {
			type: "tool_call",
			id: "b2",
			ts: 2,
			name: "g",
			input: {},
		});

		const swept = sessions.sealAllInflightToolCalls("中断：启动扫描");
		expect(swept.sessions).toBe(2);
		expect(swept.toolCalls).toBe(3);
		expect(swept.errors).toBe(0);

		// Idempotent re-run
		expect(sessions.sealAllInflightToolCalls("中断：再次扫描").toolCalls).toBe(
			0,
		);
	});

	it("appendEvent persists tool_result so reload exits the 'pending' state", () => {
		const s = sessions.create({ projectId: null });
		sessions.appendEvent(s.id, {
			type: "tool_call",
			id: "tc1",
			ts: 1,
			name: "pwd",
			input: {},
		});
		// Before result: reducer keeps status='pending'
		expect(sessions.readMessages(s.id)[0].toolCall?.status).toBe("pending");

		sessions.appendEvent(s.id, {
			type: "tool_result",
			toolCallId: "tc1",
			ts: 2,
			output: "/tmp",
			duration: 12,
		});
		const reloaded = sessions.readMessages(s.id);
		expect(reloaded[0].toolCall).toMatchObject({
			status: "success",
			result: "/tmp",
			duration: 12,
		});
	});

	it("readMessages with tail=N returns only the last N messages", () => {
		const s = sessions.create({ projectId: null });
		for (let i = 1; i <= 5; i++) {
			sessions.appendEvent(s.id, {
				type: "user_message",
				id: `u${i}`,
				ts: i,
				content: `msg ${i}`,
			});
		}
		const tail2 = sessions.readMessages(s.id, { tail: 2 });
		expect(tail2.map((m) => m.content)).toEqual(["msg 4", "msg 5"]);
	});

	it("readMessages on session without jsonl returns []", () => {
		const s = sessions.create({ projectId: null });
		expect(sessions.readMessages(s.id)).toEqual([]);
	});

	it("assigns eventId + seq and drops duplicate eventId", () => {
		const s = sessions.create({ projectId: null });
		sessions.appendEvent(s.id, {
			type: "user_message",
			id: "u1",
			eventId: "evt-1",
			ts: 1,
			content: "first",
		});
		sessions.appendEvent(s.id, {
			type: "user_message",
			id: "u1-dup",
			eventId: "evt-1",
			ts: 2,
			content: "duplicate",
		});
		const rows = readFileSync(casualPath(s.id, ".jsonl"), "utf-8")
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));
		expect(rows).toHaveLength(1);
		expect(rows[0].eventId).toBe("evt-1");
		expect(rows[0].seq).toBe(1);
		expect(rows[0].writtenAt).toEqual(expect.any(Number));
		expect(sessions.getMeta(s.id).messageCount).toBe(1);
	});

	it("keeps 120 append events as complete JSONL lines with monotonic seq and consistent meta", () => {
		const s = sessions.create({ projectId: null });

		for (let i = 0; i < 120; i++) {
			sessions.appendEvent(s.id, {
				type: "user_message",
				id: `u-${i}`,
				ts: i + 1,
				content: `message ${i}`,
			});
		}

		const rows = readFileSync(casualPath(s.id, ".jsonl"), "utf-8")
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));
		expect(rows).toHaveLength(120);
		expect(rows.map((row) => row.seq)).toEqual(
			Array.from({ length: 120 }, (_, index) => index + 1),
		);
		expect(rows.every((row) => typeof row.eventId === "string")).toBe(true);
		expect(rows.every((row) => typeof row.writtenAt === "number")).toBe(true);
		expect(sessions.getMeta(s.id).messageCount).toBe(120);
		expect(sessions.readMessages(s.id)).toHaveLength(120);
	});

	it("marks meta corrupted when JSONL contains malformed middle line", () => {
		const s = sessions.create({ projectId: null });
		writeFileSync(
			casualPath(s.id, ".jsonl"),
			'{"type":"user_message","id":"u1","ts":1,"content":"ok"}\n' +
				"{bad json}\n" +
				'{"type":"user_message","id":"u2","ts":2,"content":"after"}\n',
			"utf-8",
		);
		expect(sessions.readMessages(s.id).map((m) => m.content)).toEqual([
			"ok",
			"after",
		]);
		expect(sessions.getMeta(s.id).corrupted).toBe(true);
	});

	it("G-2: project sessions stay in userData; no migration to project.cwd/.scr-data", () => {
		const cwd = mkdtempSync(join(tmpdir(), "super-client-project-"));
		const p = projects.add(cwd);
		const sessionsDir = join(userRoot(), "projects", p.id, "sessions");
		mkdirSync(join(sessionsDir, "legacy-1", "attachments"), {
			recursive: true,
		});
		writeFileSync(
			join(sessionsDir, "legacy-1.meta.json"),
			JSON.stringify({
				id: "legacy-1",
				projectId: p.id,
				chatMode: "agent",
				createdAt: 1,
				updatedAt: 2,
				messageCount: 1,
			}),
			"utf-8",
		);
		writeFileSync(
			join(sessionsDir, "legacy-1.jsonl"),
			'{"type":"user_message","id":"u1","ts":1,"content":"legacy"}\n',
			"utf-8",
		);
		writeFileSync(
			join(sessionsDir, "legacy-1", "attachments", "a.txt"),
			"attachment",
			"utf-8",
		);

		const list = sessions.list(p.id);
		expect(list.map((m) => m.id)).toContain("legacy-1");
		const meta = sessions.getMeta("legacy-1");
		expect(meta.storageRoot).toBe("project-app-data-fallback");
		expect(meta.storageMigratedAt).toBeUndefined();
		// 关键回归：不应该把数据复制到 project.cwd/.scr-data
		expect(existsSync(legacyProjectScrSessionPath(cwd, "legacy-1", ".jsonl"))).toBe(
			false,
		);
		expect(existsSync(join(cwd, ".scr-data"))).toBe(false);
		expect(existsSync(join(sessionsDir, "legacy-1.jsonl"))).toBe(true);
		rmSync(cwd, { recursive: true, force: true });
	});
});

describe("exportSessionArchive", () => {
	it("writes manifest, session meta, and JSONL into app-managed exports with redacted manifest paths", () => {
		const cwd = mkdtempSync(join(tmpdir(), "super-client-project-"));
		writeFileSync(join(cwd, "secret.txt"), "do not copy", "utf-8");
		const p = projects.add(cwd);
		const s = sessions.create({ projectId: p.id, name: "Archive me" });
		sessions.appendEvent(s.id, {
			type: "user_message",
			id: "u1",
			ts: 1,
			content: "export this session",
		});

		const result = sessions.exportSessionArchive(s.id, {
			appVersion: "test-version",
		});
		const manifest = JSON.parse(
			readFileSync(result.manifestPath, "utf-8"),
		) as ReturnType<typeof sessions.exportSessionArchive>["manifest"];

		expect(result.exportDir.startsWith(join(userRoot(), "exports"))).toBe(true);
		expect(existsSync(join(result.exportDir, "manifest.json"))).toBe(true);
		expect(existsSync(join(result.exportDir, `${s.id}.meta.json`))).toBe(true);
		expect(existsSync(join(result.exportDir, `${s.id}.jsonl`))).toBe(true);
		expect(readFileSync(join(result.exportDir, `${s.id}.jsonl`), "utf-8")).toBe(
			readFileSync(projectSessionPath(p.id, s.id, ".jsonl"), "utf-8"),
		);
		expect(manifest).toMatchObject({
			schemaVersion: 1,
			appVersion: "test-version",
			sessionId: s.id,
			projectId: p.id,
			redactionMode: "home-and-app-data",
		});
		expect(manifest.files.map((file) => file.path).sort()).toEqual([
			"manifest.json",
			`${s.id}.jsonl`,
			`${s.id}.meta.json`,
		]);
		expect(JSON.stringify(manifest)).not.toContain(baseDir);
		expect(JSON.stringify(manifest)).not.toContain(cwd);
		expect(JSON.stringify(manifest)).toContain("<app-data>");
		expect(listRelativeFiles(result.exportDir).sort()).toEqual([
			"manifest.json",
			`${s.id}.jsonl`,
			`${s.id}.meta.json`,
		]);
		rmSync(cwd, { recursive: true, force: true });
	});

	it("lists attachments and contentRefs in manifest but does not copy payload directories", () => {
		const s = sessions.create({ projectId: null });
		const attachmentsDir = sessions.getAttachmentsDir(s.id);
		writeFileSync(join(attachmentsDir, "att-1.txt"), "attachment payload");
		const ref = sessions.writeContentRef(s.id, {
			payload: "content ref payload",
			mediaType: "text/plain",
			source: "assistant",
		});
		sessions.appendEvent(s.id, {
			type: "user_message",
			id: "u1",
			ts: 1,
			content: "has attachment",
			attachmentIds: ["att-1", "missing-att"],
		});
		sessions.appendEvent(s.id, {
			type: "assistant.part_start",
			messageId: "a1",
			ts: 2,
			part: {
				id: "p1",
				type: "text",
				state: "complete",
				createdAt: 2,
				updatedAt: 2,
				content: "",
				contentRef: ref.contentRef,
				byteLength: ref.byteLength,
				truncated: true,
			},
		});

		const { exportDir, manifest } = sessions.exportSessionArchive(s.id);

		expect(manifest.referencedPayloads.copied).toBe(false);
		expect(manifest.referencedPayloads.attachments).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: "att-1",
					name: "att-1.txt",
					sourcePath: expect.stringContaining("<app-data>"),
					byteLength: "attachment payload".length,
				}),
				expect.objectContaining({ id: "missing-att", missing: true }),
			]),
		);
		expect(manifest.referencedPayloads.contentRefs).toEqual([
			expect.objectContaining({
				contentRef: ref.contentRef,
				sha256: ref.sha256,
				sourcePath: expect.stringContaining("<app-data>"),
				byteLength: ref.byteLength,
				mediaType: "text/plain",
				source: "assistant",
			}),
		]);
		expect(listRelativeFiles(exportDir).sort()).toEqual([
			"manifest.json",
			`${s.id}.jsonl`,
			`${s.id}.meta.json`,
		]);
		expect(existsSync(join(exportDir, "attachments"))).toBe(false);
		expect(existsSync(join(exportDir, "tool-outputs"))).toBe(false);
	});
});

describe("exportProjectArchive", () => {
	it("exports app-managed project metadata and project sessions without copying cwd contents or casual sessions", () => {
		const cwd = mkdtempSync(join(tmpdir(), "super-client-project-"));
		const otherCwd = mkdtempSync(join(tmpdir(), "super-client-project-"));
		writeFileSync(join(cwd, "secret.txt"), "do not copy", "utf-8");
		const p = projects.add(cwd, "Project Archive");
		const otherProject = projects.add(otherCwd, "Other Project");
		projects.saveSettings(p.id, { enabledCapabilities: [] });

		const first = sessions.create({ projectId: p.id, name: "First" });
		sessions.appendEvent(first.id, {
			type: "user_message",
			id: "u1",
			ts: 1,
			content: "project first",
			attachmentIds: ["att-1"],
		});
		writeFileSync(
			join(sessions.getAttachmentsDir(first.id), "att-1.txt"),
			"attachment payload",
			"utf-8",
		);
		const ref = sessions.writeContentRef(first.id, {
			payload: "content ref payload",
			mediaType: "text/plain",
			source: "assistant",
		});
		sessions.appendEvent(first.id, {
			type: "assistant.part_start",
			messageId: "a1",
			ts: 2,
			part: {
				id: "p1",
				type: "text",
				state: "complete",
				createdAt: 2,
				updatedAt: 2,
				content: "",
				contentRef: ref.contentRef,
				byteLength: ref.byteLength,
				truncated: true,
			},
		});

		const second = sessions.create({ projectId: p.id, name: "Second" });
		sessions.appendEvent(second.id, {
			type: "user_message",
			id: "u2",
			ts: 3,
			content: "project second",
		});

		const casual = sessions.create({ projectId: null, name: "Casual" });
		sessions.appendEvent(casual.id, {
			type: "user_message",
			id: "u-casual",
			ts: 4,
			content: "casual should not export",
		});
		const other = sessions.create({
			projectId: otherProject.id,
			name: "Other project session",
		});
		sessions.appendEvent(other.id, {
			type: "user_message",
			id: "u-other",
			ts: 5,
			content: "other project should not export",
		});

		const result = sessions.exportProjectArchive(p.id, {
			appVersion: "test-version",
		});
		const manifest = JSON.parse(
			readFileSync(result.manifestPath, "utf-8"),
		) as ReturnType<typeof sessions.exportProjectArchive>["manifest"];
		const files = listRelativeFiles(result.exportDir).sort();

		expect(result.exportDir.startsWith(join(userRoot(), "exports"))).toBe(true);
		expect(manifest).toMatchObject({
			schemaVersion: 1,
			appVersion: "test-version",
			projectId: p.id,
			redactionMode: "home-and-app-data",
			sessionCount: 2,
			referencedPayloads: { copied: false },
		});
		expect(manifest.sessions.map((entry) => entry.sessionId).sort()).toEqual(
			[first.id, second.id].sort(),
		);
		expect(manifest.sessions.map((entry) => entry.sessionId)).not.toContain(
			casual.id,
		);
		expect(manifest.sessions.map((entry) => entry.sessionId)).not.toContain(
			other.id,
		);
		expect(files).toEqual(
			[
				"manifest.json",
				"project-settings.json",
				"project.json",
				`sessions/${first.id}.jsonl`,
				`sessions/${first.id}.meta.json`,
				`sessions/${second.id}.jsonl`,
				`sessions/${second.id}.meta.json`,
			].sort(),
		);
		expect(
			readFileSync(join(result.exportDir, `sessions/${first.id}.jsonl`), "utf-8"),
		).toBe(readFileSync(projectSessionPath(p.id, first.id, ".jsonl"), "utf-8"));
		expect(
			readFileSync(
				join(result.exportDir, `sessions/${second.id}.meta.json`),
				"utf-8",
			),
		).toBe(
			readFileSync(projectSessionPath(p.id, second.id, ".meta.json"), "utf-8"),
		);

		const manifestJson = JSON.stringify(manifest);
		expect(manifestJson).not.toContain(cwd);
		expect(manifestJson).not.toContain(baseDir);
		expect(readFileSync(join(result.exportDir, "project.json"), "utf-8")).not
			.toContain(cwd);
		expect(files).not.toContain("secret.txt");
		expect(readFileSync(join(result.exportDir, "manifest.json"), "utf-8")).not
			.toContain("do not copy");
		expect(existsSync(join(result.exportDir, "attachments"))).toBe(false);
		expect(existsSync(join(result.exportDir, "tool-outputs"))).toBe(false);
		expect(manifest.referencedPayloads.sessions).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					sessionId: first.id,
					attachments: [
						expect.objectContaining({
							id: "att-1",
							name: "att-1.txt",
							sourcePath: expect.stringContaining("<app-data>"),
							byteLength: "attachment payload".length,
						}),
					],
					contentRefs: [
						expect.objectContaining({
							contentRef: ref.contentRef,
							sha256: ref.sha256,
							sourcePath: expect.stringContaining("<app-data>"),
							byteLength: ref.byteLength,
						}),
					],
				}),
			]),
		);

		rmSync(cwd, { recursive: true, force: true });
		rmSync(otherCwd, { recursive: true, force: true });
	});
});

describe("reassignProject — §9.10 (C1) lock", () => {
	it("succeeds before first appendEvent", () => {
		const p = projects.add("/a/b");
		const s = sessions.create({ projectId: null });
		expect(existsSync(casualPath(s.id, ".meta.json"))).toBe(true);
		const moved = sessions.reassignProject(s.id, p.id);
		expect(moved.projectId).toBe(p.id);
		// new location exists, old gone
		expect(existsSync(projectSessionPath(p.id, s.id, ".meta.json"))).toBe(true);
		expect(existsSync(casualPath(s.id, ".meta.json"))).toBe(false);
	});

	it("throws after first appendEvent (lock acquired)", () => {
		const p = projects.add("/a/b");
		const s = sessions.create({ projectId: null });
		sessions.appendEvent(s.id, {
			type: "user_message",
			id: "u1",
			ts: 1,
			content: "lock now",
		});
		expect(() => sessions.reassignProject(s.id, p.id)).toThrow("lock acquired");
	});

	it("no-op when next === current", () => {
		const s = sessions.create({ projectId: null });
		const same = sessions.reassignProject(s.id, null);
		expect(same.projectId).toBeNull();
	});
});

describe("rename / updateMeta / delete", () => {
	it("rename only changes name", () => {
		const s = sessions.create({ projectId: null, name: "Old" });
		const r = sessions.rename(s.id, "New");
		expect(r.name).toBe("New");
		expect(r.id).toBe(s.id);
		expect(r.projectId).toBeNull();
	});

	it("updateMeta cannot change id / projectId", () => {
		const p = projects.add("/a/b");
		const s = sessions.create({ projectId: null });
		const updated = sessions.updateMeta(s.id, {
			id: "hijack",
			projectId: p.id,
			flags: { pinned: true },
		} as never);
		expect(updated.id).toBe(s.id);
		expect(updated.projectId).toBeNull();
		expect(updated.flags?.pinned).toBe(true);
	});

	it("delete soft-deletes and hides from normal lists", () => {
		const s = sessions.create({ projectId: null });
		sessions.appendEvent(s.id, {
			type: "user_message",
			id: "u1",
			ts: 1,
			content: "x",
		});
		expect(existsSync(casualPath(s.id, ".meta.json"))).toBe(true);
		expect(existsSync(casualPath(s.id, ".jsonl"))).toBe(true);
		const result = sessions.delete(s.id);
		expect(result.deleted).toBe(true);
		expect(result.tombstone?.id).toBe(s.id);
		expect(existsSync(casualPath(s.id, ".meta.json"))).toBe(true);
		expect(existsSync(casualPath(s.id, ".jsonl"))).toBe(true);
		expect(sessions.list(null).map((m) => m.id)).not.toContain(s.id);
		expect(sessions.listDeleted().map((m) => m.id)).toContain(s.id);
	});

	it("restoreDeleted makes a soft-deleted session visible again", () => {
		const s = sessions.create({ projectId: null });
		sessions.delete(s.id);
		const restored = sessions.restoreDeleted(s.id);
		expect(restored.deletedAt).toBeUndefined();
		expect(sessions.list(null).map((m) => m.id)).toContain(s.id);
	});

	it("does not allow appending to a soft-deleted session", () => {
		const s = sessions.create({ projectId: null });
		sessions.delete(s.id);
		expect(() =>
			sessions.appendEvent(s.id, {
				type: "user_message",
				id: "u-after-delete",
				ts: 1,
				content: "should not write",
			}),
		).toThrow("cannot append to deleted session");
	});

	it("getMeta throws for unknown session", () => {
		expect(() => sessions.getMeta("nope")).toThrow("session not found");
	});
});

describe("fork", () => {
	it("local fork in same casual bucket: copies messages + sets lineage", () => {
		const src = sessions.create({ projectId: null, name: "Origin" });
		sessions.appendEvent(src.id, {
			type: "user_message",
			id: "u1",
			ts: 1,
			content: "hi",
		});
		const f = sessions.fork(src.id, { targetProjectId: null });
		expect(f.id).not.toBe(src.id);
		expect(f.projectId).toBeNull();
		expect(f.lineage?.forkOriginId).toBe(src.id);
		expect(f.name).toBe("Origin (副本)");
		const msgs = sessions.readMessages(f.id);
		expect(msgs).toHaveLength(1);
		expect(msgs[0].content).toBe("hi");
	});

	it("cross-bucket fork: casual → project carries messages and lineage", () => {
		const cwd = mkdtempSync(join(tmpdir(), "super-client-project-"));
		const p = projects.add(cwd);
		const src = sessions.create({ projectId: null });
		sessions.appendEvent(src.id, {
			type: "user_message",
			id: "u1",
			ts: 1,
			content: "x",
		});
		const f = sessions.fork(src.id, { targetProjectId: p.id });
		expect(f.projectId).toBe(p.id);
		// G-2: 项目会话数据落 userData，而不是 project.cwd/.scr-data
		expect(f.storageRoot).toBe("project-app-data-fallback");
		expect(existsSync(legacyProjectScrSessionPath(cwd, f.id, ".jsonl"))).toBe(false);
		expect(existsSync(projectSessionPath(p.id, f.id, ".jsonl"))).toBe(true);
		expect(f.lineage?.forkOriginId).toBe(src.id);
		rmSync(cwd, { recursive: true, force: true });
	});

	it("fork records forkOriginMessageId when supplied", () => {
		const src = sessions.create({ projectId: null });
		const f = sessions.fork(src.id, {
			targetProjectId: null,
			forkOriginMessageId: "msg-42",
		});
		expect(f.lineage?.forkOriginMessageId).toBe("msg-42");
	});
});

// ─── G-2 dir helpers ───────────────────────────────────────
describe("G-2 dir helpers", () => {
	it("getSessionDir returns casual path", () => {
		const s = sessions.create({ projectId: null });
		expect(sessions.getSessionDir(s.id)).toBe(
			join(userRoot(), "casual-sessions", s.id),
		);
	});

	it("getSessionDir returns project path under userData (G-2: no .scr-data)", () => {
		const cwd = mkdtempSync(join(tmpdir(), "super-client-project-"));
		const p = projects.add(cwd);
		const s = sessions.create({ projectId: p.id });
		expect(sessions.getSessionDir(s.id)).toBe(
			join(userRoot(), "projects", p.id, "sessions", s.id),
		);
		// 关键回归：项目目录不应该有 .scr-data
		expect(existsSync(join(cwd, ".scr-data"))).toBe(false);
		rmSync(cwd, { recursive: true, force: true });
	});

	it("getAttachmentsDir auto-creates dir", () => {
		const s = sessions.create({ projectId: null });
		const dir = sessions.getAttachmentsDir(s.id);
		expect(existsSync(dir)).toBe(true);
		expect(dir.endsWith("attachments")).toBe(true);
	});

	it("getToolOutputsDir auto-creates dir", () => {
		const s = sessions.create({ projectId: null });
		const dir = sessions.getToolOutputsDir(s.id);
		expect(existsSync(dir)).toBe(true);
		expect(dir.endsWith("tool-outputs")).toBe(true);
	});

	it("listAll spans casual + project buckets", () => {
		const cwd = mkdtempSync(join(tmpdir(), "super-client-project-"));
		const p = projects.add(cwd);
		const cs = sessions.create({ projectId: null });
		const ps = sessions.create({ projectId: p.id });
		const all = sessions.listAll();
		expect(all.map((m) => m.id).sort()).toEqual([cs.id, ps.id].sort());
		rmSync(cwd, { recursive: true, force: true });
	});

	it("project remove deletes userData session dir by default (G-2: no .scr-data inside project)", () => {
		const cwd = mkdtempSync(join(tmpdir(), "super-client-project-"));
		const p = projects.add(cwd);
		const s = sessions.create({ projectId: p.id });
		sessions.appendEvent(s.id, {
			type: "user_message",
			id: "u1",
			ts: 1,
			content: "remove me",
		});
		const userSessionsDir = join(userRoot(), "projects", p.id, "sessions");
		expect(existsSync(userSessionsDir)).toBe(true);
		// 项目目录里**不应该**有 .scr-data
		expect(existsSync(join(cwd, ".scr-data"))).toBe(false);
		projects.remove(p.id);
		// 项目从 registry 移除后，userData 下的项目目录也被清掉
		expect(existsSync(join(userRoot(), "projects", p.id))).toBe(false);
		rmSync(cwd, { recursive: true, force: true });
	});

	it("project remove keepFiles preserves userData session dir (G-2)", () => {
		const cwd = mkdtempSync(join(tmpdir(), "super-client-project-"));
		const p = projects.add(cwd);
		const s = sessions.create({ projectId: p.id });
		sessions.appendEvent(s.id, {
			type: "user_message",
			id: "u1",
			ts: 1,
			content: "keep me",
		});
		const userSessionsDir = join(userRoot(), "projects", p.id, "sessions");
		projects.remove(p.id, { keepFiles: true });
		expect(existsSync(userSessionsDir)).toBe(true);
		rmSync(cwd, { recursive: true, force: true });
	});
});

describe("contentRef payload storage", () => {
	it("appendEvent externalizes large assistant.part_start payload fields", () => {
		const largePayload = "large-payload-".repeat(6 * 1024);
		const cases = [
			{
				name: "text content",
				part: {
					id: "p-text",
					type: "text",
					state: "complete",
					createdAt: 1,
					updatedAt: 1,
					content: largePayload,
				},
				field: "content",
				cleared: "",
				expectedPayload: largePayload,
				expectedSource: "assistant",
			},
			{
				name: "tool output",
				part: {
					id: "p-tool",
					type: "tool",
					state: "complete",
					createdAt: 1,
					updatedAt: 1,
					toolUseId: "tool-1",
					name: "Read",
					output: { content: largePayload },
				},
				field: "output",
				cleared: null,
				expectedPayload: JSON.stringify({ content: largePayload }),
				expectedSource: "tool",
			},
			{
				name: "artifact preview",
				part: {
					id: "p-artifact",
					type: "artifact",
					state: "complete",
					createdAt: 1,
					updatedAt: 1,
					artifactId: "artifact-1",
					artifactType: "markdown",
					title: "Report",
					preview: largePayload,
				},
				field: "preview",
				cleared: "",
				expectedPayload: largePayload,
				expectedSource: "artifact",
			},
			{
				name: "data value",
				part: {
					id: "p-data",
					type: "data",
					state: "complete",
					createdAt: 1,
					updatedAt: 1,
					format: "json",
					value: { content: largePayload },
				},
				field: "value",
				cleared: null,
				expectedPayload: JSON.stringify({ content: largePayload }),
				expectedSource: "assistant",
			},
		] as const;

		for (const c of cases) {
			const s = sessions.create({ projectId: null });
			sessions.appendEvent(s.id, {
				type: "assistant.part_start",
				messageId: `a-${c.part.id}`,
				ts: 1,
				part: c.part,
			});

			const raw = readFileSync(casualPath(s.id, ".jsonl"), "utf-8");
			expect(raw.includes(largePayload), c.name).toBe(false);
			const event = JSON.parse(raw.trim()) as {
				part: Record<string, unknown>;
			};
			expect(event.part[c.field], c.name).toEqual(c.cleared);
			expect(event.part.contentRef, c.name).toMatch(
				/^session-content:\/\/v1\/tool-outputs\/content-refs\/[a-f0-9]{64}$/,
			);
			expect(event.part.byteLength, c.name).toBe(
				Buffer.byteLength(c.expectedPayload, "utf-8"),
			);
			expect(event.part.truncated, c.name).toBe(true);

			const read = sessions.readContentRef(
				s.id,
				event.part.contentRef as string,
			);
			expect(read.data.toString("utf-8"), c.name).toBe(c.expectedPayload);
			expect(read.source, c.name).toBe(c.expectedSource);

			const [message] = sessions.readMessages(s.id);
			expect(message.parts?.[0]).toMatchObject({
				contentRef: event.part.contentRef,
				byteLength: event.part.byteLength,
				truncated: true,
			});
		}
	});

	it("appendEvent externalizes large assistant.part_update patches", () => {
		const s = sessions.create({ projectId: null });
		const largeCode = "const value = 1; ".repeat(5 * 1024);

		sessions.appendEvent(s.id, {
			type: "assistant.part_start",
			messageId: "a-code",
			ts: 1,
			part: {
				id: "p-code",
				type: "code_block",
				state: "streaming",
				createdAt: 1,
				updatedAt: 1,
				language: "ts",
				content: "const value = 0;",
			},
		});
		sessions.appendEvent(s.id, {
			type: "assistant.part_update",
			messageId: "a-code",
			partId: "p-code",
			ts: 2,
			patch: {
				type: "code_block",
				state: "complete",
				content: largeCode,
			},
		});

		const raw = readFileSync(casualPath(s.id, ".jsonl"), "utf-8");
		expect(raw.includes(largeCode)).toBe(false);
		const [, update] = raw
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line)) as Array<{
			patch?: Record<string, unknown>;
		}>;

		expect(update.patch?.content).toBe("");
		expect(update.patch?.contentRef).toMatch(
			/^session-content:\/\/v1\/tool-outputs\/content-refs\/[a-f0-9]{64}$/,
		);
		expect(update.patch?.byteLength).toBe(
			Buffer.byteLength(largeCode, "utf-8"),
		);
		expect(update.patch?.truncated).toBe(true);
		expect(
			sessions
				.readContentRef(s.id, update.patch?.contentRef as string)
				.data.toString("utf-8"),
		).toBe(largeCode);

		const [message] = sessions.readMessages(s.id);
		expect(message.parts?.[0]).toMatchObject({
			content: "",
			contentRef: update.patch?.contentRef,
			byteLength: update.patch?.byteLength,
			truncated: true,
		});
	});

	it("leaves tool_result replay payloads inline", () => {
		const s = sessions.create({ projectId: null });
		const largeOutput = "tool-output-".repeat(6 * 1024);

		sessions.appendEvent(s.id, {
			type: "tool_call",
			id: "tool-call-1",
			ts: 1,
			name: "Read",
			input: { path: "large.txt" },
		});
		sessions.appendEvent(s.id, {
			type: "tool_result",
			toolCallId: "tool-call-1",
			ts: 2,
			output: largeOutput,
		});

		const raw = readFileSync(casualPath(s.id, ".jsonl"), "utf-8");
		expect(raw.includes(largeOutput)).toBe(true);
		expect(raw).not.toContain("contentRef");
		const [, result] = raw
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line)) as Array<{
			output?: unknown;
		}>;
		expect(result.output).toBe(largeOutput);
		expect(sessions.readMessages(s.id)[0].toolCall?.result).toBe(largeOutput);
	});

	it("writes and reads session-relative payload refs from tool-outputs", () => {
		const s = sessions.create({ projectId: null });
		const payload = "large assistant payload\n".repeat(128);

		const ref = sessions.writeContentRef(s.id, {
			payload,
			mediaType: "text/plain",
			source: "assistant",
		});

		expect(ref.contentRef).toMatch(
			/^session-content:\/\/v1\/tool-outputs\/content-refs\/[a-f0-9]{64}$/,
		);
		expect(ref.byteLength).toBe(Buffer.byteLength(payload, "utf-8"));
		expect(ref.mediaType).toBe("text/plain");
		expect(ref.source).toBe("assistant");

		const refId = ref.contentRef.split("/").at(-1);
		expect(refId).toBe(ref.sha256);
		const payloadPath = join(
			sessions.getToolOutputsDir(s.id),
			"content-refs",
			`${refId}.bin`,
		);
		expect(readFileSync(payloadPath, "utf-8")).toBe(payload);

		const read = sessions.readContentRef(s.id, ref.contentRef);
		expect(read.contentRef).toBe(ref.contentRef);
		expect(read.byteLength).toBe(ref.byteLength);
		expect(read.totalByteLength).toBe(ref.byteLength);
		expect(read.offset).toBe(0);
		expect(read.bytesRead).toBe(ref.byteLength);
		expect(read.truncated).toBe(false);
		expect(read.nextOffset).toBeUndefined();
		expect(read.mediaType).toBe("text/plain");
		expect(read.source).toBe("assistant");
		expect(read.data.toString("utf-8")).toBe(payload);
	});

	it("reads content ref previews by maxBytes without loading the full payload", () => {
		const s = sessions.create({ projectId: null });
		const ref = sessions.writeContentRef(s.id, {
			payload: "abcdefghi",
			mediaType: "text/plain",
			source: "assistant",
		});

		const read = sessions.readContentRef(s.id, ref.contentRef, {
			maxBytes: 4,
		});

		expect(read.byteLength).toBe(9);
		expect(read.totalByteLength).toBe(9);
		expect(read.offset).toBe(0);
		expect(read.bytesRead).toBe(4);
		expect(read.truncated).toBe(true);
		expect(read.nextOffset).toBe(4);
		expect(read.data.toString("utf-8")).toBe("abcd");
	});

	it("reads the next content ref preview from offset", () => {
		const s = sessions.create({ projectId: null });
		const ref = sessions.writeContentRef(s.id, {
			payload: "abcdefghi",
			mediaType: "text/plain",
			source: "assistant",
		});

		const read = sessions.readContentRef(s.id, ref.contentRef, {
			offset: 4,
			maxBytes: 3,
		});

		expect(read.byteLength).toBe(9);
		expect(read.totalByteLength).toBe(9);
		expect(read.offset).toBe(4);
		expect(read.bytesRead).toBe(3);
		expect(read.truncated).toBe(true);
		expect(read.nextOffset).toBe(7);
		expect(read.data.toString("utf-8")).toBe("efg");
	});

	it("rejects invalid content ref range options", () => {
		const s = sessions.create({ projectId: null });
		const ref = sessions.writeContentRef(s.id, {
			payload: "abcdefghi",
			mediaType: "text/plain",
			source: "assistant",
		});

		expect(() =>
			sessions.readContentRef(s.id, ref.contentRef, { offset: -1 }),
		).toThrow("invalid contentRef offset");
		expect(() =>
			sessions.readContentRef(s.id, ref.contentRef, { offset: 10 }),
		).toThrow("contentRef offset outside payload");
		expect(() =>
			sessions.readContentRef(s.id, ref.contentRef, { maxBytes: 0 }),
		).toThrow("invalid contentRef maxBytes");
		expect(() =>
			sessions.readContentRef(s.id, ref.contentRef, { maxBytes: 1.5 }),
		).toThrow("invalid contentRef maxBytes");
	});

	it("returns a stable ref for the same payload", () => {
		const s = sessions.create({ projectId: null });
		const first = sessions.writeContentRef(s.id, {
			payload: Buffer.from("same bytes"),
			source: "tool",
		});
		const second = sessions.writeContentRef(s.id, {
			payload: Buffer.from("same bytes"),
			source: "tool",
		});
		expect(second.contentRef).toBe(first.contentRef);
		expect(second.sha256).toBe(first.sha256);
	});

	it("keeps project content refs in app userData, not project cwd", () => {
		const cwd = mkdtempSync(join(tmpdir(), "super-client-project-"));
		const p = projects.add(cwd);
		const s = sessions.create({ projectId: p.id });

		const ref = sessions.writeContentRef(s.id, {
			payload: "tool result",
			mediaType: "text/plain",
			source: "tool",
		});

		expect(sessions.readContentRef(s.id, ref.contentRef).data.toString()).toBe(
			"tool result",
		);
		expect(existsSync(join(cwd, ".scr-data"))).toBe(false);
		expect(
			existsSync(
				join(
					userRoot(),
					"projects",
					p.id,
					"sessions",
					s.id,
					"tool-outputs",
					"content-refs",
					`${ref.sha256}.bin`,
				),
			),
		).toBe(true);
		rmSync(cwd, { recursive: true, force: true });
	});

	it("content refs remain readable after fork copies the session subdirectory", () => {
		const src = sessions.create({ projectId: null });
		const ref = sessions.writeContentRef(src.id, {
			payload: "forked content payload",
			mediaType: "text/plain",
			source: "assistant",
		});

		const forked = sessions.fork(src.id, { targetProjectId: null });
		const read = sessions.readContentRef(forked.id, ref.contentRef);
		expect(read.data.toString("utf-8")).toBe("forked content payload");
	});

	it("rejects malformed refs and missing payloads", () => {
		const s = sessions.create({ projectId: null });
		expect(() =>
			sessions.readContentRef(
				s.id,
				"session-content://v1/tool-outputs/content-refs/../secret",
			),
		).toThrow("invalid contentRef");
		expect(() =>
			sessions.readContentRef(
				s.id,
				"blob://messages/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			),
		).toThrow("invalid contentRef");
		expect(() =>
			sessions.readContentRef(
				s.id,
				"session-content://v1/tool-outputs/content-refs/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			),
		).toThrow("contentRef not found");
	});

	it("does not write new content refs to deleted sessions", () => {
		const s = sessions.create({ projectId: null });
		sessions.delete(s.id);
		expect(() =>
			sessions.writeContentRef(s.id, {
				payload: "should not write",
				source: "assistant",
			}),
		).toThrow("cannot write contentRef for deleted session");
	});
});

// ─── G-5 Agent-only chatMode normalization ─────────────────────────────
describe("G-5 Agent-only chatMode normalization", () => {
	it("normalizes create chatMode to agent", () => {
		const s = sessions.create({ projectId: null, chatMode: "chat" });
		expect(s.chatMode).toBe("agent");
	});

	it("normalizes chatMode patches to agent even after first message", () => {
		const s = sessions.create({ projectId: null });
		sessions.appendEvent(s.id, {
			type: "user_message",
			id: "u1",
			ts: 1,
			content: "hi",
		});
		const updated = sessions.updateMeta(s.id, { chatMode: "chat" });
		expect(updated.chatMode).toBe("agent");
	});

	it("allows non-chatMode patches after messages exist", () => {
		const s = sessions.create({ projectId: null });
		sessions.appendEvent(s.id, {
			type: "user_message",
			id: "u1",
			ts: 1,
			content: "hi",
		});
		const updated = sessions.updateMeta(s.id, { name: "new-name" });
		expect(updated.name).toBe("new-name");
	});
});

// ─── G-3 injectLegacy ────────────────────────────────────
describe("G-3 injectLegacy (legacy import)", () => {
	it("preserves id, timestamps, messageCount", () => {
		sessions.injectLegacy(
			{
				id: "legacy-1",
				projectId: null,
				name: "Old Chat",
				chatMode: "chat",
				createdAt: 100,
				updatedAt: 200,
				messageCount: 2,
				preview: "hi",
			},
			[
				{ type: "user_message", id: "u1", ts: 100, content: "hi" },
				{
					type: "assistant_message",
					id: "a1",
					ts: 150,
					content: "hello",
				},
			],
		);
		const meta = sessions.getMeta("legacy-1");
		expect(meta.id).toBe("legacy-1");
		expect(meta.createdAt).toBe(100);
		expect(meta.messageCount).toBe(2);
		expect(meta.preview).toBe("hi");
		expect(existsSync(casualPath("legacy-1", ".jsonl"))).toBe(true);
	});

	it("no events → no jsonl file", () => {
		sessions.injectLegacy(
			{
				id: "empty-legacy",
				projectId: null,
				chatMode: "chat",
				createdAt: 0,
				updatedAt: 0,
				messageCount: 0,
			},
			[],
		);
		expect(existsSync(casualPath("empty-legacy", ".meta.json"))).toBe(true);
		expect(existsSync(casualPath("empty-legacy", ".jsonl"))).toBe(false);
	});
});
