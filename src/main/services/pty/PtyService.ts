/**
 * PtyService —— 主进程下的 PTY (pseudo-terminal) 管理器
 *
 * 用 node-pty 为每个 renderer 端 terminal session 拉起一个交互式 shell，
 * 把 onData / onExit 桥接成 EventEmitter 事件，由 ptyHandlers 负责单播给
 * 发起请求的 webContents。
 */

import { EventEmitter } from "node:events";
import { homedir, hostname, userInfo } from "node:os";
import { existsSync, statSync } from "node:fs";
import * as pty from "node-pty";
import { logger } from "../../utils/logger";
import type {
	PtyCreateRequest,
	PtyCreateResult,
	PtyDataEvent,
	PtyExitEvent,
	PtyInfo,
} from "./types";

interface ManagedPty {
	sessionId: string;
	process: pty.IPty;
	shell: string;
	cwd: string;
}

/** 抹掉 Electron / 启动器注入的、对 shell 不友好的环境变量 */
const STRIPPED_ENV_KEYS = [
	"ELECTRON_RUN_AS_NODE",
	"ELECTRON_NO_ATTACH_CONSOLE",
	"NODE_OPTIONS",
];

function resolveDefaultShell(): string {
	if (process.platform === "win32") {
		return process.env.COMSPEC || "powershell.exe";
	}
	return process.env.SHELL || "/bin/zsh";
}

function buildEnv(extra?: Record<string, string>): Record<string, string> {
	const base: Record<string, string> = {};
	for (const [k, v] of Object.entries(process.env)) {
		if (typeof v === "string" && !STRIPPED_ENV_KEYS.includes(k)) {
			base[k] = v;
		}
	}
	// 让 starship / oh-my-zsh / prompt 渲染颜色正常
	base.TERM = "xterm-256color";
	base.COLORTERM = "truecolor";
	if (!base.LANG) base.LANG = "en_US.UTF-8";
	return { ...base, ...extra };
}

function ensureDir(cwd: string | undefined): string {
	if (cwd && existsSync(cwd)) {
		try {
			if (statSync(cwd).isDirectory()) return cwd;
		} catch {
			// fallthrough to home
		}
	}
	return homedir();
}

class PtyService extends EventEmitter {
	private sessions = new Map<string, ManagedPty>();

	/** 启动一个新的 pty 会话 */
	create(req: PtyCreateRequest): PtyCreateResult {
		if (this.sessions.has(req.sessionId)) {
			throw new Error(`pty session already exists: ${req.sessionId}`);
		}

		const shell = req.shell || resolveDefaultShell();
		const cwd = ensureDir(req.cwd);
		const env = buildEnv(req.env);

		const cols = Math.max(2, Math.floor(req.cols || 80));
		const rows = Math.max(2, Math.floor(req.rows || 24));

		// macOS / Linux：以登录 + 交互式 shell 启动，让 .zshrc / .bash_profile 生效
		const args =
			process.platform === "win32"
				? []
				: shell.endsWith("zsh") || shell.endsWith("bash")
					? ["-l"]
					: [];

		let proc: pty.IPty;
		try {
			proc = pty.spawn(shell, args, {
				name: "xterm-256color",
				cols,
				rows,
				cwd,
				env,
			});
		} catch (error) {
			logger.error(
				"[PtyService] spawn failed",
				error instanceof Error ? error : undefined,
				{ shell, cwd },
			);
			throw error;
		}

		const managed: ManagedPty = {
			sessionId: req.sessionId,
			process: proc,
			shell,
			cwd,
		};
		this.sessions.set(req.sessionId, managed);

		proc.onData((data) => {
			// Filter stale events: if the registered session no longer points
			// to *this* IPty instance, we've been replaced (e.g. StrictMode
			// double-mount or kill+recreate with same id) — drop the data.
			const cur = this.sessions.get(req.sessionId);
			if (!cur || cur.process !== proc) return;
			const event: PtyDataEvent = { sessionId: req.sessionId, data };
			this.emit("data", event);
		});

		proc.onExit(({ exitCode, signal }) => {
			const event: PtyExitEvent = {
				sessionId: req.sessionId,
				exitCode,
				signal,
			};
			// Only clean up the map slot if it still holds *this* process.
			// Otherwise we'd evict the newly-created replacement and silently
			// drop all subsequent writes for that session id.
			const cur = this.sessions.get(req.sessionId);
			if (cur && cur.process === proc) {
				this.sessions.delete(req.sessionId);
				this.emit("exit", event);
			}
		});

		logger.info("[PtyService] created", {
			sessionId: req.sessionId,
			shell,
			cwd,
			pid: proc.pid,
		});

		let user = "user";
		try {
			user = userInfo().username || user;
		} catch {
			/* on some sandboxes userInfo throws */
		}

		return {
			sessionId: req.sessionId,
			shell,
			pid: proc.pid,
			cwd,
			user,
			host: hostname(),
		};
	}

	write(sessionId: string, data: string): void {
		const s = this.sessions.get(sessionId);
		if (!s) return;
		s.process.write(data);
	}

	resize(sessionId: string, cols: number, rows: number): void {
		const s = this.sessions.get(sessionId);
		if (!s) return;
		const c = Math.max(2, Math.floor(cols));
		const r = Math.max(2, Math.floor(rows));
		try {
			s.process.resize(c, r);
		} catch (error) {
			// pty may already be exited; ignore
			logger.debug("[PtyService] resize ignored", { sessionId, error });
		}
	}

	kill(sessionId: string): void {
		const s = this.sessions.get(sessionId);
		if (!s) return;
		try {
			s.process.kill();
		} catch (error) {
			logger.debug("[PtyService] kill failed", { sessionId, error });
		}
		this.sessions.delete(sessionId);
	}

	list(): PtyInfo[] {
		return Array.from(this.sessions.values()).map((s) => ({
			sessionId: s.sessionId,
			shell: s.shell,
			pid: s.process.pid,
			cwd: s.cwd,
		}));
	}

	/** 在 app 退出时调用，统一回收所有 pty */
	disposeAll(): void {
		for (const s of this.sessions.values()) {
			try {
				s.process.kill();
			} catch {
				/* noop */
			}
		}
		this.sessions.clear();
	}
}

export const ptyService = new PtyService();
