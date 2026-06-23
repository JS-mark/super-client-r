/**
 * Resolve the working directory used when opening a new terminal tab.
 *
 * Strategy:
 *   1. If the conversation is bound to a project, open the terminal at the
 *      **project root** — users expect "在项目里打开终端" to land in the project
 *      directory, not the per-session sandbox under userData.
 *   2. Otherwise fall back to the per-session sandbox (`cwd.resolveSessionCwd`).
 *   3. Finally fall back to the user's home directory.
 *
 * Main process applies a final safety net (existsSync + isDirectory) and falls
 * back to $HOME on failure, so this service can return any string.
 */

export async function resolveTerminalCwd(
	currentConversationId?: string,
): Promise<string> {
	if (currentConversationId) {
		try {
			const r = await window.electron.cwd.resolveProjectRoot(
				currentConversationId,
			);
			if (r.success && r.data) return r.data;
		} catch {
			/* fallthrough to session sandbox */
		}
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
