/**
 * Path safety utilities — hard blocklist of OS system directories.
 *
 * This is a *bottom-line* defence (defence-in-depth layer L3 in the design
 * notes): even if higher layers (tool approval / cwd fencing) fail, file
 * operations should never touch `/etc`, `/System`, `/usr/bin`, the Windows
 * `Program Files` tree, etc.
 *
 * Originally lived in `src/main/services/mcp/internal/servers/shared.ts`.
 * Promoted here so both the @scp/file-system MCP server AND the runtime
 * builtin tools (Read / Write / Edit) can share a single source of truth.
 */

import * as path from "node:path";

export const BLOCKED_PATHS = [
	"/etc",
	"/System",
	"/Library",
	"/private",
	"/bin",
	"/sbin",
	"/usr/bin",
	"/usr/sbin",
	"C:\\Windows",
	"C:\\Program Files",
	"C:\\Program Files (x86)",
];

/**
 * Returns true if `targetPath` (after `path.resolve`) is — or sits inside —
 * any of `BLOCKED_PATHS`. Callers should reject the operation when true.
 */
export function isBlockedPath(targetPath: string): boolean {
	const resolved = path.resolve(targetPath);
	return BLOCKED_PATHS.some(
		(blocked) =>
			resolved === blocked || resolved.startsWith(blocked + path.sep),
	);
}
