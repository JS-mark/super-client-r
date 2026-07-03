import type {
	IPCResponse,
	SessionContentRefReadOptions,
	SessionContentRefReadResult,
} from "../types/electron";

const DEFAULT_PREVIEW_MAX_BYTES = 64 * 1024;

export const sessionContentRefService = {
	read: (
		sessionId: string,
		contentRef: string,
		options?: SessionContentRefReadOptions,
	): Promise<IPCResponse<SessionContentRefReadResult>> =>
		window.electron.sessions.readContentRef(sessionId, contentRef, {
			maxBytes: DEFAULT_PREVIEW_MAX_BYTES,
			...options,
		}),
};
