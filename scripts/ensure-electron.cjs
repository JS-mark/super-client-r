#!/usr/bin/env node

const { existsSync } = require("node:fs");
const { dirname, join } = require("node:path");
const { spawnSync } = require("node:child_process");

const DEFAULT_ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/";

function resolveElectronPackageDir() {
	try {
		return dirname(require.resolve("electron/package.json"));
	} catch {
		console.error("[ensure-electron] Electron package is not installed.");
		console.error(
			"[ensure-electron] Run `pnpm install --no-frozen-lockfile` first.",
		);
		process.exit(1);
	}
}

function readElectronPath(_electronDir) {
	try {
		return require("electron");
	} catch {
		return null;
	}
}

function isUsableElectronPath(electronPath) {
	return (
		typeof electronPath === "string" &&
		electronPath.length > 0 &&
		existsSync(electronPath)
	);
}

function installElectronBinary(electronDir) {
	const installScript = join(electronDir, "install.js");
	const env = {
		...process.env,
		npm_config_electron_mirror:
			process.env.npm_config_electron_mirror ??
			process.env.ELECTRON_MIRROR ??
			DEFAULT_ELECTRON_MIRROR,
		electron_mirror:
			process.env.electron_mirror ??
			process.env.ELECTRON_MIRROR ??
			DEFAULT_ELECTRON_MIRROR,
	};
	const result = spawnSync(process.execPath, [installScript], {
		env,
		stdio: "inherit",
	});
	if (result.status !== 0) {
		process.exit(result.status ?? 1);
	}
}

const electronDir = resolveElectronPackageDir();
const currentElectronPath = readElectronPath(electronDir);

if (isUsableElectronPath(currentElectronPath)) {
	process.exit(0);
}

console.log("[ensure-electron] Electron binary is missing; installing it now.");
installElectronBinary(electronDir);

const repairedElectronPath = readElectronPath(electronDir);
if (!isUsableElectronPath(repairedElectronPath)) {
	console.error("[ensure-electron] Electron install finished, but binary is still missing.");
	process.exit(1);
}

console.log(`[ensure-electron] Electron binary ready: ${repairedElectronPath}`);
