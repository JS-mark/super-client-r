// @vitest-environment node
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
	app: {
		isPackaged: true,
		getAppPath: () => process.cwd(),
	},
}));

vi.mock("../../../utils/logger", () => ({
	logger: {
		withContext: () => ({
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
			debug: vi.fn(),
		}),
	},
}));

import { SkillService } from "../SkillService";
import type { SkillDownloader } from "../SkillDownloader";

/**
 * 在 dir 下写出一个结构合法的 Claude Code skill（SKILL.md + plugin.json）。
 */
async function writeValidSkill(dir: string, id = "demo-skill"): Promise<void> {
	await fs.mkdir(dir, { recursive: true });
	await fs.writeFile(
		path.join(dir, "SKILL.md"),
		[
			"---",
			`name: ${id}`,
			"description: A demo skill for tests",
			"allowed-tools: Read, Write",
			"---",
			"",
			"# Demo",
			"body",
		].join("\n"),
	);
	await fs.mkdir(path.join(dir, ".claude-plugin"), { recursive: true });
	await fs.writeFile(
		path.join(dir, ".claude-plugin", "plugin.json"),
		JSON.stringify({
			name: id,
			description: "A demo skill for tests",
			version: "1.0.0",
			author: { name: "tester" },
		}),
	);
}

describe("SkillService.installSkill", () => {
	let baseDir: string;
	let skillsDir: string;

	beforeEach(async () => {
		baseDir = await fs.mkdtemp(path.join(tmpdir(), "scr-skill-svc-"));
		skillsDir = path.join(baseDir, "skills");
		await fs.mkdir(skillsDir, { recursive: true });
	});

	afterEach(async () => {
		await fs.rm(baseDir, { recursive: true, force: true }).catch(() => {});
	});

	it("installs from a local directory and lists the skill", async () => {
		const src = path.join(baseDir, "src-skill");
		await writeValidSkill(src, "local-skill");

		const svc = new SkillService(skillsDir);
		const manifest = await svc.installSkill(src);

		expect(manifest.id).toBe("local-skill");
		expect(svc.listSkills().map((s) => s.id)).toContain("local-skill");
		expect(existsSync(path.join(skillsDir, "local-skill", "SKILL.md"))).toBe(
			true,
		);
	});

	it("installs from a URL via the injected downloader", async () => {
		const downloaded = path.join(baseDir, "downloaded");
		await writeValidSkill(downloaded, "url-skill");

		const cleanup = vi.fn(async () => {});
		const downloader = {
			downloadAndExtract: vi.fn(async () => ({ dir: downloaded, cleanup })),
		} as unknown as SkillDownloader;

		const svc = new SkillService(skillsDir, downloader);
		const manifest = await svc.installSkill("https://example.com/skill.zip");

		expect(manifest.id).toBe("url-skill");
		expect(svc.listSkills().map((s) => s.id)).toContain("url-skill");
		expect(existsSync(path.join(skillsDir, "url-skill", "SKILL.md"))).toBe(true);
		// 临时目录被清理
		expect(cleanup).toHaveBeenCalledOnce();
	});

	it("propagates downloader errors (e.g. invalid URL) and installs nothing", async () => {
		const downloader = {
			downloadAndExtract: vi.fn(async () => {
				throw new Error("Unsupported protocol");
			}),
		} as unknown as SkillDownloader;

		const svc = new SkillService(skillsDir, downloader);
		// http(s) 前缀才会走下载链路，交由 downloader 校验协议/来源
		await expect(
			svc.installSkill("https://bad.example.com/skill.zip"),
		).rejects.toThrow(/Unsupported protocol/);
		expect(svc.listSkills()).toHaveLength(0);
	});

	it("cleans up the download temp dir even when validation fails", async () => {
		// 下载出的目录里没有 SKILL.md → 校验失败
		const downloaded = path.join(baseDir, "invalid-download");
		await fs.mkdir(downloaded, { recursive: true });
		await fs.writeFile(path.join(downloaded, "random.txt"), "nope");

		const cleanup = vi.fn(async () => {});
		const downloader = {
			downloadAndExtract: vi.fn(async () => ({ dir: downloaded, cleanup })),
		} as unknown as SkillDownloader;

		const svc = new SkillService(skillsDir, downloader);
		await expect(
			svc.installSkill("https://example.com/invalid.zip"),
		).rejects.toThrow(/validation failed/i);

		// 未注册、目标目录无残留、临时目录已清理
		expect(svc.listSkills()).toHaveLength(0);
		expect(cleanup).toHaveBeenCalledOnce();
		const installed = await fs.readdir(skillsDir);
		expect(installed).toHaveLength(0);
	});

	it("rolls back the target dir if copying fails after validation", async () => {
		const src = path.join(baseDir, "src-skill-rollback");
		await writeValidSkill(src, "rollback-skill");

		const svc = new SkillService(skillsDir);

		// 让复制阶段抛错：stub copyFile
		const copySpy = vi
			.spyOn(fs, "copyFile")
			.mockRejectedValueOnce(new Error("disk full"));

		await expect(svc.installSkill(src)).rejects.toThrow(/disk full/);

		// 半成品目录被回滚删除
		expect(existsSync(path.join(skillsDir, "rollback-skill"))).toBe(false);
		expect(svc.listSkills()).toHaveLength(0);

		copySpy.mockRestore();
	});
});
