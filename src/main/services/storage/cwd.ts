/**
 * Project / Session 重设计 A-2 — cwd 归一化与稳定哈希。
 *
 * `Project.id` 用 cwd 的稳定 hash，避免在文件系统暴露用户私密路径，同时
 * 让用户 rename / 移动项目时 id 保持稳定（cwd 字面量改了 → projects.json
 * 的 path 字段更新；但 hash 不变 → 目录不需要搬）。
 *
 * 归一化规则（`normalizeCwd`）：
 *  1. `path.resolve` 解析 `..` / `.` / 相对路径；返回绝对路径
 *  2. 去除尾部 `/`（除非是根目录 `/`）
 *  3. Windows 平台 `toLowerCase()`（NTFS 大小写不敏感）；Unix 保留大小写
 *
 * NOT in scope：
 *  - macOS NFC normalize（中文路径）—— 留到将来真有用户 hash 不一致再做
 *  - symlink resolve —— 用户的"项目目录"可能就是 symlink，不应展开
 *
 * Hash：`sha256(normalized)` 取前 16 字符 hex（64 bits，碰撞概率在万级
 * 项目内可忽略）。
 */

import { createHash } from "node:crypto";
import { resolve } from "node:path";

/**
 * 归一化一个 cwd 字符串为可哈希的"标准形态"。
 * 同一逻辑路径无论用户怎么写，归一化后一致。
 */
export function normalizeCwd(cwd: string): string {
	// path.resolve 解析 `..` / `.`、相对路径转绝对、去重复斜杠
	let normalized = resolve(cwd);

	// 去尾部斜杠（保留单 `/` 根 / Windows 单字母盘根 `C:\`）
	if (normalized.length > 1 && normalized.endsWith("/")) {
		normalized = normalized.slice(0, -1);
	}
	if (normalized.length > 3 && normalized.endsWith("\\")) {
		normalized = normalized.slice(0, -1);
	}

	// Windows NTFS 大小写不敏感
	if (process.platform === "win32") {
		normalized = normalized.toLowerCase();
	}

	return normalized;
}

/**
 * 输入任意 cwd 字符串，输出稳定的 16 字符 hex projectId。
 * 同 cwd 同 id；不同 cwd（归一化后）不同 id。
 */
export function hashCwd(cwd: string): string {
	const normalized = normalizeCwd(cwd);
	return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}
