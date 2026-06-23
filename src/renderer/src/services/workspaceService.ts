/**
 * Workspace file enumeration client.
 *
 * Backs the composer's "@" file-mention panel. Wraps the
 * `workspace:list-files` IPC and keeps a small per-session in-memory cache so
 * we don't re-walk the project tree on every keystroke. The cache TTL is
 * intentionally short (30 s) — long enough to be useful while typing, short
 * enough that newly-added files appear without an explicit refresh.
 */

export interface WorkspaceFileEntry {
	absolutePath: string;
	relativePath: string;
	root: "project" | "session";
	name: string;
	dir: string;
	ext: string;
	size: number;
	mtimeMs: number;
}

export interface WorkspaceFileListing {
	files: WorkspaceFileEntry[];
	roots: { projectRoot?: string; sessionCwd?: string };
	fetchedAt: number;
}

const TTL_MS = 30_000;
const cache = new Map<string, WorkspaceFileListing>();

export async function listWorkspaceFiles(
	sessionId: string,
	options?: { limit?: number; force?: boolean },
): Promise<WorkspaceFileListing> {
	if (!sessionId) {
		return { files: [], roots: {}, fetchedAt: Date.now() };
	}

	const cached = cache.get(sessionId);
	if (
		!options?.force &&
		cached &&
		Date.now() - cached.fetchedAt < TTL_MS
	) {
		return cached;
	}

	try {
		const res = await window.electron.workspace.listFiles({
			sessionId,
			limit: options?.limit,
		});
		if (!res.success || !res.data) {
			return { files: [], roots: {}, fetchedAt: Date.now() };
		}
		const listing: WorkspaceFileListing = {
			files: res.data.files,
			roots: res.data.roots,
			fetchedAt: Date.now(),
		};
		cache.set(sessionId, listing);
		return listing;
	} catch {
		// IPC failure shouldn't break the composer — return empty.
		return { files: [], roots: {}, fetchedAt: Date.now() };
	}
}

/** Drop the cached listing so the next call re-fetches. */
export function invalidateWorkspaceFiles(sessionId?: string): void {
	if (sessionId) {
		cache.delete(sessionId);
	} else {
		cache.clear();
	}
}
