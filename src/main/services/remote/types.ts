/**
 * 远程设备类型定义
 */

/** 设备平台 */
export type DevicePlatform = "linux" | "windows" | "macos";

/** 设备状态 */
export type DeviceStatus = "online" | "offline" | "error";

/** 远程设备 */
export interface RemoteDevice {
	id: string;
	name: string;
	platform: DevicePlatform;
	ipAddress?: string;

	// 认证方式
	authentication: {
		token: string; // 设备接入 Token
	};

	// 状态
	status: DeviceStatus;
	lastSeen?: number;

	// 元数据
	tags?: string[];
	description?: string;
	createdAt: number;
}

/** 命令执行请求 */
export interface CommandRequest {
	deviceId: string;
	command: string;
	timeout?: number; // 超时时间(ms)
	requestId: string; // 请求 ID
}

/** 命令执行结果 */
export interface CommandResult {
	requestId: string;
	deviceId: string;
	stdout: string;
	stderr: string;
	exitCode: number;
	duration: number;
	cwd?: string;
}

/** WebSocket 消息类型 */
export type WSMessageType =
	| "register"
	| "register_ack"
	| "heartbeat"
	| "execute_command"
	| "command_result"
	| "command_output_chunk"
	| "kill_command"
	| "tab_complete"
	| "tab_complete_result"
	| "get_cwd"
	| "get_cwd_result";

/** WebSocket 消息基础结构 */
export interface WSMessage {
	type: WSMessageType;
	[key: string]: any;
}

/** 设备注册消息 */
export interface WSRegisterMessage extends WSMessage {
	type: "register";
	deviceId: string;
	token: string;
	platform: DevicePlatform;
	ipAddress?: string;
}

/** 设备注册响应 */
export interface WSRegisterAckMessage extends WSMessage {
	type: "register_ack";
	success: boolean;
	error?: string;
}

/** 心跳消息 */
export interface WSHeartbeatMessage extends WSMessage {
	type: "heartbeat";
	deviceId: string;
}

/** 命令执行消息 */
export interface WSExecuteCommandMessage extends WSMessage {
	type: "execute_command";
	requestId: string;
	command: string;
}

/** 命令输出流式消息 */
export interface WSCommandOutputChunkMessage extends WSMessage {
	type: "command_output_chunk";
	requestId: string;
	deviceId: string;
	stream: "stdout" | "stderr";
	data: string;
}

/** 命令结果消息 */
export interface WSCommandResultMessage extends WSMessage {
	type: "command_result";
	requestId: string;
	deviceId: string;
	stdout: string;
	stderr: string;
	exitCode: number;
	duration: number;
	cwd?: string;
}

/** Tab 补全请求 */
export interface WSTabCompleteMessage extends WSMessage {
	type: "tab_complete";
	requestId: string;
	line: string;
	cursorPos: number;
}

/** Tab 补全结果 */
export interface WSTabCompleteResultMessage extends WSMessage {
	type: "tab_complete_result";
	requestId: string;
	matches: string[];
	wordStart: number;
}

/** 获取 cwd 结果 */
export interface WSGetCwdResultMessage extends WSMessage {
	type: "get_cwd_result";
	requestId: string;
	cwd: string;
}

// ============ Remote Control Event 类型 ============

/** 远程控制事件类型 */
export type RemoteControlEventType =
	| "im_message_received"
	| "im_message_sent"
	| "device_command_sent"
	| "device_command_result"
	| "device_online"
	| "device_offline";

/** 事件方向 */
export type RemoteControlEventDirection = "incoming" | "outgoing" | "system";

/** 事件来源类型 */
export type RemoteControlEventSourceKind = "bot" | "device";

/** 远程控制事件 */
export interface RemoteControlEvent {
	id: string;
	type: RemoteControlEventType;
	direction: RemoteControlEventDirection;
	source: {
		kind: RemoteControlEventSourceKind;
		id: string;
		name: string;
	};
	content: string;
	timestamp: number;
}

/** 设备连接信息 */
export interface DeviceConnectionInfo {
	wsPort: number;
	localIPs: string[];
}
