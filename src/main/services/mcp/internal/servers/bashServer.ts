/**
 * @scp/bash — 内置 Bash/Shell 执行工具
 * 通过 child_process 执行系统 shell 命令和脚本
 * 环境类型：local（非沙箱，需用户授权）
 */

import { exec, execFile } from "child_process";
import { mkdtemp, writeFile, rm, chmod } from "fs/promises";
import { join } from "path";
import { tmpdir, platform, arch, hostname, userInfo, cpus, totalmem, freemem, homedir, uptime, type } from "os";
import type { InternalMcpServer, InternalToolHandler } from "../types";
import { logger } from "../../../../utils/logger";

const log = logger.withContext("InternalMCP:Bash");

/* ------------------------------------------------------------------ */
/*  常量                                                               */
/* ------------------------------------------------------------------ */

const DEFAULT_CMD_TIMEOUT = 30_000; // 30s
const MAX_CMD_TIMEOUT = 120_000; // 120s
const DEFAULT_SCRIPT_TIMEOUT = 60_000; // 60s
const MAX_SCRIPT_TIMEOUT = 300_000; // 300s
const MAX_OUTPUT_SIZE = 512 * 1024; // 512KB
const KILL_GRACE_PERIOD = 5_000; // SIGTERM → 等 5s → SIGKILL

/** 默认 shell 路径 */
const DEFAULT_SHELL = platform() === "win32" ? "cmd.exe" : "/bin/bash";

/** 危险命令模式 */
const DANGEROUS_PATTERNS: Array<{ pattern: RegExp; description: string }> = [
	{
		pattern: /\brm\s+(-[^\s]*\s+)*\/\s*$/,
		description: "rm on root directory",
	},
	{
		pattern: /\brm\s+-[^\s]*r[^\s]*f[^\s]*\s+\/\s*$/,
		description: "rm -rf /",
	},
	{
		pattern: /\brm\s+-[^\s]*f[^\s]*r[^\s]*\s+\/\s*$/,
		description: "rm -fr /",
	},
	{ pattern: /\bmkfs\b/, description: "disk format command" },
	{ pattern: /\bdd\s+.*of=\/dev\//, description: "dd write to raw device" },
	{
		pattern: /:\(\)\s*\{\s*:\|:&\s*\}\s*;?\s*:/,
		description: "fork bomb",
	},
	{
		pattern: />\s*\/dev\/sd[a-z]/,
		description: "overwrite disk device",
	},
	{
		pattern: /\bchmod\s+(-[^\s]+\s+)*777\s+\/\s*$/,
		description: "chmod 777 on root",
	},
];

/* ------------------------------------------------------------------ */
/*  工具函数                                                           */
/* ------------------------------------------------------------------ */

function textResult(text: string, isError = false) {
	return { content: [{ type: "text" as const, text }], isError };
}

function clampTimeout(
	value: unknown,
	defaultMs: number,
	maxMs: number,
): number {
	const n = typeof value === "number" ? value : defaultMs;
	return Math.max(1_000, Math.min(n, maxMs));
}

function checkDangerous(command: string): string | null {
	for (const { pattern, description } of DANGEROUS_PATTERNS) {
		if (pattern.test(command)) {
			return description;
		}
	}
	return null;
}

function truncateOutput(text: string, label: string): string {
	if (text.length <= MAX_OUTPUT_SIZE) return text;
	return (
		text.slice(0, MAX_OUTPUT_SIZE) +
		`\n\n[${label} truncated, showing first 512KB of ${(text.length / 1024).toFixed(0)}KB]`
	);
}

function formatExecResult(
	stdout: string,
	stderr: string,
	exitCode: number | null,
): string {
	const parts: string[] = [];

	parts.push(`exit_code: ${exitCode ?? "unknown"}`);

	if (stdout) {
		parts.push(`stdout:\n${truncateOutput(stdout, "stdout")}`);
	}
	if (stderr) {
		parts.push(`stderr:\n${truncateOutput(stderr, "stderr")}`);
	}
	if (!stdout && !stderr) {
		parts.push("(no output)");
	}

	return parts.join("\n\n");
}

function resolveShell(shell?: unknown): string {
	if (typeof shell === "string" && shell.length > 0) return shell;
	// 尝试用户的默认 shell
	try {
		const info = userInfo();
		if (info.shell) return info.shell;
	} catch {
		// ignore
	}
	return DEFAULT_SHELL;
}

function parseEnvArg(env: unknown): Record<string, string> | undefined {
	if (!env || typeof env !== "object") return undefined;
	const result: Record<string, string> = {};
	for (const [k, v] of Object.entries(env as Record<string, unknown>)) {
		result[k] = String(v);
	}
	return result;
}

/* ------------------------------------------------------------------ */
/*  Tool 1: execute_command                                            */
/* ------------------------------------------------------------------ */

const executeCommandHandler: InternalToolHandler = async (args) => {
	const command = args.command as string;
	if (!command || typeof command !== "string") {
		return textResult("Error: command is required and must be a string", true);
	}

	// 危险命令检测
	const danger = checkDangerous(command);
	if (danger) {
		return textResult(
			`Error: command blocked for safety — ${danger}. If you really need this, please run it manually in a terminal.`,
			true,
		);
	}

	const workingDir = (args.workingDir as string) || undefined;
	const timeout = clampTimeout(args.timeout, DEFAULT_CMD_TIMEOUT, MAX_CMD_TIMEOUT);
	const shell = resolveShell(args.shell);
	const extraEnv = parseEnvArg(args.env);

	try {
		const { stdout, stderr, exitCode } = await new Promise<{
			stdout: string;
			stderr: string;
			exitCode: number | null;
		}>((resolve, reject) => {
			const child = exec(
				command,
				{
					cwd: workingDir,
					timeout,
					maxBuffer: MAX_OUTPUT_SIZE * 2,
					shell,
					env: extraEnv
						? { ...process.env, ...extraEnv }
						: process.env,
				},
				(error, stdout, stderr) => {
					if (error) {
						// 超时被 kill
						if (error.killed || error.signal === "SIGTERM") {
							reject(
								new Error(`Command timed out after ${timeout}ms`),
							);
							return;
						}
						// 非零退出但有输出
						resolve({
							stdout: stdout || "",
							stderr: stderr || error.message || String(error),
							exitCode: error.code ?? 1,
						});
						return;
					}
					resolve({
						stdout: stdout || "",
						stderr: stderr || "",
						exitCode: 0,
					});
				},
			);

			// 超时后二次 SIGKILL
			const killTimer = setTimeout(() => {
				if (child.pid && !child.killed) {
					try {
						process.kill(child.pid, "SIGKILL");
					} catch {
						// ignore
					}
				}
			}, timeout + KILL_GRACE_PERIOD);

			child.on("exit", () => clearTimeout(killTimer));
		});

		const isError = exitCode !== 0 && !stdout && !!stderr;
		return textResult(formatExecResult(stdout, stderr, exitCode), isError);
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		return textResult(`Error: ${msg}`, true);
	}
};

/* ------------------------------------------------------------------ */
/*  Tool 2: execute_script                                             */
/* ------------------------------------------------------------------ */

const executeScriptHandler: InternalToolHandler = async (args) => {
	const script = args.script as string;
	if (!script || typeof script !== "string") {
		return textResult("Error: script is required and must be a string", true);
	}

	const interpreterArg = (args.interpreter as string) || "bash";
	const workingDir = (args.workingDir as string) || undefined;
	const timeout = clampTimeout(
		args.timeout,
		DEFAULT_SCRIPT_TIMEOUT,
		MAX_SCRIPT_TIMEOUT,
	);
	const extraEnv = parseEnvArg(args.env);

	// 解析解释器路径
	const interpreterMap: Record<string, string> = {
		bash: "/bin/bash",
		sh: "/bin/sh",
		zsh: "/bin/zsh",
	};
	const interpreter = interpreterMap[interpreterArg] || interpreterArg;

	// 如果脚本没有自己的 set 声明，自动加 set -e
	const hasSetDirective = /^\s*set\s+[+-]/m.test(script);
	const finalScript = hasSetDirective ? script : `set -e\n${script}`;

	let tmpDir: string | null = null;

	try {
		tmpDir = await mkdtemp(join(tmpdir(), "scp-bash-"));
		const tmpFile = join(tmpDir, "script.sh");
		await writeFile(tmpFile, finalScript, "utf-8");
		await chmod(tmpFile, 0o755);

		const { stdout, stderr, exitCode } = await new Promise<{
			stdout: string;
			stderr: string;
			exitCode: number | null;
		}>((resolve, reject) => {
			const child = execFile(
				interpreter,
				[tmpFile],
				{
					cwd: workingDir,
					timeout,
					maxBuffer: MAX_OUTPUT_SIZE * 2,
					env: extraEnv
						? { ...process.env, ...extraEnv }
						: process.env,
				},
				(error, stdout, stderr) => {
					if (error) {
						if (error.killed || error.signal === "SIGTERM") {
							reject(
								new Error(
									`Script timed out after ${timeout}ms`,
								),
							);
							return;
						}
						resolve({
							stdout: stdout || "",
							stderr:
								stderr || error.message || String(error),
							exitCode:
								typeof error.code === "number"
									? error.code
									: 1,
						});
						return;
					}
					resolve({
						stdout: stdout || "",
						stderr: stderr || "",
						exitCode: 0,
					});
				},
			);

			const killTimer = setTimeout(() => {
				if (child.pid && !child.killed) {
					try {
						process.kill(child.pid, "SIGKILL");
					} catch {
						// ignore
					}
				}
			}, timeout + KILL_GRACE_PERIOD);

			child.on("exit", () => clearTimeout(killTimer));
		});

		const isError = exitCode !== 0 && !stdout && !!stderr;
		return textResult(formatExecResult(stdout, stderr, exitCode), isError);
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		return textResult(`Error: ${msg}`, true);
	} finally {
		if (tmpDir) {
			rm(tmpDir, { recursive: true, force: true }).catch(() => {});
		}
	}
};

/* ------------------------------------------------------------------ */
/*  Tool 3: get_system_info                                            */
/* ------------------------------------------------------------------ */

const getSystemInfoHandler: InternalToolHandler = async () => {
	try {
		const cpuList = cpus();
		const cpuModel = cpuList.length > 0 ? cpuList[0].model : "unknown";
		const totalMemGB = +(totalmem() / 1024 / 1024 / 1024).toFixed(1);
		const freeMemGB = +(freemem() / 1024 / 1024 / 1024).toFixed(1);
		const uptimeSec = uptime();
		const days = Math.floor(uptimeSec / 86400);
		const hours = Math.floor((uptimeSec % 86400) / 3600);
		const minutes = Math.floor((uptimeSec % 3600) / 60);

		let shell = DEFAULT_SHELL;
		try {
			shell = userInfo().shell || DEFAULT_SHELL;
		} catch {
			// ignore
		}

		let nodeVersion = "unknown";
		try {
			nodeVersion = process.version;
		} catch {
			// ignore
		}

		const info = {
			os: `${type()} ${platform()} ${process.getSystemVersion?.() || ""}`.trim(),
			platform: platform(),
			arch: arch(),
			hostname: hostname(),
			username: userInfo().username,
			shell,
			homeDir: homedir(),
			tempDir: tmpdir(),
			cpuModel,
			cpuCount: cpuList.length,
			totalMemoryGB: totalMemGB,
			freeMemoryGB: freeMemGB,
			nodeVersion,
			uptime: `${days}d ${hours}h ${minutes}m`,
		};

		return textResult(JSON.stringify(info, null, 2));
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		return textResult(`Error: ${msg}`, true);
	}
};

/* ------------------------------------------------------------------ */
/*  Tool 4: check_commands                                             */
/* ------------------------------------------------------------------ */

const checkCommandsHandler: InternalToolHandler = async (args) => {
	const commands = args.commands as string[];
	if (!Array.isArray(commands) || commands.length === 0) {
		return textResult(
			"Error: commands is required and must be a non-empty array of strings",
			true,
		);
	}

	const results: Record<
		string,
		{ available: boolean; path: string | null; version: string | null }
	> = {};

	const whichCmd = platform() === "win32" ? "where" : "which";

	await Promise.all(
		commands.map(async (cmd) => {
			if (typeof cmd !== "string" || !cmd) {
				results[cmd] = { available: false, path: null, version: null };
				return;
			}

			// 查找路径
			const cmdPath = await new Promise<string | null>((resolve) => {
				exec(`${whichCmd} ${cmd}`, { timeout: 5_000 }, (err, stdout) => {
					if (err) {
						resolve(null);
						return;
					}
					resolve(stdout.trim().split("\n")[0] || null);
				});
			});

			if (!cmdPath) {
				results[cmd] = { available: false, path: null, version: null };
				return;
			}

			// 尝试获取版本
			const version = await new Promise<string | null>((resolve) => {
				exec(
					`${cmd} --version`,
					{ timeout: 5_000 },
					(err, stdout, stderr) => {
						if (err && !stdout && !stderr) {
							resolve(null);
							return;
						}
						const output = (stdout || stderr || "").trim();
						// 取第一行，通常包含版本号
						const firstLine = output.split("\n")[0] || null;
						resolve(firstLine);
					},
				);
			});

			results[cmd] = { available: true, path: cmdPath, version };
		}),
	);

	return textResult(JSON.stringify(results, null, 2));
};

/* ------------------------------------------------------------------ */
/*  Tool 5: get_env                                                    */
/* ------------------------------------------------------------------ */

const getEnvHandler: InternalToolHandler = async (args) => {
	const names = args.names as string[] | undefined;
	const useShell = args.shell === true;

	try {
		let envVars: Record<string, string | undefined>;

		if (useShell) {
			// 启动 login shell 来加载 profile，获取完整环境变量
			const shellBin = resolveShell();
			const envOutput = await new Promise<string>((resolve, reject) => {
				exec(
					`${shellBin} -l -c env`,
					{ timeout: 10_000, maxBuffer: MAX_OUTPUT_SIZE },
					(err, stdout) => {
						if (err) {
							reject(
								new Error(
									`Failed to load shell env: ${err.message}`,
								),
							);
							return;
						}
						resolve(stdout);
					},
				);
			});

			envVars = {};
			for (const line of envOutput.split("\n")) {
				const eqIdx = line.indexOf("=");
				if (eqIdx > 0) {
					envVars[line.slice(0, eqIdx)] = line.slice(eqIdx + 1);
				}
			}
		} else {
			envVars = process.env as Record<string, string | undefined>;
		}

		if (names && Array.isArray(names) && names.length > 0) {
			const filtered: Record<string, string | null> = {};
			for (const name of names) {
				filtered[name] = envVars[name] ?? null;
			}
			return textResult(JSON.stringify(filtered, null, 2));
		}

		// 返回全部（过滤掉 undefined）
		const all: Record<string, string> = {};
		for (const [k, v] of Object.entries(envVars)) {
			if (v !== undefined) all[k] = v;
		}
		return textResult(JSON.stringify(all, null, 2));
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		return textResult(`Error: ${msg}`, true);
	}
};

/* ------------------------------------------------------------------ */
/*  Tool 6: list_processes                                             */
/* ------------------------------------------------------------------ */

const listProcessesHandler: InternalToolHandler = async (args) => {
	const filter = (args.filter as string) || "";
	const sortBy = (args.sortBy as string) || "cpu";
	const limit = Math.min(Math.max((args.limit as number) || 20, 1), 200);

	try {
		const isWin = platform() === "win32";

		const rawOutput = await new Promise<string>((resolve, reject) => {
			const cmd = isWin
				? "tasklist /fo csv /nh"
				: "ps -eo pid,pcpu,pmem,comm --no-headers --sort=-pcpu";

			exec(cmd, { timeout: 10_000, maxBuffer: MAX_OUTPUT_SIZE }, (err, stdout) => {
				if (err) {
					reject(new Error(`Failed to list processes: ${err.message}`));
					return;
				}
				resolve(stdout);
			});
		});

		interface ProcessInfo {
			pid: number;
			cpu: number;
			memory: number;
			name: string;
		}

		let processes: ProcessInfo[] = [];

		if (isWin) {
			// Windows: CSV 格式
			for (const line of rawOutput.split("\n")) {
				const trimmed = line.trim();
				if (!trimmed) continue;
				const parts = trimmed.split('","').map((s) => s.replace(/"/g, ""));
				if (parts.length >= 2) {
					processes.push({
						name: parts[0],
						pid: parseInt(parts[1], 10) || 0,
						cpu: 0,
						memory: 0,
					});
				}
			}
		} else {
			// Unix: ps 输出
			for (const line of rawOutput.split("\n")) {
				const trimmed = line.trim();
				if (!trimmed) continue;
				const parts = trimmed.split(/\s+/, 4);
				if (parts.length >= 4) {
					processes.push({
						pid: parseInt(parts[0], 10) || 0,
						cpu: parseFloat(parts[1]) || 0,
						memory: parseFloat(parts[2]) || 0,
						name: parts[3],
					});
				}
			}
		}

		// 过滤
		if (filter) {
			const lowerFilter = filter.toLowerCase();
			processes = processes.filter((p) =>
				p.name.toLowerCase().includes(lowerFilter),
			);
		}

		// 排序
		switch (sortBy) {
			case "memory":
				processes.sort((a, b) => b.memory - a.memory);
				break;
			case "pid":
				processes.sort((a, b) => a.pid - b.pid);
				break;
			case "cpu":
			default:
				processes.sort((a, b) => b.cpu - a.cpu);
				break;
		}

		// 截取
		processes = processes.slice(0, limit);

		return textResult(JSON.stringify(processes, null, 2));
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		return textResult(`Error: ${msg}`, true);
	}
};

/* ------------------------------------------------------------------ */
/*  Tool 7: kill_process                                               */
/* ------------------------------------------------------------------ */

const killProcessHandler: InternalToolHandler = async (args) => {
	const pid = args.pid as number;
	if (typeof pid !== "number" || !Number.isInteger(pid) || pid <= 0) {
		return textResult(
			"Error: pid is required and must be a positive integer",
			true,
		);
	}

	const signalName = (args.signal as string) || "SIGTERM";

	// 验证信号名
	const validSignals = [
		"SIGTERM",
		"SIGKILL",
		"SIGINT",
		"SIGHUP",
		"SIGQUIT",
		"SIGUSR1",
		"SIGUSR2",
	];
	if (!validSignals.includes(signalName)) {
		return textResult(
			`Error: invalid signal "${signalName}". Valid signals: ${validSignals.join(", ")}`,
			true,
		);
	}

	// 防止 kill 关键进程
	if (pid === 1 || pid === process.pid) {
		return textResult(
			`Error: refusing to kill PID ${pid} (${pid === 1 ? "init process" : "self"})`,
			true,
		);
	}

	try {
		process.kill(pid, signalName as NodeJS.Signals);
		return textResult(
			`Signal ${signalName} sent to process ${pid} successfully.`,
		);
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		if (msg.includes("ESRCH")) {
			return textResult(
				`Error: process ${pid} not found (already exited?)`,
				true,
			);
		}
		if (msg.includes("EPERM")) {
			return textResult(
				`Error: permission denied to signal process ${pid}`,
				true,
			);
		}
		return textResult(`Error: ${msg}`, true);
	}
};

/* ------------------------------------------------------------------ */
/*  服务器工厂                                                         */
/* ------------------------------------------------------------------ */

export function createBashServer(): InternalMcpServer {
	const handlers = new Map<string, InternalToolHandler>();
	handlers.set("execute_command", executeCommandHandler);
	handlers.set("execute_script", executeScriptHandler);
	handlers.set("get_system_info", getSystemInfoHandler);
	handlers.set("check_commands", checkCommandsHandler);
	handlers.set("get_env", getEnvHandler);
	handlers.set("list_processes", listProcessesHandler);
	handlers.set("kill_process", killProcessHandler);

	return {
		id: "@scp/bash",
		name: "@scp/bash",
		description:
			"Execute shell commands and scripts using the local system shell. Provides system information, process management, environment inspection, and command availability checking. Requires user approval.",
		version: "1.0.0",
		tools: [
			/* ---- execute_command ---- */
			{
				name: "execute_command",
				description:
					"Execute a single shell command using the system shell (bash/zsh/sh). Supports pipes, redirects, and shell expansion. Returns stdout, stderr, and exit code. Use this for git operations, package management, build commands, text processing, and general system tasks.",
				inputSchema: {
					type: "object",
					properties: {
						command: {
							type: "string",
							description: "The shell command to execute",
						},
						workingDir: {
							type: "string",
							description:
								"Working directory for the command. Defaults to the conversation workspace directory.",
						},
						timeout: {
							type: "number",
							description:
								"Execution timeout in milliseconds (default: 30000, max: 120000)",
						},
						env: {
							type: "object",
							description:
								"Additional environment variables to set (key-value pairs, merged with process.env)",
							additionalProperties: { type: "string" },
						},
						shell: {
							type: "string",
							description:
								"Shell binary path (default: user's default shell, e.g. /bin/bash or /bin/zsh)",
						},
					},
					required: ["command"],
				},
			},

			/* ---- execute_script ---- */
			{
				name: "execute_script",
				description:
					"Execute a multi-line shell script. The script is written to a temporary file and executed with the specified interpreter. Automatically prepends 'set -e' (exit on error) unless the script already contains a set directive. Use this for complex multi-step operations.",
				inputSchema: {
					type: "object",
					properties: {
						script: {
							type: "string",
							description: "The shell script content (multi-line)",
						},
						interpreter: {
							type: "string",
							description:
								"Script interpreter: 'bash', 'sh', 'zsh', or a full path (default: 'bash')",
						},
						workingDir: {
							type: "string",
							description:
								"Working directory for execution. Defaults to the conversation workspace directory.",
						},
						timeout: {
							type: "number",
							description:
								"Execution timeout in milliseconds (default: 60000, max: 300000)",
						},
						env: {
							type: "object",
							description:
								"Additional environment variables (key-value pairs)",
							additionalProperties: { type: "string" },
						},
					},
					required: ["script"],
				},
			},

			/* ---- get_system_info ---- */
			{
				name: "get_system_info",
				description:
					"Get structured system information including OS, architecture, CPU, memory, hostname, username, shell, and uptime. Cross-platform compatible. Returns JSON.",
				inputSchema: {
					type: "object",
					properties: {},
				},
			},

			/* ---- check_commands ---- */
			{
				name: "check_commands",
				description:
					"Check whether one or more commands are available in the system PATH. Returns the path and version for each command. Useful for detecting installed tools before using them.",
				inputSchema: {
					type: "object",
					properties: {
						commands: {
							type: "array",
							items: { type: "string" },
							description:
								"List of command names to check (e.g. ['git', 'docker', 'python3'])",
						},
					},
					required: ["commands"],
				},
			},

			/* ---- get_env ---- */
			{
				name: "get_env",
				description:
					"Read environment variables. By default reads from the Electron process environment. Set shell=true to launch a login shell and load the user's full profile (~/.bashrc, ~/.zshrc, etc.).",
				inputSchema: {
					type: "object",
					properties: {
						names: {
							type: "array",
							items: { type: "string" },
							description:
								"Specific variable names to read. If omitted, returns all environment variables.",
						},
						shell: {
							type: "boolean",
							description:
								"If true, launch a login shell to load the user's profile and read variables from there (default: false)",
						},
					},
				},
			},

			/* ---- list_processes ---- */
			{
				name: "list_processes",
				description:
					"List running processes with PID, CPU%, memory%, and name. Supports filtering by process name and sorting. Cross-platform (uses 'ps' on Unix, 'tasklist' on Windows).",
				inputSchema: {
					type: "object",
					properties: {
						filter: {
							type: "string",
							description:
								"Filter processes by name (case-insensitive substring match)",
						},
						sortBy: {
							type: "string",
							enum: ["cpu", "memory", "pid"],
							description:
								"Sort field (default: 'cpu'). 'cpu' and 'memory' sort descending, 'pid' sorts ascending.",
						},
						limit: {
							type: "number",
							description:
								"Maximum number of processes to return (default: 20, max: 200)",
						},
					},
				},
			},

			/* ---- kill_process ---- */
			{
				name: "kill_process",
				description:
					"Send a signal to a process by PID. Defaults to SIGTERM (graceful termination). Use SIGKILL for force kill. Refuses to kill PID 1 (init) or the application's own process.",
				inputSchema: {
					type: "object",
					properties: {
						pid: {
							type: "number",
							description: "Process ID to signal",
						},
						signal: {
							type: "string",
							enum: [
								"SIGTERM",
								"SIGKILL",
								"SIGINT",
								"SIGHUP",
								"SIGQUIT",
								"SIGUSR1",
								"SIGUSR2",
							],
							description:
								"Signal to send (default: 'SIGTERM')",
						},
					},
					required: ["pid"],
				},
			},
		],
		handlers,
	};
}
