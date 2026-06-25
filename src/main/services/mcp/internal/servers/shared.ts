/**
 * Shared utilities for internal MCP servers.
 *
 * `BLOCKED_PATHS` / `isBlockedPath` were promoted to `src/main/utils/pathSafety.ts`
 * so the runtime builtin tools (Read/Write/Edit) can reuse the same blocklist.
 * Re-exported here to keep existing import sites working.
 */

export { BLOCKED_PATHS, isBlockedPath } from "../../../../utils/pathSafety";

export function textResult(text: string, isError = false) {
	return { content: [{ type: "text" as const, text }], isError };
}
