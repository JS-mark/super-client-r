// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	SkillDownloadError,
	SkillDownloader,
	type FetchImpl,
} from "../SkillDownloader";

/** 构造一个最小的 fetch 响应对象 */
function makeResponse(opts: {
	ok?: boolean;
	status?: number;
	contentType?: string;
	contentLength?: string;
	body?: Buffer;
}): Awaited<ReturnType<FetchImpl>> {
	const headers = new Map<string, string>();
	if (opts.contentType) headers.set("content-type", opts.contentType);
	if (opts.contentLength) headers.set("content-length", opts.contentLength);
	const body = opts.body ?? Buffer.from("zip-bytes");
	return {
		ok: opts.ok ?? true,
		status: opts.status ?? 200,
		headers: { get: (name: string) => headers.get(name.toLowerCase()) ?? null },
		arrayBuffer: async () => {
			const ab = new ArrayBuffer(body.byteLength);
			new Uint8Array(ab).set(body);
			return ab;
		},
	};
}

describe("SkillDownloader.validateUrl", () => {
	it("accepts http(s) URLs", () => {
		expect(() =>
			SkillDownloader.validateUrl("https://example.com/skill.zip"),
		).not.toThrow();
		expect(() =>
			SkillDownloader.validateUrl("http://example.com/skill.zip"),
		).not.toThrow();
	});

	it("rejects malformed URLs", () => {
		expect(() => SkillDownloader.validateUrl("not a url")).toThrow(
			SkillDownloadError,
		);
	});

	it("rejects non-http protocols (file://, ftp://)", () => {
		expect(() => SkillDownloader.validateUrl("file:///etc/passwd")).toThrow(
			/only http/i,
		);
		expect(() => SkillDownloader.validateUrl("ftp://example.com/x.zip")).toThrow(
			SkillDownloadError,
		);
	});
});

describe("SkillDownloader.downloadAndExtract", () => {
	const created: string[] = [];

	afterEach(async () => {
		for (const dir of created.splice(0)) {
			await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
		}
	});

	it("downloads, extracts, and cleans up the temp dir", async () => {
		const fetchImpl = vi.fn(async () =>
			makeResponse({ contentType: "application/zip" }),
		) as unknown as FetchImpl;

		const extractZip = vi.fn((_buf: Buffer, destDir: string) => {
			// 模拟解压出单顶层目录结构
			const inner = path.join(destDir, "my-skill");
			return fs
				.mkdir(inner, { recursive: true })
				.then(() => fs.writeFile(path.join(inner, "SKILL.md"), "x"));
		});

		const downloader = new SkillDownloader({ fetchImpl, extractZip });
		const { dir, cleanup } = await downloader.downloadAndExtract(
			"https://example.com/skill.zip",
		);
		created.push(path.dirname(dir));

		// 单顶层目录被自动下钻
		expect(path.basename(dir)).toBe("my-skill");
		expect(existsSync(path.join(dir, "SKILL.md"))).toBe(true);
		expect(fetchImpl).toHaveBeenCalledOnce();

		await cleanup();
		expect(existsSync(dir)).toBe(false);
	});

	it("throws http-error on non-ok response", async () => {
		const fetchImpl = vi.fn(async () =>
			makeResponse({ ok: false, status: 404 }),
		) as unknown as FetchImpl;
		const downloader = new SkillDownloader({ fetchImpl });

		await expect(
			downloader.downloadAndExtract("https://example.com/missing.zip"),
		).rejects.toMatchObject({ code: "skill.download.http-error" });
	});

	it("rejects invalid content-type", async () => {
		const fetchImpl = vi.fn(async () =>
			makeResponse({ contentType: "text/html" }),
		) as unknown as FetchImpl;
		const downloader = new SkillDownloader({ fetchImpl });

		await expect(
			downloader.downloadAndExtract("https://example.com/page.html"),
		).rejects.toMatchObject({ code: "skill.download.invalid-content-type" });
	});

	it("rejects archives exceeding the size limit via content-length", async () => {
		const fetchImpl = vi.fn(async () =>
			makeResponse({
				contentType: "application/zip",
				contentLength: String(999_999_999),
			}),
		) as unknown as FetchImpl;
		const downloader = new SkillDownloader({ fetchImpl, maxSize: 1024 });

		await expect(
			downloader.downloadAndExtract("https://example.com/huge.zip"),
		).rejects.toMatchObject({ code: "skill.download.too-large" });
	});

	it("rejects archives exceeding the size limit by actual bytes", async () => {
		const fetchImpl = vi.fn(async () =>
			makeResponse({
				contentType: "application/zip",
				body: Buffer.alloc(2048),
			}),
		) as unknown as FetchImpl;
		const downloader = new SkillDownloader({ fetchImpl, maxSize: 1024 });

		await expect(
			downloader.downloadAndExtract("https://example.com/huge.zip"),
		).rejects.toMatchObject({ code: "skill.download.too-large" });
	});

	it("maps aborted fetch to a timeout error", async () => {
		const fetchImpl = vi.fn(async (_url, init: { signal: AbortSignal }) => {
			const err = new Error("aborted");
			err.name = "AbortError";
			// 反映 abort 状态
			void init;
			throw err;
		}) as unknown as FetchImpl;
		const downloader = new SkillDownloader({ fetchImpl, timeoutMs: 5 });

		await expect(
			downloader.downloadAndExtract("https://example.com/slow.zip"),
		).rejects.toMatchObject({ code: "skill.download.timeout" });
	});

	it("cleans up the temp dir when extraction fails", async () => {
		const capturedDirs: string[] = [];
		const fetchImpl = vi.fn(async () =>
			makeResponse({ contentType: "application/zip" }),
		) as unknown as FetchImpl;
		const extractZip = vi.fn((_buf: Buffer, destDir: string) => {
			capturedDirs.push(destDir);
			throw new SkillDownloadError("boom", "skill.download.zip-slip");
		});
		const downloader = new SkillDownloader({ fetchImpl, extractZip });

		await expect(
			downloader.downloadAndExtract("https://example.com/bad.zip"),
		).rejects.toMatchObject({ code: "skill.download.zip-slip" });

		// 临时目录已被清理
		expect(capturedDirs).toHaveLength(1);
		expect(existsSync(capturedDirs[0])).toBe(false);
	});

	it("keeps the extract dir as-is when it has multiple top-level entries", async () => {
		const fetchImpl = vi.fn(async () =>
			makeResponse({ contentType: "application/zip" }),
		) as unknown as FetchImpl;
		const extractZip = vi.fn(async (_buf: Buffer, destDir: string) => {
			await fs.writeFile(path.join(destDir, "SKILL.md"), "x");
			await fs.mkdir(path.join(destDir, "commands"), { recursive: true });
		});
		const downloader = new SkillDownloader({ fetchImpl, extractZip });

		const { dir, cleanup } = await downloader.downloadAndExtract(
			"https://example.com/skill.zip",
		);
		created.push(dir);
		expect(existsSync(path.join(dir, "SKILL.md"))).toBe(true);
		// 未下钻：读到根目录内容
		expect(readFileSync(path.join(dir, "SKILL.md"), "utf-8")).toBe("x");
		await cleanup();
	});
});
