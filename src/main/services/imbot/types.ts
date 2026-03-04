/**
 * IM 机器人类型定义
 */

/** IM 平台类型 */
export type IMPlatform = "dingtalk" | "lark" | "telegram";

/** IM 机器人配置 */
export interface IMBotConfig {
	id: string;
	type: IMPlatform;
	name: string;
	enabled: boolean;

	// 钉钉配置
	dingtalk?: {
		appKey: string;
		appSecret: string;
		webhookUrl?: string;
	};

	// 飞书配置
	lark?: {
		appId: string;
		appSecret: string;
		verificationToken?: string;
		encryptKey?: string;
		chatIds?: string[]; // 广播目标群组 ID
	};

	// Telegram 配置
	telegram?: {
		botToken: string;
		chatId?: string; // 默认聊天 ID（用于广播）
	};

	// 权限配置
	allowedUsers?: string[]; // 允许的用户 ID
	allowedGroups?: string[]; // 允许的群组 ID
	adminUsers?: string[]; // 管理员用户 ID
}

/** IM 消息类型 */
export type IMMessageType = "text" | "image" | "file" | "card";

/** IM 消息 */
export interface IMMessage {
	id: string;
	type: IMMessageType;
	platform: IMPlatform;
	content: string;
	sender: {
		id: string;
		name: string;
	};
	chatId: string; // 会话 ID
	timestamp: number;
}

/** IM 命令 */
export interface IMCommand {
	command: string; // 命令名(如 "device", "exec")
	args: string[]; // 参数
	subcommand?: string; // 子命令(如 "list", "status")
	message: IMMessage; // 原始消息
}

/** 命令处理上下文 */
export interface CommandContext {
	bot: any; // BaseBot 实例
	remoteDeviceService: any; // RemoteDeviceService 实例
}

/** 命令处理函数 */
export type CommandHandler = (
	command: IMCommand,
	context: CommandContext,
) => Promise<string>;

/** 机器人状态 */
export interface BotStatus {
	id: string;
	name: string;
	type: IMPlatform;
	status: "running" | "stopped" | "error";
	lastError?: string;
	startedAt?: number;
}
