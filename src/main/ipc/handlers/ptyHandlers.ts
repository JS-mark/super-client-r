/**
 * PTY (终端) IPC Handlers
 *
 * 由于需要按 webContents 单播 pty 流式输出，且要在窗口销毁时清理 listener
 * 与对应 pty 进程，所以这部分不能走 Typed IPC Proxy（registerAPI），
 * 必须用 ipcMain.handle 拿到 event.sender。
 */

import { ipcMain, type IpcMainInvokeEvent, type WebContents } from "electron";
import { PTY_CHANNELS } from "../channels";
import { ptyService } from "../../services/pty/PtyService";
import type {
	PtyCreateRequest,
	PtyDataEvent,
	PtyExitEvent,
} from "../../services/pty/types";
import { logger } from "../../utils/logger";

/**
 * 每个 webContents 维护：
 *   - 它持有的 pty sessionId 集合（用于 destroyed 时回收 + listener 过滤）
 *   - 它注册的 'data' / 'exit' listener（去注册用）
 */
interface WcBinding {
	sessions: Set<string>;
	dataListener: (e: PtyDataEvent) => void;
	exitListener: (e: PtyExitEvent) => void;
}

const bindings = new Map<number, WcBinding>();

function ensureBinding(wc: WebContents): WcBinding {
	let b = bindings.get(wc.id);
	if (b) return b;

	const dataListener = (event: PtyDataEvent) => {
		const cur = bindings.get(wc.id);
		if (!cur || !cur.sessions.has(event.sessionId)) return;
		if (wc.isDestroyed()) return;
		wc.send(PTY_CHANNELS.DATA, event);
	};

	const exitListener = (event: PtyExitEvent) => {
		const cur = bindings.get(wc.id);
		if (!cur || !cur.sessions.has(event.sessionId)) return;
		cur.sessions.delete(event.sessionId);
		if (!wc.isDestroyed()) {
			wc.send(PTY_CHANNELS.EXIT, event);
		}
	};

	ptyService.on("data", dataListener);
	ptyService.on("exit", exitListener);

	b = { sessions: new Set(), dataListener, exitListener };
	bindings.set(wc.id, b);

	wc.once("destroyed", () => {
		const cur = bindings.get(wc.id);
		if (!cur) return;
		ptyService.off("data", cur.dataListener);
		ptyService.off("exit", cur.exitListener);
		// 把这个窗口持有的 pty 全部 kill 掉（窗口已经走人）
		for (const sid of cur.sessions) {
			ptyService.kill(sid);
		}
		bindings.delete(wc.id);
	});

	return b;
}

export function registerPtyHandlers(): void {
	ipcMain.handle(
		PTY_CHANNELS.CREATE,
		async (event: IpcMainInvokeEvent, request: PtyCreateRequest) => {
			try {
				const binding = ensureBinding(event.sender);
				const result = ptyService.create(request);
				binding.sessions.add(result.sessionId);
				return { success: true, data: result };
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "Failed to create pty";
				logger.error(
					"[ptyHandlers] create failed",
					error instanceof Error ? error : undefined,
					{ sessionId: request?.sessionId },
				);
				return { success: false, error: message };
			}
		},
	);

	ipcMain.handle(
		PTY_CHANNELS.WRITE,
		async (_event, sessionId: string, data: string) => {
			try {
				ptyService.write(sessionId, data);
				return { success: true };
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "Failed to write pty";
				return { success: false, error: message };
			}
		},
	);

	ipcMain.handle(
		PTY_CHANNELS.RESIZE,
		async (_event, sessionId: string, cols: number, rows: number) => {
			try {
				ptyService.resize(sessionId, cols, rows);
				return { success: true };
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "Failed to resize pty";
				return { success: false, error: message };
			}
		},
	);

	ipcMain.handle(
		PTY_CHANNELS.KILL,
		async (event: IpcMainInvokeEvent, sessionId: string) => {
			try {
				ptyService.kill(sessionId);
				const cur = bindings.get(event.sender.id);
				cur?.sessions.delete(sessionId);
				return { success: true };
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "Failed to kill pty";
				return { success: false, error: message };
			}
		},
	);

	ipcMain.handle(PTY_CHANNELS.LIST, async () => {
		try {
			return { success: true, data: ptyService.list() };
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to list pty";
			return { success: false, error: message };
		}
	});
}
