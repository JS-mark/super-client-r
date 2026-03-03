import { EventEmitter } from "events";
import WebSocket, { WebSocketServer } from "ws";
import { nanoid } from "nanoid";
import crypto from "crypto";
import { BrowserWindow } from "electron";
import { REMOTE_DEVICE_CHANNELS } from "../../ipc/channels";
import type {
	RemoteDevice,
	CommandResult,
	WSMessage,
	WSRegisterMessage,
	WSHeartbeatMessage,
	WSCommandResultMessage,
	WSCommandOutputChunkMessage,
	WSTabCompleteResultMessage,
	WSGetCwdResultMessage,
	DevicePlatform,
} from "./types";

/**
 * 远程设备管理服务
 *
 * 功能:
 * - WebSocket 服务器
 * - 设备注册和认证
 * - 心跳管理
 * - 命令执行(异步请求-响应)
 * - 事件发射(device-online, device-offline, device-error)
 */
export class RemoteDeviceService extends EventEmitter {
	private wss: WebSocketServer | null = null;
	private devices: Map<string, RemoteDevice> = new Map();
	private deviceConnections: Map<string, WebSocket> = new Map();
	private pendingCommands: Map<
		string,
		{
			deviceId: string;
			resolve: (result: CommandResult) => void;
			reject: (error: Error) => void;
			timeout: NodeJS.Timeout;
		}
	> = new Map();
	private pendingCompletions: Map<
		string,
		{
			deviceId: string;
			resolve: (result: { matches: string[]; wordStart: number }) => void;
			reject: (error: Error) => void;
			timeout: NodeJS.Timeout;
		}
	> = new Map();
	private pendingCwdRequests: Map<
		string,
		{
			deviceId: string;
			resolve: (cwd: string) => void;
			reject: (error: Error) => void;
			timeout: NodeJS.Timeout;
		}
	> = new Map();

	/**
	 * 启动 WebSocket 服务器
	 */
	async start(port = 8088): Promise<void> {
		if (this.wss) {
			throw new Error("RemoteDeviceService already started");
		}

		this.wss = new WebSocketServer({ port });

		this.wss.on("connection", (ws: WebSocket, req) => {
			console.log("[RemoteDevice] Device connected:", req.socket.remoteAddress);

			ws.on("message", (data: Buffer) => {
				try {
					const message: WSMessage = JSON.parse(data.toString());
					this.handleDeviceMessage(ws, message);
				} catch (error) {
					console.error("[RemoteDevice] Failed to parse message:", error);
				}
			});

			ws.on("close", () => {
				const deviceId = this.findDeviceByConnection(ws);
				if (deviceId) {
					this.handleDeviceDisconnect(deviceId);
				}
			});

			ws.on("error", (error) => {
				console.error("[RemoteDevice] WebSocket error:", error);
			});
		});

		console.log(`[RemoteDevice] WebSocket server started on port ${port}`);
	}

	/**
	 * 停止 WebSocket 服务器
	 */
	async stop(): Promise<void> {
		if (this.wss) {
			this.wss.close();
			this.wss = null;

			// 清理所有连接
			for (const [deviceId, ws] of this.deviceConnections.entries()) {
				ws.close();
			}
			this.deviceConnections.clear();

			console.log("[RemoteDevice] WebSocket server stopped");
		}
	}

	/**
	 * 处理设备消息
	 */
	private handleDeviceMessage(ws: WebSocket, message: WSMessage): void {
		switch (message.type) {
			case "register":
				this.handleDeviceRegister(ws, message as WSRegisterMessage);
				break;
			case "heartbeat":
				this.handleDeviceHeartbeat(message as WSHeartbeatMessage);
				break;
			case "command_output_chunk":
				this.handleCommandOutputChunk(
					message as WSCommandOutputChunkMessage,
				);
				break;
			case "command_result":
				this.handleCommandResult(message as WSCommandResultMessage);
				break;
			case "tab_complete_result":
				this.handleTabCompleteResult(
					message as WSTabCompleteResultMessage,
				);
				break;
			case "get_cwd_result":
				this.handleGetCwdResult(message as WSGetCwdResultMessage);
				break;
			default:
				console.warn("[RemoteDevice] Unknown message type:", message.type);
		}
	}

	/**
	 * 设备注册
	 */
	private handleDeviceRegister(
		ws: WebSocket,
		message: WSRegisterMessage,
	): void {
		const { deviceId, token, platform, ipAddress } = message;

		// 验证 Token
		const device = this.devices.get(deviceId);
		if (!device || device.authentication.token !== token) {
			console.warn(`[RemoteDevice] Invalid token for device: ${deviceId}`);
			ws.send(
				JSON.stringify({
					type: "register_ack",
					success: false,
					error: "Invalid token",
				}),
			);
			ws.close(4001, "Invalid token");
			return;
		}

		// 更新设备状态
		device.status = "online";
		device.lastSeen = Date.now();
		device.platform = platform;
		if (ipAddress) {
			device.ipAddress = ipAddress;
		}

		this.deviceConnections.set(deviceId, ws);
		this.devices.set(deviceId, device);

		// 响应注册成功
		ws.send(
			JSON.stringify({
				type: "register_ack",
				success: true,
			}),
		);

		// 触发事件
		this.emit("device-online", device);
		console.log(
			`[RemoteDevice] Device registered: ${device.name} (${deviceId})`,
		);
	}

	/**
	 * 设备心跳
	 */
	private handleDeviceHeartbeat(message: WSHeartbeatMessage): void {
		const { deviceId } = message;
		const device = this.devices.get(deviceId);
		if (device) {
			device.lastSeen = Date.now();
			this.devices.set(deviceId, device);
		}
	}

	/**
	 * 处理命令输出流式 chunk，广播到所有窗口
	 */
	private handleCommandOutputChunk(
		message: WSCommandOutputChunkMessage,
	): void {
		const { requestId, deviceId, stream, data } = message;

		// 只转发有效请求的输出
		if (!this.pendingCommands.has(requestId)) return;

		BrowserWindow.getAllWindows().forEach((win) => {
			win.webContents.send(REMOTE_DEVICE_CHANNELS.COMMAND_OUTPUT, {
				requestId,
				deviceId,
				stream,
				data,
			});
		});
	}

	/**
	 * 处理命令执行结果
	 */
	private handleCommandResult(message: WSCommandResultMessage): void {
		const { requestId, deviceId, stdout, stderr, exitCode, duration, cwd } =
			message;

		const pending = this.pendingCommands.get(requestId);
		if (pending) {
			clearTimeout(pending.timeout);
			pending.resolve({
				requestId,
				deviceId,
				stdout,
				stderr,
				exitCode,
				duration,
				cwd,
			});
			this.pendingCommands.delete(requestId);
		}
	}

	/**
	 * 设备断开连接
	 */
	private handleDeviceDisconnect(deviceId: string): void {
		const device = this.devices.get(deviceId);
		if (device) {
			device.status = "offline";
			this.devices.set(deviceId, device);
			this.deviceConnections.delete(deviceId);

			// 立即 reject 该设备所有 pending 命令
			for (const [requestId, pending] of this.pendingCommands.entries()) {
				if (pending.deviceId === deviceId) {
					clearTimeout(pending.timeout);
					pending.reject(new Error("Device disconnected"));
					this.pendingCommands.delete(requestId);
				}
			}

			// reject pending completions
			for (const [reqId, pending] of this.pendingCompletions.entries()) {
				if (pending.deviceId === deviceId) {
					clearTimeout(pending.timeout);
					pending.resolve({ matches: [], wordStart: 0 });
					this.pendingCompletions.delete(reqId);
				}
			}

			// resolve pending cwd requests
			for (const [reqId, pending] of this.pendingCwdRequests.entries()) {
				if (pending.deviceId === deviceId) {
					clearTimeout(pending.timeout);
					pending.resolve("~");
					this.pendingCwdRequests.delete(reqId);
				}
			}

			this.emit("device-offline", device);
			console.log(
				`[RemoteDevice] Device disconnected: ${device.name} (${deviceId})`,
			);
		}
	}

	/**
	 * 执行命令
	 */
	async executeCommand(
		deviceId: string,
		command: string,
		timeout = 1800000, // 30 分钟安全兜底，正常靠 Ctrl+C 或断连终止
	): Promise<CommandResult> {
		const device = this.devices.get(deviceId);
		if (!device) {
			throw new Error("Device not found");
		}

		const ws = this.deviceConnections.get(deviceId);
		if (!ws || device.status !== "online") {
			throw new Error("Device not online");
		}

		const requestId = nanoid();

		return new Promise((resolve, reject) => {
			// 安全兜底超时
			const timer = setTimeout(() => {
				this.pendingCommands.delete(requestId);
				reject(new Error("Command execution timeout"));
			}, timeout);

			this.pendingCommands.set(requestId, {
				deviceId,
				resolve,
				reject,
				timeout: timer,
			});

			// 发送命令
			ws.send(
				JSON.stringify({
					type: "execute_command",
					requestId,
					command,
				}),
			);
		});
	}

	/**
	 * 终止正在执行的命令
	 */
	killCommand(deviceId: string, requestId: string): void {
		const ws = this.deviceConnections.get(deviceId);
		if (!ws) return;

		ws.send(
			JSON.stringify({
				type: "kill_command",
				requestId,
			}),
		);
	}

	/**
	 * Tab 补全
	 */
	async tabComplete(
		deviceId: string,
		line: string,
		cursorPos: number,
	): Promise<{ matches: string[]; wordStart: number }> {
		const device = this.devices.get(deviceId);
		if (!device) throw new Error("Device not found");

		const ws = this.deviceConnections.get(deviceId);
		if (!ws || device.status !== "online") throw new Error("Device not online");

		const requestId = nanoid();

		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pendingCompletions.delete(requestId);
				resolve({ matches: [], wordStart: 0 });
			}, 3000);

			this.pendingCompletions.set(requestId, {
				deviceId,
				resolve,
				reject,
				timeout: timer,
			});

			ws.send(
				JSON.stringify({
					type: "tab_complete",
					requestId,
					line,
					cursorPos,
				}),
			);
		});
	}

	/**
	 * 处理 Tab 补全结果
	 */
	private handleTabCompleteResult(
		message: WSTabCompleteResultMessage,
	): void {
		const { requestId, matches, wordStart } = message;
		const pending = this.pendingCompletions.get(requestId);
		if (pending) {
			clearTimeout(pending.timeout);
			pending.resolve({ matches, wordStart });
			this.pendingCompletions.delete(requestId);
		}
	}

	/**
	 * 获取设备当前工作目录
	 */
	async getCwd(deviceId: string): Promise<string> {
		const device = this.devices.get(deviceId);
		if (!device) throw new Error("Device not found");

		const ws = this.deviceConnections.get(deviceId);
		if (!ws || device.status !== "online") throw new Error("Device not online");

		const requestId = nanoid();

		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pendingCwdRequests.delete(requestId);
				resolve("~");
			}, 3000);

			this.pendingCwdRequests.set(requestId, {
				deviceId,
				resolve,
				reject,
				timeout: timer,
			});

			ws.send(JSON.stringify({ type: "get_cwd", requestId }));
		});
	}

	/**
	 * 处理 get_cwd 结果
	 */
	private handleGetCwdResult(message: WSGetCwdResultMessage): void {
		const { requestId, cwd } = message;
		const pending = this.pendingCwdRequests.get(requestId);
		if (pending) {
			clearTimeout(pending.timeout);
			pending.resolve(cwd);
			this.pendingCwdRequests.delete(requestId);
		}
	}

	/**
	 * 注册设备(生成 Token)
	 */
	registerDevice(
		device: Omit<RemoteDevice, "authentication" | "status" | "createdAt">,
	): RemoteDevice {
		const newDevice: RemoteDevice = {
			...device,
			authentication: {
				token: this.generateSecureToken(),
			},
			status: "offline",
			createdAt: Date.now(),
		};

		this.devices.set(newDevice.id, newDevice);
		console.log(
			`[RemoteDevice] Device registered: ${newDevice.name} (${newDevice.id})`,
		);

		return newDevice;
	}

	/**
	 * 删除设备
	 */
	removeDevice(deviceId: string): boolean {
		const device = this.devices.get(deviceId);
		if (!device) {
			return false;
		}

		// 如果设备在线,断开连接
		const ws = this.deviceConnections.get(deviceId);
		if (ws) {
			ws.close();
			this.deviceConnections.delete(deviceId);
		}

		this.devices.delete(deviceId);
		console.log(`[RemoteDevice] Device removed: ${device.name} (${deviceId})`);

		return true;
	}

	/**
	 * 列出所有设备
	 */
	listDevices(): RemoteDevice[] {
		return Array.from(this.devices.values());
	}

	/**
	 * 获取设备
	 */
	getDevice(deviceId: string): RemoteDevice | undefined {
		return this.devices.get(deviceId);
	}

	/**
	 * 加载设备列表(从持久化存储恢复)
	 */
	loadDevices(devices: RemoteDevice[]): void {
		for (const device of devices) {
			this.devices.set(device.id, { ...device, status: "offline" });
		}
		console.log(`[RemoteDevice] Loaded ${devices.length} devices from storage`);
	}

	/**
	 * 查找设备的 WebSocket 连接
	 */
	private findDeviceByConnection(ws: WebSocket): string | undefined {
		for (const [deviceId, connection] of this.deviceConnections.entries()) {
			if (connection === ws) {
				return deviceId;
			}
		}
		return undefined;
	}

	/**
	 * 生成安全 Token
	 */
	private generateSecureToken(): string {
		return crypto.randomBytes(32).toString("hex");
	}
}

// 单例导出
export const remoteDeviceService = new RemoteDeviceService();
