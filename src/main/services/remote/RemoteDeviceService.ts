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
	RemoteDeviceMode,
	RelayConfig,
} from "./types";

/**
 * 远程设备管理服务
 *
 * 支持双模式:
 * - local: WebSocket 服务器直连（局域网）
 * - relay: 通过公网中继服务器连接
 */
export class RemoteDeviceService extends EventEmitter {
	// Local 模式
	private wss: WebSocketServer | null = null;
	// Relay 模式
	private relayWs: WebSocket | null = null;
	private relayReconnectTimer: NodeJS.Timeout | null = null;

	// 当前模式
	private mode: RemoteDeviceMode = "local";
	private relayConfig: RelayConfig | null = null;

	// 通用
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

	/** 获取当前模式 */
	getMode(): RemoteDeviceMode {
		return this.mode;
	}

	/** 获取当前 relay 配置 */
	getRelayConfig(): RelayConfig | null {
		return this.relayConfig;
	}

	// ============ Local 模式 ============

	/**
	 * 启动 WebSocket 服务器 (local 模式)
	 */
	async start(port = 8088): Promise<void> {
		if (this.wss) {
			throw new Error("RemoteDeviceService already started");
		}

		this.mode = "local";
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
	 * 停止 WebSocket 服务器 (local 模式)
	 */
	async stop(): Promise<void> {
		if (this.wss) {
			this.wss.close();
			this.wss = null;

			// 清理所有连接
			for (const [, ws] of this.deviceConnections.entries()) {
				ws.close();
			}
			this.deviceConnections.clear();

			console.log("[RemoteDevice] WebSocket server stopped");
		}
	}

	// ============ Relay 模式 ============

	/**
	 * 启动 relay 模式
	 */
	async startRelay(relayUrl: string, relayKey: string): Promise<void> {
		this.mode = "relay";
		this.relayConfig = { mode: "relay", relayUrl, relayKey };
		this.connectToRelay();
	}

	/**
	 * 连接到 relay 服务器
	 */
	private connectToRelay(): void {
		if (!this.relayConfig?.relayUrl || !this.relayConfig?.relayKey) return;

		const { relayUrl, relayKey } = this.relayConfig;
		console.log(`[RemoteDevice] Connecting to relay: ${relayUrl}`);

		try {
			this.relayWs = new WebSocket(relayUrl);
		} catch (error) {
			console.error("[RemoteDevice] Failed to create relay WebSocket:", error);
			this.scheduleRelayReconnect();
			return;
		}

		this.relayWs.on("open", () => {
			console.log("[RemoteDevice] Connected to relay, sending auth...");
			this.relayWs!.send(
				JSON.stringify({
					type: "relay_auth",
					role: "controller",
					relayKey,
				}),
			);
		});

		this.relayWs.on("message", (data: Buffer) => {
			try {
				const message: WSMessage = JSON.parse(data.toString());
				this.handleRelayMessage(message);
			} catch (error) {
				console.error("[RemoteDevice] Failed to parse relay message:", error);
			}
		});

		this.relayWs.on("close", () => {
			console.log("[RemoteDevice] Relay connection closed");
			this.relayWs = null;
			if (this.mode === "relay") {
				this.scheduleRelayReconnect();
			}
		});

		this.relayWs.on("error", (error) => {
			console.error("[RemoteDevice] Relay WebSocket error:", error);
		});
	}

	/**
	 * 处理 relay 消息
	 */
	private handleRelayMessage(message: WSMessage): void {
		switch (message.type) {
			case "relay_auth_ack":
				if (message.success) {
					console.log("[RemoteDevice] Relay auth successful (controller)");
				} else {
					console.error("[RemoteDevice] Relay auth failed:", message.error);
				}
				break;
			case "relay_device_disconnected":
				if (message.deviceId) {
					console.log(
						`[RemoteDevice] Relay: device disconnected: ${message.deviceId}`,
					);
					this.handleDeviceDisconnect(message.deviceId as string);
				}
				break;
			default:
				// 来自 device 的消息，按正常逻辑处理
				this.handleDeviceMessage(null, message);
				break;
		}
	}

	/**
	 * 停止 relay 连接
	 */
	async stopRelay(): Promise<void> {
		if (this.relayReconnectTimer) {
			clearTimeout(this.relayReconnectTimer);
			this.relayReconnectTimer = null;
		}
		if (this.relayWs) {
			this.relayWs.close();
			this.relayWs = null;
		}
		this.relayConfig = null;
		console.log("[RemoteDevice] Relay connection stopped");
	}

	/**
	 * 5s 自动重连 relay
	 */
	private scheduleRelayReconnect(): void {
		if (this.relayReconnectTimer) return;
		console.log("[RemoteDevice] Scheduling relay reconnect in 5s...");
		this.relayReconnectTimer = setTimeout(() => {
			this.relayReconnectTimer = null;
			if (this.mode === "relay") {
				this.connectToRelay();
			}
		}, 5000);
	}

	/**
	 * 切换模式
	 */
	async switchMode(config: RelayConfig): Promise<void> {
		// 停止当前模式
		await this.stop();
		await this.stopRelay();

		// 将所有在线设备标记为离线
		for (const [, device] of this.devices) {
			if (device.status === "online") {
				device.status = "offline";
				this.emit("device-offline", device);
			}
		}
		this.deviceConnections.clear();

		// 启动新模式
		if (config.mode === "relay" && config.relayUrl && config.relayKey) {
			await this.startRelay(config.relayUrl, config.relayKey);
		} else {
			await this.start(8088);
		}
	}

	// ============ 统一发送 ============

	/**
	 * 向设备发送消息（自动适配 local/relay 模式）
	 */
	private sendToDevice(
		deviceId: string,
		message: Record<string, unknown>,
	): void {
		if (this.mode === "relay") {
			// relay 模式：注入 deviceId，通过 relayWs 发送
			if (
				this.relayWs &&
				this.relayWs.readyState === WebSocket.OPEN
			) {
				this.relayWs.send(
					JSON.stringify({ ...message, deviceId }),
				);
			}
		} else {
			// local 模式：通过 deviceConnections 直连发送
			const ws = this.deviceConnections.get(deviceId);
			if (ws) {
				ws.send(JSON.stringify(message));
			}
		}
	}

	// ============ 消息处理 ============

	/**
	 * 处理设备消息
	 * ws 参数在 relay 模式下为 null
	 */
	private handleDeviceMessage(ws: WebSocket | null, message: WSMessage): void {
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
		ws: WebSocket | null,
		message: WSRegisterMessage,
	): void {
		const { deviceId, token, platform, ipAddress } = message;

		// 验证 Token
		const device = this.devices.get(deviceId);
		if (!device || device.authentication.token !== token) {
			console.warn(`[RemoteDevice] Invalid token for device: ${deviceId}`);
			if (this.mode === "relay") {
				this.sendToDevice(deviceId, {
					type: "register_ack",
					success: false,
					error: "Invalid token",
				});
			} else if (ws) {
				ws.send(
					JSON.stringify({
						type: "register_ack",
						success: false,
						error: "Invalid token",
					}),
				);
				ws.close(4001, "Invalid token");
			}
			return;
		}

		// 更新设备状态
		device.status = "online";
		device.lastSeen = Date.now();
		device.platform = platform;
		if (ipAddress) {
			device.ipAddress = ipAddress;
		}

		if (this.mode === "local" && ws) {
			this.deviceConnections.set(deviceId, ws);
		}
		this.devices.set(deviceId, device);

		// 响应注册成功
		if (this.mode === "relay") {
			this.sendToDevice(deviceId, {
				type: "register_ack",
				success: true,
			});
		} else if (ws) {
			ws.send(
				JSON.stringify({
					type: "register_ack",
					success: true,
				}),
			);
		}

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

	// ============ 命令操作 ============

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

		if (device.status !== "online") {
			throw new Error("Device not online");
		}

		// relay 模式下检查 relayWs
		if (this.mode === "relay") {
			if (!this.relayWs || this.relayWs.readyState !== WebSocket.OPEN) {
				throw new Error("Relay connection not available");
			}
		} else {
			const ws = this.deviceConnections.get(deviceId);
			if (!ws) {
				throw new Error("Device not online");
			}
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
			this.sendToDevice(deviceId, {
				type: "execute_command",
				requestId,
				command,
			});
		});
	}

	/**
	 * 终止正在执行的命令
	 */
	killCommand(deviceId: string, requestId: string): void {
		this.sendToDevice(deviceId, {
			type: "kill_command",
			requestId,
		});
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
		if (device.status !== "online") throw new Error("Device not online");

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

			this.sendToDevice(deviceId, {
				type: "tab_complete",
				requestId,
				line,
				cursorPos,
			});
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
		if (device.status !== "online") throw new Error("Device not online");

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

			this.sendToDevice(deviceId, { type: "get_cwd", requestId });
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

	// ============ 设备管理 ============

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
