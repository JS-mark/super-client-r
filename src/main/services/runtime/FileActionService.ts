/**
 * FileActionService
 *
 * Provides policy-aware file operations triggered from the chat file artifact UI:
 *  - open       → shell.openPath
 *  - reveal     → shell.showItemInFolder
 *  - copyPath   → clipboard.writeText
 *  - detectOpenTargets → returns available editors/terminals/finders for a path
 *  - openWith   → launches a specific target app for a path
 *  - getAppIcon → returns a data URL for a target app's icon
 *
 * R-6: external-app actions (`open`, `openWith`) are now policy-evaluated
 * against `WorkspaceRuntimePolicy.externalAppAccess`. When a workspace sets
 * `externalAppAccess: "blocked"` and runtime enforcement is on, these calls
 * return `{ ok: false, error }` without invoking shell/spawn. Other kinds
 * (file-read for reveal/copyPath) remain audit-only — see RuntimePolicyService.evaluate.
 */

import { clipboard, nativeImage, shell } from "electron";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync, execSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { logger } from "../../utils/logger";
import type {
	FileOpenTarget,
	RuntimeOperationContext,
	RuntimeOperationKind,
	WorkspaceRuntimePolicy,
} from "@super-client/shared-types/chat";

import { getRuntimePolicyService } from "./RuntimePolicyService";
import { getProjectStorage } from "../storage/ProjectStorageService";

const CLI_CACHE_TTL_MS = 60_000;

interface CliCacheEntry {
	available: boolean;
	expires: number;
}

/** Result returned by open/reveal/copyPath/openWith. */
export interface FileActionResult {
	ok: boolean;
	error?: string;
	code?: string;
	messageKey?: string;
	details?: Record<string, unknown>;
}

const TERMINAL_RELEVANT_EXTENSIONS = new Set([
	".sh",
	".bash",
	".zsh",
	".fish",
	".ps1",
	".bat",
	".cmd",
]);

/** macOS bundle display name for `open -a "<name>"`. */
const MACOS_BUNDLE_NAMES: Record<string, string> = {
	vscode: "Visual Studio Code",
	sublime: "Sublime Text",
	finder: "Finder",
	terminal: "Terminal",
	iterm: "iTerm",
	warp: "Warp",
	xcode: "Xcode",
	"android-studio": "Android Studio",
	trae: "Trae",
};

/** Resolve macOS .app bundle path for a target id, or null when missing. */
function resolveMacAppPath(id: string): string | null {
	const tryFirst = (paths: string[]): string | null => {
		for (const p of paths) if (existsSync(p)) return p;
		return null;
	};
	switch (id) {
		case "vscode":
			return tryFirst([
				"/Applications/Visual Studio Code.app",
				"/Applications/Visual Studio Code - Insiders.app",
			]);
		case "sublime":
			return existsAppPath("/Applications/Sublime Text.app");
		case "finder":
			return existsAppPath("/System/Library/CoreServices/Finder.app");
		case "terminal":
			return tryFirst([
				"/System/Applications/Utilities/Terminal.app",
				"/Applications/Utilities/Terminal.app",
			]);
		case "iterm":
			return existsAppPath("/Applications/iTerm.app");
		case "warp":
			return existsAppPath("/Applications/Warp.app");
		case "xcode":
			return existsAppPath("/Applications/Xcode.app");
		case "android-studio":
			return existsAppPath("/Applications/Android Studio.app");
		case "trae":
			return tryFirst(["/Applications/Trae.app", "/Applications/Trae CN.app"]);
		default:
			return null;
	}
}

function existsAppPath(p: string): string | null {
	return existsSync(p) ? p : null;
}

/**
 * Resolve the actual `.icns` path inside a macOS `.app` bundle by reading
 * `CFBundleIconFile` from `Contents/Info.plist`. Falls back to common names
 * like `AppIcon.icns` / `app.icns` when the plist value is missing or
 * unreadable. Adds `.icns` extension when the plist value omits it.
 */
function resolveMacIcnsPath(appBundlePath: string): string | null {
	const resources = join(appBundlePath, "Contents", "Resources");
	const plistPath = join(appBundlePath, "Contents", "Info.plist");
	const tryFile = (name: string): string | null => {
		const withExt = name.endsWith(".icns") ? name : `${name}.icns`;
		const full = join(resources, withExt);
		return existsSync(full) ? full : null;
	};

	if (existsSync(plistPath)) {
		try {
			const raw = readFileSync(plistPath, "utf-8");
			const m = raw.match(
				/<key>CFBundleIconFile<\/key>\s*<string>([^<]+)<\/string>/,
			);
			if (m) {
				const found = tryFile(m[1].trim());
				if (found) return found;
			}
		} catch {
			// Plist may be binary; ignore parse failures and fall through to defaults.
		}
	}

	// Common fallback filenames.
	for (const candidate of [
		"AppIcon",
		"app",
		"icon",
		"Icon",
		"electron",
		appBundlePath
			.split("/")
			.pop()
			?.replace(/\.app$/, "") ?? "",
	]) {
		if (!candidate) continue;
		const found = tryFile(candidate);
		if (found) return found;
	}
	// Last resort: scan Resources/ for any .icns and pick the largest one
	// (heuristic: usually the main app icon is the biggest .icns file).
	try {
		const files = readdirSync(resources)
			.filter((f) => f.toLowerCase().endsWith(".icns"))
			.map((f) => {
				const full = join(resources, f);
				try {
					return { full, size: statSync(full).size };
				} catch {
					return { full, size: 0 };
				}
			})
			.sort((a, b) => b.size - a.size);
		if (files.length > 0) return files[0].full;
	} catch {
		// ignore
	}
	return null;
}

/**
 * Convert an .icns file to a 64x64 PNG data URL using macOS' `sips` tool.
 * Result is cached on disk under tmpdir() keyed by content hash so repeated
 * conversions skip the spawn round-trip. Returns null on failure.
 */
const ICON_TMP_DIR = (() => {
	const dir = join(tmpdir(), "super-client-r-icons");
	try {
		if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
	} catch {
		// best-effort; sips will surface a real error later
	}
	return dir;
})();

function convertIcnsToDataUrl(icnsPath: string): string | null {
	const stat = statSync(icnsPath);
	const key = createHash("sha1")
		.update(`${icnsPath}:${stat.size}:${stat.mtimeMs}`)
		.digest("hex")
		.slice(0, 16);
	const pngPath = join(ICON_TMP_DIR, `${key}.png`);
	if (!existsSync(pngPath)) {
		try {
			execFileSync(
				"/usr/bin/sips",
				["-s", "format", "png", "-Z", "64", icnsPath, "--out", pngPath],
				{ stdio: "ignore", timeout: 3000 },
			);
		} catch {
			return null;
		}
	}
	if (!existsSync(pngPath)) return null;
	try {
		const image = nativeImage.createFromPath(pngPath);
		if (!image || image.isEmpty()) return null;
		return image.toDataURL();
	} catch {
		return null;
	}
}

export class FileActionService {
	private cliCache = new Map<string, CliCacheEntry>();
	private iconCache = new Map<string, string>();

	async open(filePath: string, workspaceId = ""): Promise<FileActionResult> {
		const ctx = this.buildCtx(
			filePath,
			workspaceId,
			"external-app",
			"file.open",
		);
		const denial = this.guard(ctx);
		if (denial) {
			return denial;
		}
		if (!filePath || !existsSync(filePath)) {
			getRuntimePolicyService().record(ctx, "denied", "file-not-found");
			return { ok: false, error: "File not found" };
		}
		try {
			const error = await shell.openPath(filePath);
			if (error) {
				getRuntimePolicyService().record(ctx, "denied", "action-failed");
				return { ok: false, error };
			}
			getRuntimePolicyService().record(ctx, "audit-only");
			return { ok: true };
		} catch (err) {
			getRuntimePolicyService().record(ctx, "denied", "action-failed");
			return { ok: false, error: errorMessage(err) };
		}
	}

	async reveal(filePath: string, workspaceId = ""): Promise<FileActionResult> {
		const ctx = this.buildCtx(
			filePath,
			workspaceId,
			"file-read",
			"file.reveal",
		);
		if (!filePath || !existsSync(filePath)) {
			getRuntimePolicyService().record(ctx, "denied", "file-not-found");
			return { ok: false, error: "File not found" };
		}
		try {
			shell.showItemInFolder(filePath);
			getRuntimePolicyService().record(ctx, "audit-only");
			return { ok: true };
		} catch (err) {
			getRuntimePolicyService().record(ctx, "denied", "action-failed");
			return { ok: false, error: errorMessage(err) };
		}
	}

	async copyPath(
		filePath: string,
		workspaceId = "",
	): Promise<FileActionResult> {
		const ctx = this.buildCtx(
			filePath,
			workspaceId,
			"file-read",
			"file.copyPath",
		);
		if (!filePath || !existsSync(filePath)) {
			getRuntimePolicyService().record(ctx, "denied", "file-not-found");
			return { ok: false, error: "File not found" };
		}
		try {
			clipboard.writeText(filePath);
			getRuntimePolicyService().record(ctx, "audit-only");
			return { ok: true };
		} catch (err) {
			getRuntimePolicyService().record(ctx, "denied", "action-failed");
			return { ok: false, error: errorMessage(err) };
		}
	}

	async detectOpenTargets(
		filePath: string,
		workspaceId = "",
	): Promise<FileOpenTarget[]> {
		logger.info(
			`[FileActionService] detectOpenTargets called: path=${filePath} workspaceId=${workspaceId}`,
		);
		const ctx = this.buildCtx(
			filePath,
			workspaceId,
			"file-read",
			"file.detectOpenTargets",
		);
		if (!filePath || !existsSync(filePath)) {
			logger.warn(
				`[FileActionService] detectOpenTargets: path missing or not found: ${filePath}`,
			);
			getRuntimePolicyService().record(ctx, "denied", "file-not-found");
			return [];
		}
		getRuntimePolicyService().record(ctx, "audit-only");

		const targets: FileOpenTarget[] = [];
		const platform = process.platform;
		const isDir = safeIsDirectory(filePath);
		const ext = lowerExt(filePath);
		const terminalRelevant =
			isDir || (ext ? TERMINAL_RELEVANT_EXTENSIONS.has(ext) : false);

		// Finder/Explorer/Files — always available.
		targets.push({
			id: "finder",
			label:
				platform === "darwin"
					? "Finder"
					: platform === "win32"
						? "Explorer"
						: "Files",
			kind: "finder",
			available: true,
			appPath:
				platform === "darwin"
					? (resolveMacAppPath("finder") ?? undefined)
					: undefined,
		});

		// Native terminal (path-relevant only).
		if (terminalRelevant) {
			if (platform === "darwin") {
				const terminalPath = resolveMacAppPath("terminal");
				// Only add Terminal.app if found at one of the known locations.
				if (terminalPath) {
					targets.push({
						id: "terminal",
						label: "Terminal",
						kind: "terminal",
						available: true,
						appPath: terminalPath,
					});
				}
			} else if (platform === "win32") {
				targets.push({
					id: "cmd",
					label: "cmd",
					kind: "terminal",
					available: true,
				});
			} else {
				targets.push({
					id: "gnome-terminal",
					label: "gnome-terminal",
					kind: "terminal",
					available: true,
				});
			}
		}

		// Editors: detect by .app on macOS (CLI is nice-to-have for fast launch),
		// or by CLI presence on other platforms.
		const vscodePath =
			platform === "darwin" ? resolveMacAppPath("vscode") : null;
		if (vscodePath || this.isCliAvailable("code")) {
			targets.push({
				id: "vscode",
				label: "VS Code",
				kind: "editor",
				available: true,
				appPath: vscodePath ?? undefined,
			});
		}
		const sublimePath =
			platform === "darwin" ? resolveMacAppPath("sublime") : null;
		if (sublimePath || this.isCliAvailable("subl")) {
			targets.push({
				id: "sublime",
				label: "Sublime Text",
				kind: "editor",
				available: true,
				appPath: sublimePath ?? undefined,
			});
		}
		const traePath = platform === "darwin" ? resolveMacAppPath("trae") : null;
		if (traePath || this.isCliAvailable("trae")) {
			targets.push({
				id: "trae",
				label: "Trae",
				kind: "editor",
				available: true,
				appPath: traePath ?? undefined,
			});
		}

		// macOS-only terminal apps (path-relevant only).
		if (platform === "darwin" && terminalRelevant) {
			const itermPath = resolveMacAppPath("iterm");
			if (itermPath) {
				targets.push({
					id: "iterm",
					label: "iTerm",
					kind: "terminal",
					available: true,
					appPath: itermPath,
				});
			}
			const warpPath = resolveMacAppPath("warp");
			if (warpPath) {
				targets.push({
					id: "warp",
					label: "Warp",
					kind: "terminal",
					available: true,
					appPath: warpPath,
				});
			}
		}

		// macOS-only editor apps (independent of terminalRelevant).
		if (platform === "darwin") {
			const xcodePath = resolveMacAppPath("xcode");
			if (xcodePath) {
				targets.push({
					id: "xcode",
					label: "Xcode",
					kind: "editor",
					available: true,
					appPath: xcodePath,
				});
			}
			const androidPath = resolveMacAppPath("android-studio");
			if (androidPath) {
				targets.push({
					id: "android-studio",
					label: "Android Studio",
					kind: "editor",
					available: true,
					appPath: androidPath,
				});
			}
		}

		const result = targets.filter((t) => t.available);
		logger.info(
			`[FileActionService] detectOpenTargets returning ${result.length} targets: ${result
				.map((t) => `${t.id}${t.appPath ? "@" + t.appPath : ""}`)
				.join(", ")}`,
		);
		return result;
	}

	/**
	 * Get a data URL PNG icon for a target app.
	 * - Caches by appPath in-memory (no TTL).
	 * - Returns null on error or when appPath is missing.
	 */
	async getAppIcon(
		target: FileOpenTarget | { id: string; appPath?: string },
	): Promise<string | null> {
		const appPath = target.appPath;
		if (!appPath) return null;
		const cached = this.iconCache.get(appPath);
		if (cached) return cached;

		// macOS: read the .app bundle's actual icon from Contents/Resources/<AppIcon>.icns,
		// then convert to PNG via the system `sips` tool. Electron's nativeImage
		// does NOT decode .icns directly (returns empty image), and we cannot fall
		// back to `app.getFileIcon` because Electron 38 on macOS 26 dispatches that
		// to a worker thread which deadlocks NSWorkspace/IconServices and crashes
		// the process with SIGTRAP.
		if (process.platform === "darwin" && appPath.endsWith(".app")) {
			const icnsPath = resolveMacIcnsPath(appPath);
			if (!icnsPath) {
				logger.warn(
					`[FileActionService] getAppIcon: no .icns found in ${appPath}`,
				);
				return null;
			}
			try {
				const dataUrl = convertIcnsToDataUrl(icnsPath);
				if (!dataUrl) return null;
				this.iconCache.set(appPath, dataUrl);
				logger.info(
					`[FileActionService] getAppIcon: ${icnsPath} dataLen=${dataUrl.length}`,
				);
				return dataUrl;
			} catch (err) {
				logger.warn(
					`[FileActionService] getAppIcon: convert failed for ${icnsPath}: ${err instanceof Error ? err.message : String(err)}`,
				);
				return null;
			}
		}

		// Non-macOS: skip — renderer falls back to letter badge.
		return null;
	}

	/**
	 * Open `path` with a specific target app.
	 *
	 * macOS:
	 *  - Prefers CLI binaries (`code`, `subl`) for editors when available.
	 *  - Falls back to `open -a "<bundle name>" <path>` otherwise.
	 *
	 * Windows / Linux: defers to `shell.openPath` (system default).
	 */
	async openWith(
		filePath: string,
		targetId: string,
		workspaceId = "",
	): Promise<FileActionResult> {
		const ctx = this.buildCtx(
			filePath,
			workspaceId,
			"external-app",
			`fileAction:openWith:${targetId}`,
		);
		const denial = this.guard(ctx);
		if (denial) {
			return denial;
		}
		if (!filePath || !existsSync(filePath)) {
			getRuntimePolicyService().record(ctx, "denied", "file-not-found");
			return { ok: false, error: "File not found" };
		}

		const platform = process.platform;

		// Non-macOS: just delegate to system default for now.
		if (platform !== "darwin") {
			try {
				const error = await shell.openPath(filePath);
				if (error) {
					getRuntimePolicyService().record(ctx, "denied", "action-failed");
					return { ok: false, error };
				}
				getRuntimePolicyService().record(ctx, "audit-only");
				return { ok: true };
			} catch (err) {
				getRuntimePolicyService().record(ctx, "denied", "action-failed");
				return { ok: false, error: errorMessage(err) };
			}
		}

		// macOS — find the matching target via detection so we have appPath.
		const targets = await this.detectOpenTargets(filePath, workspaceId);
		const target = targets.find((t) => t.id === targetId);
		if (!target) {
			getRuntimePolicyService().record(ctx, "denied", "target-unavailable");
			return { ok: false, error: `Target '${targetId}' is not available` };
		}

		try {
			// Editor CLI fast paths — best UX (reuses running window).
			if (targetId === "vscode" && this.isCliAvailable("code")) {
				this.spawnDetached("code", [filePath]);
				getRuntimePolicyService().record(ctx, "audit-only");
				return { ok: true };
			}
			if (targetId === "sublime" && this.isCliAvailable("subl")) {
				this.spawnDetached("subl", [filePath]);
				getRuntimePolicyService().record(ctx, "audit-only");
				return { ok: true };
			}
			if (targetId === "trae" && this.isCliAvailable("trae")) {
				this.spawnDetached("trae", [filePath]);
				getRuntimePolicyService().record(ctx, "audit-only");
				return { ok: true };
			}

			// Generic macOS fallback: `open -a "Bundle Name" <path>`.
			const bundleName = MACOS_BUNDLE_NAMES[targetId];
			if (!bundleName) {
				getRuntimePolicyService().record(ctx, "denied", "target-unsupported");
				return { ok: false, error: `Unsupported target '${targetId}'` };
			}
			this.spawnDetached("open", ["-a", bundleName, filePath]);
			getRuntimePolicyService().record(ctx, "audit-only");
			return { ok: true };
		} catch (err) {
			getRuntimePolicyService().record(ctx, "denied", "action-failed");
			return { ok: false, error: errorMessage(err) };
		}
	}

	private spawnDetached(cmd: string, args: string[]): void {
		const child = spawn(cmd, args, {
			detached: true,
			stdio: "ignore",
		});
		child.unref();
	}

	private buildCtx(
		filePath: string,
		workspaceId: string,
		kind: RuntimeOperationKind,
		operation: string,
	): RuntimeOperationContext {
		return {
			workspaceId,
			source: "user",
			operation,
			kind,
			target: filePath,
		};
	}

	/** R-6: look up workspace runtime policy for `evaluate`. */
	private resolvePolicy(projectId: string): WorkspaceRuntimePolicy | undefined {
		if (!projectId || projectId === "default") return undefined;
		try {
			return getProjectStorage().getSettings(projectId).runtimePolicy as
				| WorkspaceRuntimePolicy
				| undefined;
		} catch (err) {
			logger.warn(
				`[FileActionService] resolvePolicy(${projectId}) failed:`,
				err,
			);
			return undefined;
		}
	}

	/**
	 * R-6: evaluate a context against workspace policy. If denied, write an
	 * audit entry and return the deny reason; otherwise return null and the
	 * caller proceeds. Allows the call sites to stay readable.
	 */
	private guard(ctx: RuntimeOperationContext): FileActionResult | null {
		const policy = this.resolvePolicy(ctx.workspaceId);
		const evaluation = getRuntimePolicyService().evaluate(ctx, policy);
		if (
			evaluation.decision === "deny" ||
			evaluation.decision === "needs-approval"
		) {
			getRuntimePolicyService().record(ctx, "denied", evaluation.reason);
			return {
				ok: false,
				code: evaluation.code ?? "runtime.policyDenied",
				messageKey: evaluation.code ?? "runtime.policyDenied",
				error: evaluation.reason || "policy-denied",
				details: { operation: ctx.operation, target: ctx.target },
			};
		}
		return null;
	}

	private isCliAvailable(cli: string): boolean {
		const key = `${process.platform}:${cli}`;
		const now = Date.now();
		const cached = this.cliCache.get(key);
		if (cached && cached.expires > now) {
			return cached.available;
		}
		const cmd = process.platform === "win32" ? `where ${cli}` : `which ${cli}`;
		let available = false;
		try {
			execSync(cmd, { stdio: "ignore" });
			available = true;
		} catch {
			available = false;
		}
		this.cliCache.set(key, { available, expires: now + CLI_CACHE_TTL_MS });
		return available;
	}
}

function safeIsDirectory(p: string): boolean {
	try {
		return statSync(p).isDirectory();
	} catch {
		return false;
	}
}

function lowerExt(p: string): string {
	const idx = p.lastIndexOf(".");
	if (idx < 0 || idx === p.length - 1) return "";
	const slash = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
	if (idx < slash) return "";
	return p.slice(idx).toLowerCase();
}

function errorMessage(err: unknown): string {
	if (err instanceof Error) return err.message;
	return String(err);
}

let singleton: FileActionService | null = null;

export function getFileActionService(): FileActionService {
	if (!singleton) singleton = new FileActionService();
	return singleton;
}
