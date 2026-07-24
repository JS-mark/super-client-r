import TelegramBotAPI from "node-telegram-bot-api";
import { logger } from "../../../utils/logger";
import { BaseBot } from "./BaseBot";
import type { IMBotConfig, IMMessage } from "../types";

const log = logger.withContext("TelegramBot");

/**
 * Telegram 机器人实现
 *
 * 使用轮询模式接收消息
 */
export class TelegramBot extends BaseBot {
	private bot: TelegramBotAPI | null = null;

	constructor(config: IMBotConfig) {
		super(config);
	}

	async start(): Promise<void> {
		const { botToken } = this.config.telegram!;

		if (!botToken) {
			throw new Error("Telegram botToken is required");
		}

		this.bot = new TelegramBotAPI(botToken, { polling: true });

		// 监听文本消息
		this.bot.on("message", (msg) => {
			if (!msg.text) return;

			const message: IMMessage = {
				id: msg.message_id.toString(),
				type: "text",
				platform: "telegram",
				content: msg.text,
				sender: {
					id: msg.from!.id.toString(),
					name: msg.from!.username || msg.from!.first_name,
				},
				chatId: msg.chat.id.toString(),
				timestamp: msg.date * 1000,
			};

			this.emit("message", message);
		});

		// 监听错误
		this.bot.on("polling_error", (error) => {
			log.error(
				"Polling error",
				error instanceof Error ? error : new Error(String(error)),
			);
		});

		log.info(`Started: ${this.config.name}`);
	}

	async stop(): Promise<void> {
		if (this.bot) {
			await this.bot.stopPolling();
			this.bot = null;
			log.info(`Stopped: ${this.config.name}`);
		}
	}

	async sendMessage(chatId: string, content: string): Promise<void> {
		if (!this.bot) {
			throw new Error("Bot not started");
		}

		try {
			await this.bot.sendMessage(chatId, content, {
				parse_mode: "Markdown",
			});
		} catch (error) {
			log.error(
				"Failed to send message",
				error instanceof Error ? error : new Error(String(error)),
			);
			throw error;
		}
	}

	async broadcast(message: string): Promise<void> {
		const chatId = this.config.telegram?.chatId;
		if (!chatId) {
			log.warn("No chatId configured for broadcast");
			return;
		}

		await this.sendMessage(chatId, message);
	}
}
