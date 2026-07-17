// @vitest-environment node
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	PROJECT_RULES_MAX_BYTES,
	ProjectRulesReader,
	toProjectRulesSnapshotDto,
} from "../ProjectRulesReader";

describe("ProjectRulesReader", () => {
	let tmpRoot: string;

	beforeEach(async () => {
		tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "project-rules-"));
	});

	afterEach(async () => {
		await fs.rm(tmpRoot, { recursive: true, force: true });
	});

	async function makeProject(files: Record<string, string>): Promise<string> {
		const cwd = await fs.mkdtemp(path.join(tmpRoot, "proj-"));
		for (const [name, content] of Object.entries(files)) {
			await fs.writeFile(path.join(cwd, name), content, "utf8");
		}
		return cwd;
	}

	it("reads AGENTS.md when present with sha256 + byteLength + resolved path", async () => {
		const content = "# Project rules\n\nUse superpowers only.\n";
		const cwd = await makeProject({ "AGENTS.md": content });
		const reader = new ProjectRulesReader({ now: () => 1_000 });

		const snapshot = await reader.readProjectRules(cwd);

		expect(snapshot.readAt).toBe(1_000);
		expect(snapshot.claudeMd).toBeUndefined();
		expect(snapshot.agentsMd).toBeDefined();
		const agentsMd = snapshot.agentsMd!;
		expect(agentsMd.content).toBe(content);
		expect(agentsMd.byteLength).toBe(Buffer.byteLength(content, "utf8"));
		expect(agentsMd.truncated).toBe(false);
		expect(agentsMd.sha256).toBe(
			createHash("sha256").update(Buffer.from(content, "utf8")).digest("hex"),
		);
		// realpath resolves the actual file — must live inside the cwd realpath.
		const cwdReal = await fs.realpath(cwd);
		expect(agentsMd.path.startsWith(cwdReal)).toBe(true);
		expect(path.basename(agentsMd.path)).toBe("AGENTS.md");
	});

	it("reads CLAUDE.md when present alongside AGENTS.md", async () => {
		const cwd = await makeProject({
			"AGENTS.md": "agents",
			"CLAUDE.md": "claude",
		});
		const reader = new ProjectRulesReader();

		const snapshot = await reader.readProjectRules(cwd);

		expect(snapshot.agentsMd?.content).toBe("agents");
		expect(snapshot.claudeMd?.content).toBe("claude");
	});

	it("builds a renderer-safe snapshot DTO without path or content", async () => {
		const cwd = await makeProject({
			"AGENTS.md": "agents",
			"CLAUDE.md": "",
		});
		const reader = new ProjectRulesReader({ now: () => 2_000 });

		const dto = toProjectRulesSnapshotDto(await reader.readProjectRules(cwd));

		expect(dto).toEqual({
			readAt: 2_000,
			files: [
				expect.objectContaining({
					filename: "AGENTS.md",
					byteLength: Buffer.byteLength("agents", "utf8"),
					truncated: false,
					injected: true,
				}),
				expect.objectContaining({
					filename: "CLAUDE.md",
					byteLength: 0,
					truncated: false,
					injected: false,
				}),
			],
		});
		expect(JSON.stringify(dto)).not.toContain(cwd);
		expect(JSON.stringify(dto)).not.toContain("agents");
	});

	it("reads CLAUDE.md alone when AGENTS.md is absent", async () => {
		const cwd = await makeProject({ "CLAUDE.md": "just claude" });
		const reader = new ProjectRulesReader();

		const snapshot = await reader.readProjectRules(cwd);

		expect(snapshot.agentsMd).toBeUndefined();
		expect(snapshot.claudeMd?.content).toBe("just claude");
	});

	it("returns an empty snapshot when neither file exists", async () => {
		const cwd = await makeProject({});
		const reader = new ProjectRulesReader({ now: () => 42 });

		const snapshot = await reader.readProjectRules(cwd);

		expect(snapshot).toEqual({ readAt: 42 });
	});

	it("returns an empty snapshot when the cwd itself does not exist (no throw)", async () => {
		const missing = path.join(tmpRoot, "does", "not", "exist");
		const reader = new ProjectRulesReader({ now: () => 7 });

		const snapshot = await reader.readProjectRules(missing);

		expect(snapshot).toEqual({ readAt: 7 });
	});

	it("returns an empty snapshot when cwd is falsy / not a string", async () => {
		const reader = new ProjectRulesReader({ now: () => 5 });
		expect(await reader.readProjectRules("")).toEqual({ readAt: 5 });
		// @ts-expect-error — deliberate misuse coverage
		expect(await reader.readProjectRules(undefined)).toEqual({ readAt: 5 });
	});

	it("truncates content larger than the byte cap and reports truncated:true with the original sha", async () => {
		const bigContent = "A".repeat(PROJECT_RULES_MAX_BYTES + 1024);
		const cwd = await makeProject({ "AGENTS.md": bigContent });
		const reader = new ProjectRulesReader();

		const snapshot = await reader.readProjectRules(cwd);

		expect(snapshot.agentsMd).toBeDefined();
		const agentsMd = snapshot.agentsMd!;
		expect(agentsMd.truncated).toBe(true);
		expect(agentsMd.byteLength).toBe(bigContent.length);
		expect(agentsMd.content.length).toBe(PROJECT_RULES_MAX_BYTES);
		// sha256 must reflect the *full* file bytes, not the truncated slice.
		expect(agentsMd.sha256).toBe(
			createHash("sha256").update(Buffer.from(bigContent, "utf8")).digest("hex"),
		);
	});

	it("honours a smaller custom byte cap", async () => {
		const content = "hello world";
		const cwd = await makeProject({ "AGENTS.md": content });
		const reader = new ProjectRulesReader({ maxBytes: 4 });

		const snapshot = await reader.readProjectRules(cwd);

		expect(snapshot.agentsMd?.content).toBe("hell");
		expect(snapshot.agentsMd?.truncated).toBe(true);
		expect(snapshot.agentsMd?.byteLength).toBe(content.length);
	});

	it("rejects a symlink whose target escapes the project root", async () => {
		const cwd = await makeProject({});
		// Put the real file OUTSIDE the project cwd but inside tmpRoot, then
		// symlink AGENTS.md → that outside file. isInside() must refuse.
		const outsideDir = await fs.mkdtemp(path.join(tmpRoot, "outside-"));
		const outsideFile = path.join(outsideDir, "leak.md");
		await fs.writeFile(outsideFile, "secret rules", "utf8");
		let symlinkSupported = true;
		try {
			await fs.symlink(outsideFile, path.join(cwd, "AGENTS.md"));
		} catch {
			// Some CI filesystems disallow symlinks; skip this branch there.
			symlinkSupported = false;
		}
		if (!symlinkSupported) return;

		const reader = new ProjectRulesReader();
		const snapshot = await reader.readProjectRules(cwd);

		expect(snapshot.agentsMd).toBeUndefined();
	});

	it("resolves an in-cwd symlink safely (target still under cwd)", async () => {
		const cwd = await makeProject({});
		const realFile = path.join(cwd, ".rules.md");
		await fs.writeFile(realFile, "in-tree rules", "utf8");
		let symlinkSupported = true;
		try {
			await fs.symlink(realFile, path.join(cwd, "AGENTS.md"));
		} catch {
			symlinkSupported = false;
		}
		if (!symlinkSupported) return;

		const reader = new ProjectRulesReader();
		const snapshot = await reader.readProjectRules(cwd);

		expect(snapshot.agentsMd?.content).toBe("in-tree rules");
	});

	it("ignores when AGENTS.md is a directory rather than a file", async () => {
		const cwd = await makeProject({});
		await fs.mkdir(path.join(cwd, "AGENTS.md"));

		const reader = new ProjectRulesReader();
		const snapshot = await reader.readProjectRules(cwd);

		expect(snapshot.agentsMd).toBeUndefined();
	});
});
