#!/usr/bin/env bun

/**
 * Relay Server 多平台构建脚本
 *
 * 用法:
 *   bun relay-server/build.ts           # 编译所有平台
 *   bun relay-server/build.ts current   # 仅编译当前平台
 */

import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { $ } from "bun";

const entrypoint = path.join(import.meta.dir, "index.ts");
const distDir = path.join(import.meta.dir, "dist");

const targets = [
  { name: "relay-server-linux-x64", target: "bun-linux-x64" },
  { name: "relay-server-linux-arm64", target: "bun-linux-arm64" },
  { name: "relay-server-macos-x64", target: "bun-darwin-x64" },
  { name: "relay-server-macos-arm64", target: "bun-darwin-arm64" },
  { name: "relay-server-windows-x64.exe", target: "bun-windows-x64" },
];

if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true });
}

const currentOnly = process.argv[2] === "current";

if (currentOnly) {
  const outfile = path.join(distDir, "relay-server");
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
  console.log("\n全部完成! 产物在 relay-server/dist/ 目录");
}
