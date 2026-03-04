#!/usr/bin/env bun
/**
 * 多平台构建脚本
 *
 * 用法:
 *   bun device-agent/build.ts           # 编译所有平台
 *   bun device-agent/build.ts current   # 仅编译当前平台
 */

import { $ } from "bun";
import { mkdirSync, existsSync } from "node:fs";
import path from "node:path";

const entrypoint = path.join(import.meta.dir, "index.ts");
const distDir = path.join(import.meta.dir, "dist");

const targets = [
	{ name: "device-agent-linux-x64", target: "bun-linux-x64" },
	{ name: "device-agent-linux-arm64", target: "bun-linux-arm64" },
	{ name: "device-agent-macos-x64", target: "bun-darwin-x64" },
	{ name: "device-agent-macos-arm64", target: "bun-darwin-arm64" },
	{ name: "device-agent-windows-x64.exe", target: "bun-windows-x64" },
];

if (!existsSync(distDir)) {
	mkdirSync(distDir, { recursive: true });
}

const currentOnly = process.argv[2] === "current";

if (currentOnly) {
	const outfile = path.join(distDir, "device-agent");
	console.log(`编译当前平台 -> ${outfile}`);
	await $`bun build ${entrypoint} --compile --outfile ${outfile}`;
	console.log("完成!");
} else {
	for (const { name, target } of targets) {
		const outfile = path.join(distDir, name);
		console.log(`编译 ${target} -> ${outfile}`);
		try {
			await $`bun build ${entrypoint} --compile --target=${target} --outfile ${outfile}`;
			console.log(`  -> 成功`);
		} catch (e) {
			console.error(`  -> 失败: ${(e as Error).message}`);
		}
	}
	console.log("\n全部完成! 产物在 device-agent/dist/ 目录");
}
