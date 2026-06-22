/**
 * PTY (Pseudo-terminal) 服务相关类型定义
 *
 * 用于在主进程通过 node-pty 启动真实的交互式 shell，
 * 然后把数据 / 退出事件经由 IPC 转发给渲染进程的 xterm。
 */

export interface PtyCreateRequest {
	/** 由 renderer 生成的 session id（uuid / nanoid） */
	sessionId: string;
	/** 启动时的工作目录；为空则由主进程兜底到 $HOME */
	cwd?: string;
	/** 初始终端尺寸 */
	cols: number;
	rows: number;
	/** 可选：指定 shell 路径，否则按平台默认 */
	shell?: string;
	/** 可选：附加环境变量（合并到 process.env 之上） */
	env?: Record<string, string>;
}

export interface PtyCreateResult {
	sessionId: string;
	shell: string;
	pid: number;
	cwd: string;
	/** Login user (os.userInfo().username) — used by the renderer for tab labels. */
	user: string;
	/** OS hostname (os.hostname()) — used by the renderer for tab labels. */
	host: string;
}

export interface PtyDataEvent {
	sessionId: string;
	data: string;
}

export interface PtyExitEvent {
	sessionId: string;
	exitCode: number;
	signal?: number;
}

export interface PtyInfo {
	sessionId: string;
	shell: string;
	pid: number;
	cwd: string;
}
