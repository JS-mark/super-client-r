#!/usr/bin/env tsx

/**
 * 自定义构建发行脚本
 *
 * Usage:
 *   pnpm release mac                           # 构建 macOS (x64 + arm64)
 *   pnpm release win                           # 构建 Windows (x64 + arm64)
 *   pnpm release all                           # 构建所有平台
 *   pnpm release mac --arch x64               # 仅构建 macOS x64
 *   pnpm release mac --mode production         # 指定 Vite 构建模式
 *   pnpm release all --publish                 # 构建并上传到 GitHub Release
 *   pnpm release mac --publish --tag v1.0.0    # 指定 release tag
 */

import chalk from "chalk";
import { execSync } from "child_process";
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from "fs";
import { basename, extname, join } from "path";

const ROOT = process.cwd();
const DIST_DIR = join(ROOT, "dist");

const ARTIFACT_EXTENSIONS = new Set([
	".dmg",
	".zip",
	".exe",
	".AppImage",
	".deb",
	".rpm",
]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Platform = "mac" | "win";
type Arch = "x64" | "arm64";

interface BuildOptions {
	platforms: Platform[];
	arch: Arch[];
	mode?: string;
	publish: boolean;
	tag?: string;
}

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

function printUsage(): void {
	console.log(`
${chalk.bold("Usage:")} pnpm release ${chalk.cyan("<platform>")} [options]

${chalk.bold("Platforms:")}
  ${chalk.cyan("mac")}        构建 macOS (dmg + zip)
  ${chalk.cyan("win")}        构建 Windows (nsis exe)
  ${chalk.cyan("all")}        构建所有平台

${chalk.bold("Options:")}
  --arch <arch>      目标架构: x64, arm64 (默认两者都构建)
  --mode <mode>      Vite 构建模式 (electron-vite --mode <mode>)
  --publish          构建完成后上传到 GitHub Release
  --tag  <tag>       Release tag (默认: v{version})
  -h, --help         显示帮助
`);
}

function parseArgs(): BuildOptions {
	const args = process.argv.slice(2);

	if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
		printUsage();
		process.exit(0);
	}

	// Parse platform (first positional arg)
	const platformArg = args[0];
	let platforms: Platform[];

	switch (platformArg) {
		case "mac":
			platforms = ["mac"];
			break;
		case "win":
			platforms = ["win"];
			break;
		case "all":
			platforms = ["mac", "win"];
			break;
		default:
			console.error(chalk.red(`Unknown platform: ${platformArg}`));
			printUsage();
			process.exit(1);
	}

	// Parse flags
	let arch: Arch[] = [];
	let mode: string | undefined;
	let publish = false;
	let tag: string | undefined;

	for (let i = 1; i < args.length; i++) {
		switch (args[i]) {
			case "--arch": {
				const a = args[++i];
				if (!a || a.startsWith("--")) {
					console.error(chalk.red("--arch requires a value: x64 or arm64"));
					process.exit(1);
				}
				if (a !== "x64" && a !== "arm64") {
					console.error(chalk.red(`Invalid arch: ${a}. Use x64 or arm64.`));
					process.exit(1);
				}
				arch.push(a);
				break;
			}
			case "--mode": {
				const m = args[++i];
				if (!m || m.startsWith("--")) {
					console.error(chalk.red("--mode requires a value"));
					process.exit(1);
				}
				mode = m;
				break;
			}
			case "--publish":
				publish = true;
				break;
			case "--tag": {
				const t = args[++i];
				if (!t || t.startsWith("--")) {
					console.error(chalk.red("--tag requires a value"));
					process.exit(1);
				}
				tag = t;
				break;
			}
			default:
				console.error(chalk.red(`Unknown option: ${args[i]}`));
				printUsage();
				process.exit(1);
		}
	}

	// Default: both architectures
	if (arch.length === 0) {
		arch = ["x64", "arm64"];
	}

	return { platforms, arch, mode, publish, tag };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function run(cmd: string, label?: string): void {
	if (label) {
		console.log(chalk.cyan(`\n=> ${label}`));
	}
	console.log(chalk.dim(`   $ ${cmd}\n`));
	execSync(cmd, { stdio: "inherit", cwd: ROOT });
}

function getVersion(): string {
	const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8"));
	return pkg.version;
}

function collectArtifacts(): string[] {
	if (!existsSync(DIST_DIR)) return [];

	return readdirSync(DIST_DIR)
		.filter((f) => {
			if (!ARTIFACT_EXTENSIONS.has(extname(f))) return false;
			return statSync(join(DIST_DIR, f)).isFile();
		})
		.map((f) => join(DIST_DIR, f));
}

function formatSize(bytes: number): string {
	if (bytes >= 1024 * 1024 * 1024) {
		return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
	}
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function ensureGhCli(): void {
	try {
		execSync("gh --version", { stdio: "ignore" });
	} catch {
		console.error(chalk.red("Error: GitHub CLI (gh) is not installed."));
		console.error("Install: https://cli.github.com/");
		process.exit(1);
	}

	// Check auth
	try {
		execSync("gh auth status", { stdio: "ignore" });
	} catch {
		console.error(chalk.red("Error: GitHub CLI not authenticated."));
		console.error("Run: gh auth login");
		process.exit(1);
	}
}

// ---------------------------------------------------------------------------
// Build steps
// ---------------------------------------------------------------------------

function buildIcons(): void {
	const svgPath = join(ROOT, "build", "icons", "icon.svg");
	const icnsPath = join(ROOT, "build", "icons", "icon.icns");
	const icoPath = join(ROOT, "build", "icons", "icon.ico");

	if (existsSync(icnsPath) && existsSync(icoPath) && existsSync(svgPath)) {
		const svgMtime = statSync(svgPath).mtimeMs;
		const icnsMtime = statSync(icnsPath).mtimeMs;
		const icoMtime = statSync(icoPath).mtimeMs;

		if (icnsMtime > svgMtime && icoMtime > svgMtime) {
			console.log(chalk.cyan("\n=> Building icons"));
			console.log(chalk.dim("   Skipped (icons up-to-date)\n"));
			return;
		}
	}

	run("pnpm build:icons", "Building icons");
}

function compileTypeScript(): void {
	run("tsc -b", "TypeScript compilation");
}

function viteBuild(mode?: string): void {
	const cmd = mode
		? `electron-vite build --mode ${mode}`
		: "electron-vite build";
	run(cmd, `Vite build${mode ? ` (mode: ${mode})` : ""}`);
}

function packageApp(platform: Platform, arch: Arch[]): void {
	const archFlags = arch.map((a) => `--${a}`).join(" ");
	const platformName = platform === "mac" ? "macOS" : "Windows";
	const archLabel = arch.join(" + ");

	run(
		`electron-builder --${platform} ${archFlags} --publish never`,
		`Packaging ${platformName} (${archLabel})`,
	);
}

function publishToGitHub(tag: string, artifacts: string[]): void {
	ensureGhCli();

	if (artifacts.length === 0) {
		console.error(chalk.red("No artifacts found to publish."));
		process.exit(1);
	}

	const fileArgs = artifacts.map((f) => `"${f}"`).join(" ");
	const prerelease = tag.includes("-") ? "--prerelease" : "";

	// Check if release already exists
	let releaseExists = false;
	try {
		execSync(`gh release view ${tag}`, { stdio: "ignore", cwd: ROOT });
		releaseExists = true;
	} catch {
		// Release doesn't exist yet
	}

	if (releaseExists) {
		console.log(chalk.dim(`   Release ${tag} exists, uploading artifacts...`));
		run(
			`gh release upload ${tag} ${fileArgs} --clobber`,
			`Uploading to existing release ${tag}`,
		);
	} else {
		run(
			`gh release create ${tag} ${fileArgs} --generate-notes ${prerelease}`.trim(),
			`Creating release ${tag}`,
		);
	}
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
	const options = parseArgs();
	const startTime = Date.now();

	// Print build configuration
	console.log(chalk.bold.blue("\n  Super Client - Release Build\n"));
	console.log(`  Platform:  ${chalk.white(options.platforms.join(", "))}`);
	console.log(`  Arch:      ${chalk.white(options.arch.join(", "))}`);
	if (options.mode) {
		console.log(`  Mode:      ${chalk.white(options.mode)}`);
	}
	if (options.publish) {
		const tag = options.tag || `v${getVersion()}`;
		console.log(`  Publish:   ${chalk.white(tag)}`);
	}

	// Step 0: Clean dist/
	if (existsSync(DIST_DIR)) {
		console.log(chalk.cyan("\n=> Cleaning dist/"));
		rmSync(DIST_DIR, { recursive: true, force: true });
	}

	// Step 1: Build icons
	buildIcons();

	// Step 2: TypeScript
	compileTypeScript();

	// Step 3: Vite build (with mode)
	viteBuild(options.mode);

	// Step 4: Package each platform
	for (const platform of options.platforms) {
		packageApp(platform, options.arch);
	}

	// Step 5: List artifacts
	const artifacts = collectArtifacts();
	if (artifacts.length > 0) {
		console.log(chalk.cyan("\n=> Build artifacts:"));
		for (const artifact of artifacts) {
			const stat = statSync(artifact);
			console.log(
				`   ${chalk.green("+")} ${basename(artifact)}  ${chalk.dim(formatSize(stat.size))}`,
			);
		}
	} else {
		console.log(chalk.yellow("\n  No artifacts found in dist/"));
	}

	// Step 6: Publish
	if (options.publish) {
		const tag = options.tag || `v${getVersion()}`;
		publishToGitHub(tag, artifacts);

		console.log(
			chalk.green(
				`\n  Published: https://github.com/JS-mark/super-client-r/releases/tag/${tag}`,
			),
		);
	}

	const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
	console.log(chalk.bold.green(`\n  Done in ${elapsed}s\n`));
}

main().catch((err) => {
	console.error(chalk.red("\n  Build failed:"), err.message);
	process.exit(1);
});
