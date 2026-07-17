import type {
	IPCResponse,
	ProjectArchiveExportResult,
	SessionArchiveExportOptions,
	SessionArchiveExportResult,
} from "../types/electron";

export const sessionArchiveService = {
	exportArchive: (
		sessionId: string,
		options?: SessionArchiveExportOptions,
	): Promise<IPCResponse<SessionArchiveExportResult>> =>
		window.electron.sessions.exportArchive(sessionId, options),
	exportProjectArchive: (
		projectId: string,
		options?: SessionArchiveExportOptions,
	): Promise<IPCResponse<ProjectArchiveExportResult>> =>
		window.electron.projects.exportArchive(projectId, options),
};
