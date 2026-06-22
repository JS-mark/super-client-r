// @vitest-environment node
//
// G-2 resolveConversationCwd tests —— 验证 per-session 沙箱目录布局：
//   - casual:  <userData>/chats/<userId>/session/<sid>
//   - project: <userData>/chats/<userId>/<projectId>/session/<sid>
// 以及 resolveConversationProjectRoot 在系统提示词侧的语义。

import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { initializeProjectStorage } from "../../storage/ProjectStorageService";
import { initializeSessionStorage } from "../../storage/SessionStorageService";
import {
	resolveConversationCwd,
	resolveConversationProjectRoot,
} from "../conversationCwd";

let baseDir: string;
let userData: string;

// 模拟 electron.app.getPath("userData") —— vitest 下 electron 不可用
vi.mock("electron", () => ({
	app: {
		getPath: (name: string) => {
			if (name === "userData") return userData;
			throw new Error(`unexpected getPath: ${name}`);
		},
	},
}));

beforeEach(() => {
	baseDir = mkdtempSync(join(tmpdir(), "super-client-cwd-test-"));
	userData = baseDir;
	const projectStorage = initializeProjectStorage(baseDir, "default");
	initializeSessionStorage(baseDir, "default", projectStorage);
});

afterEach(() => {
	rmSync(baseDir, { recursive: true, force: true });
});

describe("resolveConversationCwd (G-2)", () => {
	it("returns per-session sandbox under chats/<user>/session/<sid> for casual session", async () => {
		const { getSessionStorage } = await import(
			"../../storage/SessionStorageService"
		);
		const s = getSessionStorage().create({ projectId: null });
		const cwd = resolveConversationCwd(s.id);
		expect(cwd).toBe(join(userData, "chats", "default", "session", s.id));
		expect(existsSync(cwd)).toBe(true); // mkdir 副作用
	});

	it("returns chats/<user>/<projectId>/session/<sid> for project session, NOT project.cwd", async () => {
		const { getProjectStorage } = await import(
			"../../storage/ProjectStorageService"
		);
		const { getSessionStorage } = await import(
			"../../storage/SessionStorageService"
		);
		const p = getProjectStorage().add("/Users/test/myproject");
		const s = getSessionStorage().create({ projectId: p.id });
		const cwd = resolveConversationCwd(s.id);
		expect(cwd).toBe(
			join(userData, "chats", "default", p.id, "session", s.id),
		);
		// 关键回归：cwd 不应该等于 project.cwd（防止再次回归到老行为）
		expect(cwd).not.toBe(p.cwd);
		expect(existsSync(cwd)).toBe(true);
	});

	it("falls back to userData root for unknown session id", () => {
		expect(resolveConversationCwd("nonexistent")).toBe(userData);
	});
});

describe("resolveConversationProjectRoot (G-2)", () => {
	it("returns null for casual session", async () => {
		const { getSessionStorage } = await import(
			"../../storage/SessionStorageService"
		);
		const s = getSessionStorage().create({ projectId: null });
		expect(resolveConversationProjectRoot(s.id)).toBeNull();
	});

	it("returns project.cwd for project session", async () => {
		const { getProjectStorage } = await import(
			"../../storage/ProjectStorageService"
		);
		const { getSessionStorage } = await import(
			"../../storage/SessionStorageService"
		);
		const p = getProjectStorage().add("/Users/test/another-project");
		const s = getSessionStorage().create({ projectId: p.id });
		expect(resolveConversationProjectRoot(s.id)).toBe(p.cwd);
	});

	it("returns null if project was removed but session meta remains", async () => {
		const { getProjectStorage } = await import(
			"../../storage/ProjectStorageService"
		);
		const { getSessionStorage } = await import(
			"../../storage/SessionStorageService"
		);
		const p = getProjectStorage().add("/p");
		const s = getSessionStorage().create({ projectId: p.id });
		getProjectStorage().remove(p.id, { keepFiles: true });
		expect(resolveConversationProjectRoot(s.id)).toBeNull();
	});

	it("returns null for unknown session id", () => {
		expect(resolveConversationProjectRoot("nonexistent")).toBeNull();
	});
});
