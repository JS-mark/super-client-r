import type { FileOpenTarget, IPCResponse } from "../types/electron";
import type { FileActionResult } from "@super-client/shared-types/electron-api";

export const fileActionService = {
	open: (
		path: string,
		workspaceId?: string,
	): Promise<IPCResponse<FileActionResult>> =>
		window.electron.fileAction.open(path, workspaceId),

	reveal: (
		path: string,
		workspaceId?: string,
	): Promise<IPCResponse<FileActionResult>> =>
		window.electron.fileAction.reveal(path, workspaceId),

	copyPath: (
		path: string,
		workspaceId?: string,
	): Promise<IPCResponse<FileActionResult>> =>
		window.electron.fileAction.copyPath(path, workspaceId),

	detectOpenTargets: (
		path: string,
		workspaceId?: string,
	): Promise<IPCResponse<FileOpenTarget[]>> =>
		window.electron.fileAction.detectOpenTargets(path, workspaceId),

	openWith: (
		path: string,
		targetId: string,
		workspaceId?: string,
	): Promise<IPCResponse<FileActionResult>> =>
		window.electron.fileAction.openWith(path, targetId, workspaceId),

	getAppIcon: (appPath: string): Promise<IPCResponse<string | null>> =>
		window.electron.fileAction.getAppIcon(appPath),
};
