/**
 * 设备端 Agent (独立客户端)
 *
 * 编译: bun run device-agent/build.ts
 * 运行: DEVICE_ID=xxx DEVICE_TOKEN=xxx SERVER_URL=ws://host:port ./device-agent
 */

import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// 配置(从环境变量读取)
const DEVICE_ID = process.env.DEVICE_ID || "device-001";
const DEVICE_TOKEN = process.env.DEVICE_TOKEN || "";
const SERVER_URL = process.env.SERVER_URL || "ws://localhost:8088";
const RELAY_KEY = process.env.RELAY_KEY || ""; // 非空时走 relay 模式

interface ServerMessage {
	type: string;
	success?: boolean;
	error?: string;
	requestId?: string;
	command?: string;
	line?: string;
	cursorPos?: number;
}

class DeviceAgent {
	private ws: WebSocket | null = null;
	private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private runningProcesses: Map<string, ChildProcess> = new Map();
	private currentDir: string = os.homedir();
	private previousDir: string = os.homedir();

	start(): void {
		if (!DEVICE_TOKEN) {
			console.error("错误: 请提供 DEVICE_TOKEN 环境变量");
			console.error(
				"示例: DEVICE_ID=my-device DEVICE_TOKEN=your-token ./device-agent",
			);
			process.exit(1);
		}

		console.log("[Agent] 启动中...");
		console.log(`[Agent] 设备 ID: ${DEVICE_ID}`);
		console.log(`[Agent] 服务器: ${SERVER_URL}`);
		if (RELAY_KEY) {
			console.log(`[Agent] Relay 模式 (key: ${RELAY_KEY.slice(0, 8)}...)`);
		}
		this.connect();
	}

	private connect(): void {
		console.log("[Agent] 正在连接到服务器...");
		this.ws = new WebSocket(SERVER_URL);

		this.ws.onopen = () => {
			console.log("[Agent] 已连接到服务器");
			this.register();
			this.startHeartbeat();
		};

		this.ws.onmessage = (event: MessageEvent) => {
			try {
				const data =
					typeof event.data === "string" ? event.data : String(event.data);
				const message: ServerMessage = JSON.parse(data);
				this.handleMessage(message);
			} catch (error) {
				console.error("[Agent] 解析消息失败:", error);
			}
		};

		this.ws.onclose = () => {
			console.log("[Agent] 与服务器断开连接");
			this.stopHeartbeat();
			this.scheduleReconnect();
		};

		this.ws.onerror = (event: Event) => {
			console.error(
				"[Agent] WebSocket 错误:",
				(event as ErrorEvent).message || event,
			);
		};
	}

	private register(): void {
		if (RELAY_KEY) {
			// Relay 模式：先发 relay_auth，等 relay_auth_ack 后再发 register
			console.log("[Agent] 发送 relay 认证...");
			this.ws!.send(
				JSON.stringify({
					type: "relay_auth",
					role: "device",
					relayKey: RELAY_KEY,
					deviceId: DEVICE_ID,
				}),
			);
		} else {
			this.sendRegister();
		}
	}

	private sendRegister(): void {
		const msg = {
			type: "register",
			deviceId: DEVICE_ID,
			token: DEVICE_TOKEN,
			platform: os.platform(),
			ipAddress: this.getLocalIP(),
		};

		console.log("[Agent] 正在注册设备...");
		this.ws!.send(JSON.stringify(msg));
	}

	private startHeartbeat(): void {
		this.heartbeatTimer = setInterval(() => {
			if (this.ws && this.ws.readyState === WebSocket.OPEN) {
				this.ws.send(
					JSON.stringify({
						type: "heartbeat",
						deviceId: DEVICE_ID,
					}),
				);
			}
		}, 10000);
	}

	private stopHeartbeat(): void {
		if (this.heartbeatTimer) {
			clearInterval(this.heartbeatTimer);
			this.heartbeatTimer = null;
		}
	}

	private scheduleReconnect(): void {
		if (this.reconnectTimer) return;

		console.log("[Agent] 5 秒后重新连接...");
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			this.connect();
		}, 5000);
	}

	private async handleMessage(message: ServerMessage): Promise<void> {
		switch (message.type) {
			case "relay_auth_ack":
				if (message.success) {
					console.log("[Agent] Relay 认证成功，开始注册设备...");
					this.sendRegister();
				} else {
					console.error("[Agent] Relay 认证失败:", message.error);
					process.exit(1);
				}
				break;

			case "register_ack":
				if (message.success) {
					console.log("[Agent] 注册成功!");
				} else {
					console.error("[Agent] 注册失败:", message.error);
					process.exit(1);
				}
				break;

			case "execute_command":
				console.log(`[Agent] 收到命令: ${message.command}`);
				this.executeCommand(message.requestId!, message.command!);
				break;

			case "kill_command":
				console.log(`[Agent] 终止命令: ${message.requestId}`);
				this.killCommand(message.requestId!);
				break;

			case "tab_complete":
				this.handleTabComplete(
					message.requestId!,
					message.line || "",
					message.cursorPos || 0,
				);
				break;

			case "get_cwd":
				this.sendMessage({
					type: "get_cwd_result",
					requestId: message.requestId,
					cwd: this.currentDir,
				});
				break;

			default:
				console.warn("[Agent] 未知消息类型:", message.type);
		}
	}

	/** 解析 cd 命令的目标路径，返回 null 表示不是纯 cd 命令 */
	private parseCdTarget(command: string): string | null {
		const trimmed = command.trim();
		// 纯 cd（无参数）→ home
		if (trimmed === "cd") return os.homedir();
		// cd 后跟路径（不含 &&, ||, ;, | 等复合操作符）
		const match = trimmed.match(/^cd\s+([^&|;]+)$/);
		if (!match) return null;
		const target = match[1].trim();
		if (target === "~" || target === "$HOME") return os.homedir();
		if (target.startsWith("~/")) return path.join(os.homedir(), target.slice(2));
		if (target === "-") return this.previousDir;
		if (path.isAbsolute(target)) return target;
		return path.resolve(this.currentDir, target);
	}

	private executeCommand(requestId: string, command: string): void {
		const startTime = Date.now();

		// 处理纯 cd 命令
		const cdTarget = this.parseCdTarget(command);
		if (cdTarget !== null) {
			try {
				const resolved = fs.realpathSync(cdTarget);
				const stat = fs.statSync(resolved);
				if (!stat.isDirectory()) {
					this.sendMessage({
						type: "command_output_chunk",
						requestId,
						deviceId: DEVICE_ID,
						stream: "stderr",
						data: `cd: not a directory: ${cdTarget}\n`,
					});
					this.sendMessage({
						type: "command_result",
						requestId,
						deviceId: DEVICE_ID,
						stdout: "",
						stderr: "",
						exitCode: 1,
						duration: Date.now() - startTime,
						cwd: this.currentDir,
					});
					return;
				}
				this.previousDir = this.currentDir;
				this.currentDir = resolved;
				console.log(`[Agent] cd → ${resolved}`);
				this.sendMessage({
					type: "command_result",
					requestId,
					deviceId: DEVICE_ID,
					stdout: "",
					stderr: "",
					exitCode: 0,
					duration: Date.now() - startTime,
					cwd: this.currentDir,
				});
			} catch {
				this.sendMessage({
					type: "command_output_chunk",
					requestId,
					deviceId: DEVICE_ID,
					stream: "stderr",
					data: `cd: no such file or directory: ${cdTarget}\n`,
				});
				this.sendMessage({
					type: "command_result",
					requestId,
					deviceId: DEVICE_ID,
					stdout: "",
					stderr: "",
					exitCode: 1,
					duration: Date.now() - startTime,
					cwd: this.currentDir,
				});
			}
			return;
		}

		const timeout = 1800000; // 30 分钟安全兜底

		console.log(`[Agent] 执行中 (cwd=${this.currentDir}): ${command}`);

		const child = spawn(command, { shell: true, cwd: this.currentDir });
		this.runningProcesses.set(requestId, child);

		const timer = setTimeout(() => {
			console.error(`[Agent] 命令超时 (${timeout}ms), 终止进程`);
			child.kill("SIGKILL");
		}, timeout);

		child.stdout.on("data", (chunk: Buffer) => {
			const data = chunk.toString();
			this.sendMessage({
				type: "command_output_chunk",
				requestId,
				deviceId: DEVICE_ID,
				stream: "stdout",
				data,
			});
		});

		child.stderr.on("data", (chunk: Buffer) => {
			const data = chunk.toString();
			this.sendMessage({
				type: "command_output_chunk",
				requestId,
				deviceId: DEVICE_ID,
				stream: "stderr",
				data,
			});
		});

		child.on("close", (code: number | null) => {
			clearTimeout(timer);
			this.runningProcesses.delete(requestId);
			const duration = Date.now() - startTime;
			console.log(`[Agent] 执行完成 (exit=${code}, ${duration}ms)`);

			this.sendMessage({
				type: "command_result",
				requestId,
				deviceId: DEVICE_ID,
				stdout: "",
				stderr: "",
				exitCode: code ?? 1,
				duration,
				cwd: this.currentDir,
			});
		});

		child.on("error", (err: Error) => {
			clearTimeout(timer);
			this.runningProcesses.delete(requestId);
			const duration = Date.now() - startTime;
			console.error(`[Agent] 执行失败 (${duration}ms):`, err.message);

			this.sendMessage({
				type: "command_result",
				requestId,
				deviceId: DEVICE_ID,
				stdout: "",
				stderr: err.message,
				exitCode: 1,
				duration,
				cwd: this.currentDir,
			});
		});
	}

	private killCommand(requestId: string): void {
		const child = this.runningProcesses.get(requestId);
		if (child) {
			console.log(`[Agent] 正在终止进程: ${requestId}`);
			child.kill("SIGTERM");
			// 如果 SIGTERM 没效果，1 秒后强制 SIGKILL
			setTimeout(() => {
				if (this.runningProcesses.has(requestId)) {
					child.kill("SIGKILL");
				}
			}, 1000);
		}
	}

	private handleTabComplete(
		requestId: string,
		line: string,
		cursorPos: number,
	): void {
		const beforeCursor = line.slice(0, cursorPos);
		const lastSpace = beforeCursor.lastIndexOf(" ");
		const wordStart = lastSpace + 1;
		const prefix = beforeCursor.slice(wordStart);
		const isFirstWord = !beforeCursor.slice(0, wordStart).trim();

		const escaped = prefix.replace(/'/g, "'\\''");
		const compgenType = isFirstWord ? "-c -f" : "-f";
		const cmd = `compgen ${compgenType} -- '${escaped}' 2>/dev/null | sort -u | head -50`;

		const child = spawn("bash", ["-c", cmd], { cwd: this.currentDir });
		let output = "";

		const timer = setTimeout(() => {
			child.kill();
			this.sendMessage({
				type: "tab_complete_result",
				requestId,
				matches: [],
				wordStart,
			});
		}, 3000);

		child.stdout.on("data", (chunk: Buffer) => {
			output += chunk.toString();
		});

		child.on("close", () => {
			clearTimeout(timer);
			const matches = output.trim().split("\n").filter(Boolean);
			this.sendMessage({
				type: "tab_complete_result",
				requestId,
				matches,
				wordStart,
			});
		});

		child.on("error", () => {
			clearTimeout(timer);
			this.sendMessage({
				type: "tab_complete_result",
				requestId,
				matches: [],
				wordStart,
			});
		});
	}

	private sendMessage(msg: Record<string, unknown>): void {
		if (this.ws && this.ws.readyState === WebSocket.OPEN) {
			this.ws.send(JSON.stringify(msg));
		}
	}

	private getLocalIP(): string {
		const interfaces = os.networkInterfaces();
		for (const name of Object.keys(interfaces)) {
			for (const iface of interfaces[name]!) {
				if (iface.family === "IPv4" && !iface.internal) {
					return iface.address;
				}
			}
		}
		return "127.0.0.1";
	}

	close(): void {
		this.stopHeartbeat();
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		// 终止所有运行中的进程
		for (const [, child] of this.runningProcesses) {
			child.kill("SIGKILL");
		}
		this.runningProcesses.clear();
		if (this.ws) {
			this.ws.close();
			this.ws = null;
		}
	}
}

// 启动
const agent = new DeviceAgent();
agent.start();

// 优雅退出
const shutdown = () => {
	console.log("\n[Agent] 正在退出...");
	agent.close();
	process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
