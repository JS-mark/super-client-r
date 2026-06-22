/**
 * Resolve the working directory used when opening a new terminal tab.
 *
 * Strategy (per plan §6):
 *   1. If the renderer has a current chat conversation, ask main process for its
 *      resolved cwd (git-root aware via `cwd.resolveSessionCwd`).
 *   2. Otherwise fall back to the user's home directory.
 *
 * Main process applies a final safety net (existsSync + isDirectory) and falls
 * back to $HOME on failure, so this service can return any string.
 */

export async function resolveTerminalCwd(
	currentConversationId?: string,
): Promise<string> {
	if (currentConversationId) {
		try {
			const r = await window.electron.cwd.resolveSessionCwd(
				currentConversationId,
			);
			if (r.success && r.data) return r.data;
		} catch {
			/* fallthrough to home */
		}
	}
	try {
		const home = await window.electron.system.getHomedir();
		if (home.success && home.data) return home.data;
	} catch {
		/* ignore */
	}
	return "";
}
