import { BrowserWindow } from "electron";
import os from "os";
import { nanoid } from "nanoid";
import type { RemoteDeviceService } from "./RemoteDeviceService";
import type { IMBotService } from "../imbot/IMBotService";
import type { StoreManager } from "../../store/StoreManager";
import type {
	RemoteControlEvent,
	RemoteControlEventType,
	RemoteControlEventDirection,
	RemoteControlEventSourceKind,
	DeviceConnectionInfo,
	RemoteDevice,
	CommandResult,
} from "./types";

const CHANNEL_NEW_EVENT = "remote-control:new-event";

/**
 * 远程控制事件枢纽
 *
 * 监听 IMBotService + RemoteDeviceService 事件，
 * 统一记录到 StoreManager 并广播到渲染进程。
 */
export class RemoteControlEventService {
	private wsPort: number;

	constructor(
		private imbotService: IMBotService,
		private remoteDeviceService: RemoteDeviceService,
		private storeManager: StoreManager,
		wsPort: number,
	) {
		this.wsPort = wsPort;
		this.setupListeners();
	}

	private setupListeners(): void {
		// ── 设备事件 ──
		this.remoteDeviceService.on("device-online", (device: RemoteDevice) => {
			this.recordEvent({
				type: "device_online",
				direction: "system",
				sourceKind: "device",
				sourceId: device.id,
				sourceName: device.name,
				content: `设备上线: ${device.name} (${device.ipAddress || "未知 IP"})`,
			});
		});

		this.remoteDeviceService.on("device-offline", (device: RemoteDevice) => {
			this.recordEvent({
				type: "device_offline",
				direction: "system",
				sourceKind: "device",
				sourceId: device.id,
				sourceName: device.name,
				content: `设备离线: ${device.name}`,
			});
		});

		// ── IM Bot 事件 ──
		this.imbotService.on(
			"message-received",
			(data: { botId: string; botName: string; content: string }) => {
				this.recordEvent({
					type: "im_message_received",
					direction: "incoming",
					sourceKind: "bot",
					sourceId: data.botId,
					sourceName: data.botName,
					content: data.content,
				});
			},
		);

		this.imbotService.on(
			"message-sent",
			(data: { botId: string; botName: string; content: string }) => {
				this.recordEvent({
					type: "im_message_sent",
					direction: "outgoing",
					sourceKind: "bot",
					sourceId: data.botId,
					sourceName: data.botName,
					content: data.content,
				});
			},
		);

		this.imbotService.on(
			"command-sent",
			(data: { deviceId: string; deviceName: string; command: string }) => {
				this.recordEvent({
					type: "device_command_sent",
					direction: "outgoing",
					sourceKind: "device",
					sourceId: data.deviceId,
					sourceName: data.deviceName,
					content: data.command,
				});
			},
		);

		this.imbotService.on(
			"command-result",
			(data: {
				deviceId: string;
				deviceName: string;
				result: CommandResult;
			}) => {
				const output =
					data.result.exitCode === 0
						? data.result.stdout || "(无输出)"
						: data.result.stderr || "(无错误信息)";
				this.recordEvent({
					type: "device_command_result",
					direction: "incoming",
					sourceKind: "device",
					sourceId: data.deviceId,
					sourceName: data.deviceName,
					content: `[exit ${data.result.exitCode}] ${output}`,
				});
			},
		);
	}

	private recordEvent(params: {
		type: RemoteControlEventType;
		direction: RemoteControlEventDirection;
		sourceKind: RemoteControlEventSourceKind;
		sourceId: string;
		sourceName: string;
		content: string;
	}): void {
		const event: RemoteControlEvent = {
			id: nanoid(),
			type: params.type,
			direction: params.direction,
			source: {
				kind: params.sourceKind,
				id: params.sourceId,
				name: params.sourceName,
			},
			content: params.content,
			timestamp: Date.now(),
		};

		// 持久化
		this.storeManager.appendRemoteControlEvent(event);

		// 广播到所有窗口
		for (const win of BrowserWindow.getAllWindows()) {
			if (!win.isDestroyed()) {
				win.webContents.send(CHANNEL_NEW_EVENT, event);
			}
		}
	}

	/**
	 * 获取所有持久化事件
	 */
	getEvents(): RemoteControlEvent[] {
		return this.storeManager.getRemoteControlEvents();
	}

	/**
	 * 清空事件
	 */
	clearEvents(): void {
		this.storeManager.clearRemoteControlEvents();
	}

	/**
	 * 获取设备连接信息（本机 IP + WS 端口）
	 */
	getConnectionInfo(): DeviceConnectionInfo {
		const interfaces = os.networkInterfaces();
		const localIPs: string[] = [];

		for (const addrs of Object.values(interfaces)) {
			if (!addrs) continue;
			for (const addr of addrs) {
				if (addr.family === "IPv4" && !addr.internal) {
					localIPs.push(addr.address);
				}
			}
		}

		return {
			wsPort: this.wsPort,
			localIPs,
		};
	}
}
