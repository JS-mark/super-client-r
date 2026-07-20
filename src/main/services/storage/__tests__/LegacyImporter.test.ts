// @vitest-environment node
//
// G-3 LegacyImporter tests — detect / importAll / 幂等。
//
// 把 electron `app.getPath("userData")` mock 到 tmp dir，模拟老 chats/ 数据，
// 验证：detect 看到正确数量；importAll 转出 SessionMeta + JSONL；二次调用幂等；
// migrationV2Done flag 行为。

import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
	app: { getPath: vi.fn() },
}));

import { app } from "electron";
import { LegacyImporter } from "../LegacyImporter";
import { ProjectStorageService } from "../ProjectStorageService";
import { SessionStorageService } from "../SessionStorageService";

let baseDir: string;
let userDataDir: string;
let projects: ProjectStorageService;
let sessions: SessionStorageService;

const userId = "default";

function makeStoreManager() {
	let done = false;
	return {
		isMigrationV2Done: () => done,
		markMigrationV2Done: () => {
			done = true;
		},
		_getDone: () => done,
	};
}

function writeLegacyConv(
	id: string,
	meta: Record<string, unknown>,
	messages: Array<Record<string, unknown>>,
) {
	const dir = join(userDataDir, "chats", userId, id);
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		join(dir, "metadata.json"),
		JSON.stringify({ id, ...meta }, null, 2),
		"utf-8",
	);
	writeFileSync(
		join(dir, "messages.json"),
		JSON.stringify(messages, null, 2),
		"utf-8",
	);
}

beforeEach(() => {
	baseDir = mkdtempSync(join(tmpdir(), "super-client-import-test-"));
	userDataDir = join(baseDir, "userData");
	mkdirSync(userDataDir, { recursive: true });
	(app.getPath as ReturnType<typeof vi.fn>).mockReturnValue(userDataDir);

	const newRoot = join(baseDir, "super-client");
	projects = new ProjectStorageService(newRoot, userId);
	sessions = new SessionStorageService(newRoot, userId, projects);
});

afterEach(() => {
	rmSync(baseDir, { recursive: true, force: true });
	vi.clearAllMocks();
});

describe("LegacyImporter.detect", () => {
	it("returns 0 when no legacy dir exists", () => {
		const sm = makeStoreManager();
		const importer = new LegacyImporter(sessions, sm as never, userId);
		const info = importer.detect();
		expect(info.count).toBe(0);
		expect(info.alreadyImported).toBe(false);
		expect(info.preview).toEqual([]);
	});

	it("counts only directories with messages.json", () => {
		writeLegacyConv("c1", { name: "First" }, []);
		writeLegacyConv("c2", { name: "Second" }, []);
		// 一个目录没有 messages.json — 应被忽略
		mkdirSync(join(userDataDir, "chats", userId, "c3-empty"), {
			recursive: true,
		});
		const sm = makeStoreManager();
		const importer = new LegacyImporter(sessions, sm as never, userId);
		const info = importer.detect();
		expect(info.count).toBe(2);
	});

	it("preview is sorted by updatedAt desc, max 5", () => {
		for (let i = 0; i < 7; i++) {
			writeLegacyConv(`c${i}`, { name: `Conv ${i}`, updatedAt: i * 1000 }, []);
		}
		const sm = makeStoreManager();
		const importer = new LegacyImporter(sessions, sm as never, userId);
		const info = importer.detect();
		expect(info.count).toBe(7);
		expect(info.preview).toHaveLength(5);
		// 最新（i=6）应排在第一位
		expect(info.preview[0].name).toBe("Conv 6");
	});

	it("respects existing migrationV2Done flag", () => {
		writeLegacyConv("c1", { name: "x" }, []);
		const sm = makeStoreManager();
		sm.markMigrationV2Done();
		const importer = new LegacyImporter(sessions, sm as never, userId);
		expect(importer.detect().alreadyImported).toBe(true);
	});
});

describe("LegacyImporter.importAll", () => {
	it("imports legacy convs as casual sessions and sets done flag", () => {
		writeLegacyConv(
			"old-1",
			{ name: "Old A", createdAt: 100, updatedAt: 200, messageCount: 1 },
			[
				{
					id: "m1",
					role: "user",
					content: "hello",
					timestamp: 150,
				},
			],
		);
		const sm = makeStoreManager();
		const importer = new LegacyImporter(sessions, sm as never, userId);
		const result = importer.importAll();

		expect(result.total).toBe(1);
		expect(result.imported).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.failures).toEqual([]);
		expect(result.failed).toBe(0);
		expect(sm._getDone()).toBe(true);

		const meta = sessions.getMeta("old-1");
		expect(meta.id).toBe("old-1");
		expect(meta.projectId).toBeNull();
		expect(meta.name).toBe("Old A");
		expect(meta.importSource?.id).toBe("old-1");
		expect(meta.createdAt).toBe(100);
		// 至少 1 条 user_message 算入 messageCount
		expect(meta.messageCount).toBeGreaterThan(0);
	});

	it("is idempotent: rerun skips already-imported", () => {
		writeLegacyConv(
			"id-1",
			{ name: "X", createdAt: 1, updatedAt: 2, messageCount: 0 },
			[{ id: "m", role: "user", content: "x", timestamp: 1 }],
		);
		const sm = makeStoreManager();
		const importer = new LegacyImporter(sessions, sm as never, userId);
		const r1 = importer.importAll();
		expect(r1.imported).toBe(1);

		const r2 = importer.importAll();
		expect(r2.imported).toBe(0);
		expect(r2.skipped).toBe(1);
	});

	it("preserves attachments dir", () => {
		writeLegacyConv("conv-att", { name: "A" }, []);
		const att = join(userDataDir, "chats", userId, "conv-att", "attachments");
		mkdirSync(att, { recursive: true });
		writeFileSync(join(att, "file.txt"), "hi");

		const sm = makeStoreManager();
		const importer = new LegacyImporter(sessions, sm as never, userId);
		importer.importAll();

		const newAtt = join(
			sessions.getSessionDir("conv-att"),
			"attachments",
			"file.txt",
		);
		expect(existsSync(newAtt)).toBe(true);
		expect(readFileSync(newAtt, "utf-8")).toBe("hi");
	});

	it("collects per-conversation failures without aborting batch", () => {
		writeLegacyConv("good", { name: "G" }, []);
		// 写一个坏的 messages.json — 会抛 JSON.parse
		const badDir = join(userDataDir, "chats", userId, "bad");
		mkdirSync(badDir, { recursive: true });
		writeFileSync(join(badDir, "messages.json"), "not json", "utf-8");

		const sm = makeStoreManager();
		const importer = new LegacyImporter(sessions, sm as never, userId);
		const result = importer.importAll();
		expect(result.imported).toBe(1);
		expect(result.failures).toHaveLength(1);
		expect(result.failures[0].id).toBe("bad");
		expect(result.failed).toBe(1);
		expect(result.failures[0].code).toBe("invalidMessagesJson");
		// 失败不置 done flag，避免静默关闭后续 retry。
		expect(sm._getDone()).toBe(false);
	});

	it("rerun after fixing a failed item skips imported sessions and then marks done", () => {
		writeLegacyConv("good", { name: "G" }, []);
		const badDir = join(userDataDir, "chats", userId, "bad");
		mkdirSync(badDir, { recursive: true });
		writeFileSync(join(badDir, "messages.json"), "not json", "utf-8");

		const sm = makeStoreManager();
		const importer = new LegacyImporter(sessions, sm as never, userId);
		const first = importer.importAll();
		expect(first.imported).toBe(1);
		expect(first.failed).toBe(1);
		expect(sm._getDone()).toBe(false);

		writeFileSync(
			join(badDir, "messages.json"),
			JSON.stringify([
				{ id: "m-bad", role: "user", content: "fixed", timestamp: 1 },
			]),
			"utf-8",
		);
		const second = importer.importAll();
		expect(second.imported).toBe(1);
		expect(second.skipped).toBe(1);
		expect(second.failed).toBe(0);
		expect(second.failures).toEqual([]);
		expect(sm._getDone()).toBe(true);
		expect(sessions.getMeta("bad").importSource?.id).toBe("bad");
	});

	it("no legacy dir → marks done immediately, no error", () => {
		const sm = makeStoreManager();
		const importer = new LegacyImporter(sessions, sm as never, userId);
		const result = importer.importAll();
		expect(result.imported).toBe(0);
		expect(result.total).toBe(0);
		expect(sm._getDone()).toBe(true);
	});
});

describe("LegacyImporter.purge", () => {
	it("removes the legacy dir after a successful importAll", () => {
		writeLegacyConv("c1", { name: "Kept" }, [
			{ role: "user", content: "hi" },
		]);
		const legacyRoot = join(userDataDir, "chats", userId);
		expect(existsSync(legacyRoot)).toBe(true);

		const sm = makeStoreManager();
		const importer = new LegacyImporter(sessions, sm as never, userId);
		const result = importer.importAll();
		expect(result.imported).toBe(1);
		expect(sm._getDone()).toBe(true);

		const purge = importer.purge();
		expect(purge.purged).toBe(true);
		expect(purge.previousCount).toBe(1);
		expect(existsSync(legacyRoot)).toBe(false);
		// detect() afterwards reports count 0 and stays alreadyImported=true
		// (migrationV2Done flag is deliberately left set).
		const after = importer.detect();
		expect(after.count).toBe(0);
		expect(after.alreadyImported).toBe(true);
	});

	it("purge refuses when un-imported chats are still present", () => {
		writeLegacyConv("c1", { name: "Un-imported" }, []);
		const sm = makeStoreManager();
		const importer = new LegacyImporter(sessions, sm as never, userId);
		// Did NOT run importAll — migrationV2Done still false.
		expect(sm._getDone()).toBe(false);
		expect(() => importer.purge()).toThrow(/un-imported|refusing/i);
		// Dir untouched.
		expect(existsSync(join(userDataDir, "chats", userId))).toBe(true);
	});

	it("purge returns purged:false when the legacy dir doesn't exist", () => {
		const sm = makeStoreManager();
		const importer = new LegacyImporter(sessions, sm as never, userId);
		// No writeLegacyConv → dir doesn't exist.
		const result = importer.purge();
		expect(result.purged).toBe(false);
		expect(result.previousCount).toBe(0);
	});
});
