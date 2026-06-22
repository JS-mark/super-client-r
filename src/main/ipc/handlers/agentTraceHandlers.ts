/**
 * AgentTrace IPC Handlers
 *
 * `debug:agent-traces:*` 通道。详见 spec §17.4。
 *
 * - debug:agent-traces:list        → AgentTraceCollector.list
 * - debug:agent-traces:get         → AgentTraceCollector.get
 * - debug:agent-traces:clear       → AgentTraceCollector.clear
 * - debug:agent-traces:export      → 写出 jsonl，返回路径
 * - debug:agent-traces:set-config  → AgentTraceCollector.setConfig
 * - debug:agent-traces:get-config  → AgentTraceCollector.getConfig
 * - debug:agent-traces:updated     → renderer 订阅；新 trace summary 推送
 */

import { promises as fs } from "node:fs";
import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";
import {
	AGENT_TRACE_CHANNELS,
	type AgentTraceConfig,
	type AgentTraceFilter,
} from "@super-client/shared-types/agent-trace";

import { getAgentTraceCollector } from "../../services/agent/trace/AgentTraceCollector";

let unsubscribeBroadcast: (() => void) | null = null;

export function registerAgentTraceHandlers(): void {
	const collector = getAgentTraceCollector();

	// list
	ipcMain.handle(
		AGENT_TRACE_CHANNELS.LIST,
		async (_e, filter: AgentTraceFilter | undefined) => {
			try {
				return { success: true, data: collector.list(filter) };
			} catch (err) {
				return { success: false, error: errMsg(err) };
			}
		},
	);

	// get
	ipcMain.handle(AGENT_TRACE_CHANNELS.GET, async (_e, requestId: string) => {
		try {
			return { success: true, data: collector.get(requestId) };
		} catch (err) {
			return { success: false, error: errMsg(err) };
		}
	});

	// clear
	ipcMain.handle(AGENT_TRACE_CHANNELS.CLEAR, async () => {
		try {
			collector.clear();
			return { success: true };
		} catch (err) {
			return { success: false, error: errMsg(err) };
		}
	});

	// export
	ipcMain.handle(AGENT_TRACE_CHANNELS.EXPORT, async (_e, requestId: string) => {
		try {
			const entry = collector.get(requestId);
			if (!entry) {
				return { success: false, error: "trace not found" };
			}
			const dir = join(app.getPath("userData"), "agent-traces", "exports");
			await fs.mkdir(dir, { recursive: true });
			const file = join(dir, `${sanitize(requestId)}.jsonl`);
			const lines: string[] = [
				JSON.stringify({ kind: "header", entry: summaryOnly(entry) }),
				...entry.events.map((r) => JSON.stringify(r)),
			];
			await fs.writeFile(file, `${lines.join("\n")}\n`, "utf8");
			return { success: true, data: { path: file } };
		} catch (err) {
			return { success: false, error: errMsg(err) };
		}
	});

	// get-config
	ipcMain.handle(AGENT_TRACE_CHANNELS.GET_CONFIG, async () => {
		return { success: true, data: collector.getConfig() };
	});

	// set-config
	ipcMain.handle(
		AGENT_TRACE_CHANNELS.SET_CONFIG,
		async (_e, patch: Partial<AgentTraceConfig>) => {
			return { success: true, data: collector.setConfig(patch) };
		},
	);

	// summary 广播：每条新摘要推给所有 renderer
	if (!unsubscribeBroadcast) {
		unsubscribeBroadcast = collector.subscribe((summary) => {
			for (const win of BrowserWindow.getAllWindows()) {
				if (!win.isDestroyed()) {
					win.webContents.send(AGENT_TRACE_CHANNELS.UPDATED, summary);
				}
			}
		});
	}
}

export function disposeAgentTraceHandlers(): void {
	unsubscribeBroadcast?.();
	unsubscribeBroadcast = null;
}

// ─────────────────────────── helpers ───────────────────────────

function errMsg(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

const UNSAFE = /[^A-Za-z0-9._-]/g;
function sanitize(name: string): string {
	return name.replace(UNSAFE, "_").slice(0, 128) || "trace";
}

function summaryOnly(
	entry: ReturnType<typeof getAgentTraceCollector> extends {
		get(id: string): infer R;
	}
		? Exclude<R, null>
		: never,
) {
	const { events: _events, ...rest } = entry;
	return rest;
}
