// @vitest-environment node
//
// A-5 SessionStorageService 测试。tmp dir + ProjectStorageService 真实联动。

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
const projectScrSessionPath = (
	cwd: string,
	sid: string,
	ext: ".jsonl" | ".meta.json",
) => join(cwd, ".scr-data", "sessions", `${sid}${ext}`);

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
		expect(existsSync(projectScrSessionPath(cwd, s.id, ".meta.json"))).toBe(
			false,
		);
		expect(existsSync(projectSessionPath(p.id, s.id, ".meta.json"))).toBe(
			true,
		);
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
		mkdirSync(join(sessionsDir, "legacy-1", "attachments"), { recursive: true });
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
		expect(existsSync(projectScrSessionPath(cwd, "legacy-1", ".jsonl"))).toBe(
			false,
		);
		expect(existsSync(join(cwd, ".scr-data"))).toBe(false);
		expect(existsSync(join(sessionsDir, "legacy-1.jsonl"))).toBe(true);
		rmSync(cwd, { recursive: true, force: true });
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
		expect(existsSync(projectScrSessionPath(cwd, f.id, ".jsonl"))).toBe(false);
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

// ─── G-5 chatMode lock ───────────────────────────────────
describe("G-5 chatMode lock (§10 C1)", () => {
	it("allows chatMode change before first message", () => {
		const s = sessions.create({ projectId: null, chatMode: "chat" });
		const updated = sessions.updateMeta(s.id, { chatMode: "agent" });
		expect(updated.chatMode).toBe("agent");
	});

	it("rejects chatMode change after first message persisted (jsonl exists)", () => {
		const s = sessions.create({ projectId: null, chatMode: "chat" });
		sessions.appendEvent(s.id, {
			type: "user_message",
			id: "u1",
			ts: 1,
			content: "hi",
		});
		expect(() => sessions.updateMeta(s.id, { chatMode: "agent" })).toThrow(
			/lock acquired/,
		);
	});

	it("allows non-chatMode patches even after lock", () => {
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
