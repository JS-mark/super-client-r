import type { IPCResponse, SessionArchiveExportResult } from "../types/electron";

export const sessionArchiveService = {
	exportArchive: (
		sessionId: string,
	): Promise<IPCResponse<SessionArchiveExportResult>> =>
		window.electron.sessions.exportArchive(sessionId),
};
