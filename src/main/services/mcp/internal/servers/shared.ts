/**
 * Shared utilities for internal MCP servers
 */

import * as path from "path";

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

export function isBlockedPath(targetPath: string): boolean {
	const resolved = path.resolve(targetPath);
	return BLOCKED_PATHS.some(
		(blocked) =>
			resolved === blocked || resolved.startsWith(blocked + path.sep),
	);
}

export function textResult(text: string, isError = false) {
	return { content: [{ type: "text" as const, text }], isError };
}
