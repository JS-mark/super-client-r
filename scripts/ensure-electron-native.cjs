#!/usr/bin/env node

const { chmodSync, existsSync, readdirSync, statSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const NATIVE_MODULES = ["better-sqlite3", "node-pty"];

function fail(message) {
	console.error(`[ensure-electron-native] ${message}`);
	process.exit(1);
}

function resolveElectronBinary() {
	try {
		const electronPath = require("electron");
		if (typeof electronPath === "string" && existsSync(electronPath)) {
			return electronPath;
		}
	} catch {
		// handled below
	}
	fail("Electron binary is missing. Run `node scripts/ensure-electron.cjs` first.");
}

function resolveElectronVersion() {
	try {
		return require("electron/package.json").version;
	} catch {
		fail("Unable to read electron/package.json.");
	}
}

function verifyNativeModules(electronBinary) {
	const script = NATIVE_MODULES.map((name) => `require(${JSON.stringify(name)})`)
		.concat('console.log("native ok")')
		.join(";");
	const result = spawnSync(electronBinary, ["-e", script], {
		env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
		encoding: "utf-8",
	});
	return result.status === 0;
}

function findElectronRebuildCli() {
	const pnpmDir = join(process.cwd(), "node_modules", ".pnpm");
	if (!existsSync(pnpmDir)) {
		fail("node_modules/.pnpm is missing.");
	}
	for (const entry of readdirSync(pnpmDir)) {
		if (!entry.startsWith("@electron+rebuild@")) continue;
		const cli = join(
			pnpmDir,
			entry,
			"node_modules",
			"@electron",
			"rebuild",
			"lib",
			"cli.js",
		);
		if (existsSync(cli)) return cli;
	}
	fail("@electron/rebuild is missing from node_modules.");
}

function rebuildNativeModules(electronVersion) {
	const cli = findElectronRebuildCli();
	const result = spawnSync(
		process.execPath,
		[
			cli,
			"--version",
			electronVersion,
			"--force",
			"--module-dir",
			".",
			"--which-module",
			NATIVE_MODULES.join(","),
			"--arch",
			process.arch,
		],
		{ stdio: "inherit" },
	);
	if (result.status !== 0) {
		process.exit(result.status ?? 1);
	}
}

/**
 * node-pty ships a small `spawn-helper` binary in each darwin/linux prebuild
 * directory. It must be executable, otherwise `pty.spawn` fails at runtime
 * with `posix_spawnp failed` (EACCES) — the require() check above does NOT
 * catch this because the JS layer loads fine.
 *
 * pnpm's hardlink / extraction flow occasionally drops the exec bit, so we
 * defensively re-apply it on every predev run. No-op on Windows.
 */
function ensureSpawnHelperExecutable() {
	if (process.platform === "win32") return;
	const prebuildsDir = join(
		process.cwd(),
		"node_modules",
		"node-pty",
		"prebuilds",
	);
	if (!existsSync(prebuildsDir)) return;
	for (const entry of readdirSync(prebuildsDir)) {
		const helper = join(prebuildsDir, entry, "spawn-helper");
		if (!existsSync(helper)) continue;
		try {
			const mode = statSync(helper).mode;
			// If any x-bit already set, leave it alone.
			if ((mode & 0o111) !== 0) continue;
			chmodSync(helper, 0o755);
			console.log(
				`[ensure-electron-native] chmod +x ${helper.replace(process.cwd() + "/", "")}`,
			);
		} catch (error) {
			console.warn(
				`[ensure-electron-native] failed to chmod ${helper}:`,
				error && error.message ? error.message : error,
			);
		}
	}
}

ensureSpawnHelperExecutable();

const electronBinary = resolveElectronBinary();
if (verifyNativeModules(electronBinary)) {
	process.exit(0);
}

const electronVersion = resolveElectronVersion();
console.log(
	`[ensure-electron-native] Rebuilding native modules for Electron ${electronVersion}.`,
);
rebuildNativeModules(electronVersion);

// Rebuild may drop the exec bit again — re-assert.
ensureSpawnHelperExecutable();

if (!verifyNativeModules(electronBinary)) {
	fail("Native modules still do not load under Electron after rebuild.");
}

console.log("[ensure-electron-native] Native modules are ready for Electron.");
