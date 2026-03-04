import { EventEmitter } from "events";
import { BaseBot } from "./bots/BaseBot";
import { TelegramBot } from "./bots/TelegramBot";
import { DingTalkBot } from "./bots/DingTalkBot";
import { LarkBot } from "./bots/LarkBot";
import { CommandRegistry } from "./CommandRegistry";
import type { RemoteDeviceService } from "../remote/RemoteDeviceService";
import type { RemoteDevice } from "../remote/types";
import type { IMBotConfig, IMMessage, IMCommand, BotStatus } from "./types";

/**
 * IM 机器人管理服务
 *
 * 功能:
 * - 管理多个机器人实例
 * - 消息处理和命令解析
 * - 权限检查
 * - 内置命令
 * - 设备事件转发到 IM
 */
export class IMBotService extends EventEmitter {
	private bots: Map<string, BaseBot> = new Map();
	private commandRegistry: CommandRegistry;
	private remoteDeviceService: RemoteDeviceService;
	private botConfigs: Map<string, IMBotConfig> = new Map();

	constructor(remoteDeviceService: RemoteDeviceService) {
		super();
		this.remoteDeviceService = remoteDeviceService;
		this.commandRegistry = new CommandRegistry();

		this.registerCommands();
		this.setupDeviceEventForwarding();
	}

	/**
	 * 启动机器人
	 */
	async startBot(config: IMBotConfig): Promise<void> {
		// 检查是否已经启动
		if (this.bots.has(config.id)) {
			throw new Error(`Bot ${config.id} is already running`);
		}

		let bot: BaseBot;

		// 根据类型创建机器人实例
		switch (config.type) {
			case "telegram":
				bot = new TelegramBot(config);
				break;
			case "dingtalk":
				bot = new DingTalkBot(config);
				break;
			case "lark":
				bot = new LarkBot(config);
				break;
			default:
				throw new Error(`Unknown bot type: ${config.type}`);
		}

		// 监听消息
		bot.on("message", (message: IMMessage) => {
			this.handleMessage(config.id, message);
		});

		// 启动机器人
		await bot.start();
		this.bots.set(config.id, bot);
		this.botConfigs.set(config.id, config);

		console.log(`[IMBot] Started: ${config.name} (${config.type})`);
	}

	/**
	 * 停止机器人
	 */
	async stopBot(botId: string): Promise<void> {
		const bot = this.bots.get(botId);
		if (!bot) {
			throw new Error(`Bot ${botId} not found`);
		}

		await bot.stop();
		this.bots.delete(botId);
		this.botConfigs.delete(botId);

		console.log(`[IMBot] Stopped: ${botId}`);
	}

	/**
	 * 获取机器人状态列表
	 */
	getBotStatuses(): BotStatus[] {
		const statuses: BotStatus[] = [];

		for (const [id, bot] of this.bots.entries()) {
			const config = bot.getConfig();
			statuses.push({
				id,
				name: config.name,
				type: config.type,
				status: "running",
			});
		}

		return statuses;
	}

	/**
	 * 获取机器人配置
	 */
	getBotConfig(botId: string): IMBotConfig | undefined {
		return this.botConfigs.get(botId);
	}

	/**
	 * 处理 IM 消息
	 */
	private async handleMessage(
		botId: string,
		message: IMMessage,
	): Promise<void> {
		const bot = this.bots.get(botId);
		if (!bot) return;

		const config = bot.getConfig();

		// 记录收到的消息
		this.emit("message-received", {
			botId,
			botName: config.name,
			content: message.content,
		});

		// Emit raw message for RemoteChatBridge (before command parsing)
		this.emit("raw-message", botId, message);

		// 解析命令
		const command = this.parseCommand(message);
		if (!command) {
			// 不是命令,忽略
			return;
		}

		// 权限检查
		if (!this.checkPermission(config, message.sender.id, command)) {
			const reply = "❌ 权限不足";
			await bot.sendMessage(message.chatId, reply);
			this.emit("message-sent", {
				botId,
				botName: config.name,
				content: reply,
			});
			return;
		}

		// 执行命令
		try {
			const result = await this.commandRegistry.execute(command, {
				bot,
				remoteDeviceService: this.remoteDeviceService,
			});

			await bot.sendMessage(message.chatId, result);
			this.emit("message-sent", {
				botId,
				botName: config.name,
				content: result,
			});
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			const reply = `❌ 执行失败: ${errorMessage}`;
			await bot.sendMessage(message.chatId, reply);
			this.emit("message-sent", {
				botId,
				botName: config.name,
				content: reply,
			});
		}
	}

	/**
	 * 解析命令
	 */
	private parseCommand(message: IMMessage): IMCommand | null {
		const text = message.content.trim();

		// 命令格式: /command subcommand arg1 arg2
		if (!text.startsWith("/")) {
			return null;
		}

		const parts = text.slice(1).split(/\s+/);
		const [command, subcommand, ...args] = parts;

		return {
			command,
			subcommand: subcommand || undefined,
			args,
			message,
		};
	}

	/**
	 * 权限检查
	 */
	private checkPermission(
		config: IMBotConfig,
		userId: string,
		command: IMCommand,
	): boolean {
		// 管理员命令列表
		const adminCommands = ["device"];

		// 如果是管理员命令,检查是否是管理员
		if (adminCommands.includes(command.command)) {
			if (!config.adminUsers || !config.adminUsers.includes(userId)) {
				return false;
			}
		}

		// 检查用户是否在白名单(如果配置了白名单)
		if (config.allowedUsers && config.allowedUsers.length > 0) {
			return config.allowedUsers.includes(userId);
		}

		return true; // 默认允许
	}

	/**
	 * 注册内置命令
	 */
	private registerCommands(): void {
		// /help - 帮助信息
		this.commandRegistry.register("help", null, async () => {
			return [
				"🤖 *命令列表*",
				"",
				"*设备管理:*",
				"/device list - 列出所有设备",
				"/device status <deviceId> - 查询设备状态",
				"",
				"*命令执行:*",
				"/exec <deviceId> <command> - 执行命令",
				"",
				"*其他:*",
				"/help - 查看帮助",
			].join("\n");
		});

		// /device list - 列出所有设备
		this.commandRegistry.register("device", "list", async () => {
			const devices = this.remoteDeviceService.listDevices();

			if (devices.length === 0) {
				return "📱 暂无设备";
			}

			const lines = devices.map((device) => {
				const status = device.status === "online" ? "🟢" : "🔴";
				const lastSeen = device.lastSeen
					? new Date(device.lastSeen).toLocaleString("zh-CN")
					: "从未连接";
				return `${status} *${device.name}* (${device.id})\n  平台: ${device.platform} | 最后在线: ${lastSeen}`;
			});

			return `📱 *设备列表* (${devices.length})\n\n${lines.join("\n\n")}`;
		});

		// /device status <deviceId> - 查询设备状态
		this.commandRegistry.register("device", "status", async (cmd) => {
			const deviceId = cmd.args[0];
			if (!deviceId) {
				return "❌ 请提供设备 ID\n用法: /device status <deviceId>";
			}

			const device = this.remoteDeviceService.getDevice(deviceId);
			if (!device) {
				return "❌ 设备不存在";
			}

			const status = device.status === "online" ? "🟢 在线" : "🔴 离线";
			const lastSeen = device.lastSeen
				? new Date(device.lastSeen).toLocaleString("zh-CN")
				: "从未连接";

			return [
				`📱 *${device.name}*`,
				`状态: ${status}`,
				`最后在线: ${lastSeen}`,
				`平台: ${device.platform}`,
				`IP: ${device.ipAddress || "未知"}`,
				`标签: ${device.tags?.join(", ") || "无"}`,
			].join("\n");
		});

		// /exec <deviceId> <command> - 执行命令
		this.commandRegistry.register("exec", null, async (cmd, ctx) => {
			const [deviceId, ...commandParts] = cmd.args;
			if (!deviceId || commandParts.length === 0) {
				return "❌ 用法: /exec <deviceId> <command>";
			}

			const command = commandParts.join(" ");
			const device = this.remoteDeviceService.getDevice(deviceId);
			const deviceName = device?.name || deviceId;

			// 发送执行中提示
			await ctx.bot.sendMessage(
				cmd.message.chatId,
				`⏳ 正在执行: \`${command}\``,
			);

			// 记录命令发送事件
			this.emit("command-sent", { deviceId, deviceName, command });

			try {
				const result = await this.remoteDeviceService.executeCommand(
					deviceId,
					command,
				);

				// 记录命令结果事件
				this.emit("command-result", { deviceId, deviceName, result });

				if (result.exitCode === 0) {
					return [
						"✅ *执行成功*",
						`耗时: ${result.duration}ms`,
						"",
						"*输出:*",
						"```",
						result.stdout || "(无输出)",
						"```",
					].join("\n");
				}
				return [
					"❌ *执行失败*",
					`退出码: ${result.exitCode}`,
					`耗时: ${result.duration}ms`,
					"",
					"*错误:*",
					"```",
					result.stderr || "(无错误信息)",
					"```",
				].join("\n");
			} catch (error) {
				return `❌ 执行失败: ${error instanceof Error ? error.message : String(error)}`;
			}
		});

		console.log("[IMBot] Built-in commands registered");
	}

	/**
	 * 设置设备事件转发(设备状态变更 → IM 通知)
	 */
	private setupDeviceEventForwarding(): void {
		this.remoteDeviceService.on("device-online", (device: RemoteDevice) => {
			this.broadcastToAllBots(`🟢 *设备上线*\n${device.name} (${device.id})`);
		});

		this.remoteDeviceService.on("device-offline", (device: RemoteDevice) => {
			this.broadcastToAllBots(`🔴 *设备离线*\n${device.name} (${device.id})`);
		});

		this.remoteDeviceService.on(
			"device-error",
			({ device, error }: { device: RemoteDevice; error: string }) => {
				this.broadcastToAllBots(`⚠️ *设备异常*\n${device.name}\n错误: ${error}`);
			},
		);
	}

	/**
	 * 向所有机器人广播消息
	 */
	private async broadcastToAllBots(message: string): Promise<void> {
		for (const bot of this.bots.values()) {
			try {
				await bot.broadcast(message);
			} catch (error) {
				console.error("[IMBot] Failed to broadcast:", error);
			}
		}
	}

	/**
	 * 加载机器人配置(从持久化存储恢复)
	 */
	async loadBots(configs: IMBotConfig[]): Promise<void> {
		for (const config of configs) {
			if (config.enabled) {
				try {
					await this.startBot(config);
				} catch (error) {
					console.error(`[IMBot] Failed to start bot ${config.name}:`, error);
				}
			}
		}
		console.log(`[IMBot] Loaded ${configs.length} bot configurations`);
	}
}
