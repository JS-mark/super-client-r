/**
 * Skill URL 下载 + 解压模块
 *
 * 职责：
 *   1. 校验远程 URL（协议白名单，防 SSRF/非法来源）
 *   2. 带超时 / 大小上限 / content-type 校验地下载 zip
 *   3. 安全解压到临时目录（防 zip-slip 目录穿越）
 *   4. 归一化解包结构（单顶层目录自动下钻）
 *
 * 依赖注入设计：
 *   - `fetchImpl` 默认使用全局 fetch，测试可注入 stub 避免真实网络。
 *   - `extractZip` 默认动态 require adm-zip（与 recovery/zipHelper 同策略：
 *     package.json 已声明 adm-zip 但 dev 环境 `pnpm install` 可能延后），
 *     测试注入 stub 避免拉起 adm-zip 与真实文件。
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/** 下载体积上限（50MB，与 SkillValidator MAX_TOTAL_SIZE 对齐） */
const MAX_DOWNLOAD_SIZE = 50 * 1024 * 1024;
/** 下载超时（毫秒） */
const DOWNLOAD_TIMEOUT_MS = 30_000;

/** 允许的 content-type 前缀（zip 归档常见取值） */
const ALLOWED_CONTENT_TYPES = [
	"application/zip",
	"application/x-zip-compressed",
	"application/octet-stream",
	"application/x-zip",
	"binary/octet-stream",
];

export class SkillDownloadError extends Error {
	constructor(
		message: string,
		readonly code: string,
	) {
		super(message);
		this.name = "SkillDownloadError";
	}
}

/** 解压器：将 zip buffer 解压到 destDir。默认动态加载 adm-zip。 */
export type ZipExtractor = (
	buffer: Buffer,
	destDir: string,
) => Promise<void> | void;

/** 下载器：返回 { buffer, contentType }。默认使用全局 fetch。 */
export type FetchImpl = (
	url: string,
	init: { signal: AbortSignal },
) => Promise<{
	ok: boolean;
	status: number;
	headers: { get(name: string): string | null };
	arrayBuffer(): Promise<ArrayBuffer>;
}>;

export interface SkillDownloaderOptions {
	fetchImpl?: FetchImpl;
	extractZip?: ZipExtractor;
	maxSize?: number;
	timeoutMs?: number;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

interface AdmZipEntry {
	entryName: string;
	isDirectory: boolean;
}

interface AdmZipInstance {
	getEntries(): AdmZipEntry[];
	extractAllTo(targetPath: string, overwrite?: boolean): void;
}

type AdmZipCtor = new (input?: Buffer) => AdmZipInstance;

/**
 * 默认解压器：动态 require adm-zip，逐条校验 entry 后再 extractAllTo，
 * 防止 zip-slip（entry 名含 `..` 或绝对路径穿出 destDir）。
 */
function defaultExtractZip(buffer: Buffer, destDir: string): void {
	let AdmZip: AdmZipCtor;
	try {
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const mod = require("adm-zip") as unknown;
		if (typeof mod !== "function") {
			throw new Error("adm-zip module did not export a constructor");
		}
		AdmZip = mod as AdmZipCtor;
	} catch (error) {
		throw new SkillDownloadError(
			`adm-zip is not installed — run \`pnpm install\`. Underlying: ${
				error instanceof Error ? error.message : String(error)
			}`,
			"skill.download.zip-dependency-missing",
		);
	}

	const zip = new AdmZip(buffer);
	const resolvedDest = path.resolve(destDir);

	// zip-slip 防护：任何 entry 解出的绝对路径必须落在 destDir 内。
	for (const entry of zip.getEntries()) {
		const target = path.resolve(resolvedDest, entry.entryName);
		if (target !== resolvedDest && !target.startsWith(resolvedDest + path.sep)) {
			throw new SkillDownloadError(
				`Zip entry "${entry.entryName}" escapes the extraction directory`,
				"skill.download.zip-slip",
			);
		}
	}

	zip.extractAllTo(resolvedDest, true);
}

export class SkillDownloader {
	private readonly fetchImpl: FetchImpl;
	private readonly extractZip: ZipExtractor;
	private readonly maxSize: number;
	private readonly timeoutMs: number;

	constructor(options: SkillDownloaderOptions = {}) {
		this.fetchImpl =
			options.fetchImpl ?? (globalThis.fetch as unknown as FetchImpl);
		this.extractZip = options.extractZip ?? defaultExtractZip;
		this.maxSize = options.maxSize ?? MAX_DOWNLOAD_SIZE;
		this.timeoutMs = options.timeoutMs ?? DOWNLOAD_TIMEOUT_MS;
	}

	/**
	 * 校验 URL：仅允许 http(s)，拒绝非法/畸形来源。
	 */
	static validateUrl(url: string): void {
		let parsed: URL;
		try {
			parsed = new URL(url);
		} catch {
			throw new SkillDownloadError(
				`Invalid skill URL: ${url}`,
				"skill.download.invalid-url",
			);
		}
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
			throw new SkillDownloadError(
				`Unsupported protocol "${parsed.protocol}" — only http(s) is allowed`,
				"skill.download.unsupported-protocol",
			);
		}
	}

	/**
	 * 从 URL 下载并解压 skill 到一个新建的临时目录。
	 * 返回临时目录路径与清理函数；调用方负责在安装完成/失败后调用 cleanup。
	 */
	async downloadAndExtract(url: string): Promise<{
		dir: string;
		cleanup: () => Promise<void>;
	}> {
		SkillDownloader.validateUrl(url);

		const buffer = await this.download(url);

		const tmpDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "scr-skill-download-"),
		);
		const cleanup = async () => {
			await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
		};

		try {
			await this.extractZip(buffer, tmpDir);
		} catch (error) {
			await cleanup();
			throw error;
		}

		// 归一化：若解压后只有单个顶层目录，则下钻到该目录。
		const dir = await this.resolveSkillRoot(tmpDir);
		return { dir, cleanup };
	}

	private async download(url: string): Promise<Buffer> {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), this.timeoutMs);

		let response: Awaited<ReturnType<FetchImpl>>;
		try {
			response = await this.fetchImpl(url, { signal: controller.signal });
		} catch (error) {
			const aborted =
				error instanceof Error &&
				(error.name === "AbortError" || controller.signal.aborted);
			throw new SkillDownloadError(
				aborted
					? `Download timed out after ${this.timeoutMs}ms: ${url}`
					: `Failed to download skill from ${url}: ${
							error instanceof Error ? error.message : String(error)
						}`,
				aborted ? "skill.download.timeout" : "skill.download.network-error",
			);
		} finally {
			clearTimeout(timer);
		}

		if (!response.ok) {
			throw new SkillDownloadError(
				`Download failed with HTTP ${response.status}: ${url}`,
				"skill.download.http-error",
			);
		}

		const contentType = (response.headers.get("content-type") ?? "")
			.split(";")[0]
			.trim()
			.toLowerCase();
		if (contentType && !ALLOWED_CONTENT_TYPES.includes(contentType)) {
			throw new SkillDownloadError(
				`Unexpected content-type "${contentType}" — expected a zip archive`,
				"skill.download.invalid-content-type",
			);
		}

		const contentLength = Number(response.headers.get("content-length"));
		if (Number.isFinite(contentLength) && contentLength > this.maxSize) {
			throw new SkillDownloadError(
				`Skill archive (${contentLength} bytes) exceeds ${this.maxSize} byte limit`,
				"skill.download.too-large",
			);
		}

		const buffer = Buffer.from(await response.arrayBuffer());
		if (buffer.byteLength > this.maxSize) {
			throw new SkillDownloadError(
				`Skill archive (${buffer.byteLength} bytes) exceeds ${this.maxSize} byte limit`,
				"skill.download.too-large",
			);
		}

		return buffer;
	}

	/**
	 * 若目录下只有一个子目录（zip 常见的单顶层文件夹结构），下钻返回它；
	 * 否则返回原目录。
	 */
	private async resolveSkillRoot(dir: string): Promise<string> {
		const entries = await fs.readdir(dir, { withFileTypes: true });
		const visible = entries.filter((e) => !e.name.startsWith("__MACOSX"));
		if (visible.length === 1 && visible[0].isDirectory()) {
			return path.join(dir, visible[0].name);
		}
		return dir;
	}
}
