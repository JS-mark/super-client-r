import * as lark from "@larksuiteoapi/node-sdk";
import { BaseBot } from "./BaseBot";
import type { IMBotConfig, IMMessage } from "../types";

/**
 * 飞书机器人实现
 *
 * 使用 @larksuiteoapi/node-sdk 的 WSClient WebSocket 长连接模式接收消息
 * 通过 REST API 发送消息
 */
export class LarkBot extends BaseBot {
	private client: lark.Client | null = null;
	private wsClient: lark.WSClient | null = null;

	constructor(config: IMBotConfig) {
		super(config);
	}

	async start(): Promise<void> {
		const { appId, appSecret } = this.config.lark!;

		if (!appId || !appSecret) {
			throw new Error("Lark appId and appSecret are required");
		}

		// 创建 REST API 客户端
		this.client = new lark.Client({
			appId,
			appSecret,
			domain: lark.Domain.Feishu,
		});

		// 创建事件分发器并注册消息接收事件
		const eventDispatcher = new lark.EventDispatcher({
			verificationToken: this.config.lark?.verificationToken || "",
			encryptKey: this.config.lark?.encryptKey || "",
		}).register({
			"im.message.receive_v1": (data) => {
				try {
					const message = this.convertMessage(data);
					if (message) {
						this.emit("message", message);
					}
				} catch (error) {
					console.error("[LarkBot] Failed to process message:", error);
				}
			},
		});

		// 创建 WebSocket 客户端并启动
		this.wsClient = new lark.WSClient({
			appId,
			appSecret,
			domain: lark.Domain.Feishu,
		});

		await this.wsClient.start({ eventDispatcher });
		console.log(`[LarkBot] Started: ${this.config.name}`);
	}

	async stop(): Promise<void> {
		if (this.wsClient) {
			this.wsClient.close();
			this.wsClient = null;
		}
		this.client = null;
		console.log(`[LarkBot] Stopped: ${this.config.name}`);
	}

	async sendMessage(chatId: string, content: string): Promise<void> {
		if (!this.client) {
			throw new Error("Bot not started");
		}

		try {
			await this.client.im.message.create({
				data: {
					receive_id: chatId,
					msg_type: "text",
					content: JSON.stringify({ text: content }),
				},
				params: {
					receive_id_type: "chat_id",
				},
			});
		} catch (error) {
			console.error("[LarkBot] Failed to send message:", error);
			throw error;
		}
	}

	async broadcast(message: string): Promise<void> {
		const chatIds = this.config.lark?.chatIds;
		if (!chatIds || chatIds.length === 0) {
			console.warn("[LarkBot] No chatIds configured for broadcast");
			return;
		}

		for (const chatId of chatIds) {
			try {
				await this.sendMessage(chatId, message);
			} catch (error) {
				console.error(`[LarkBot] Failed to broadcast to ${chatId}:`, error);
			}
		}
	}

	/**
	 * 将飞书消息格式转为 IMMessage
	 */
	private convertMessage(data: any): IMMessage | null {
		const msg = data.message;
		if (!msg) return null;

		// 只处理文本消息
		if (msg.message_type !== "text") return null;

		let content = "";
		try {
			const parsed = JSON.parse(msg.content);
			content = parsed.text || "";
		} catch {
			content = msg.content || "";
		}

		// 去除 @mention 标记（如 @_user_1 等）
		content = content.replace(/@_user_\d+/g, "").trim();

		const sender = data.sender;
		const senderId =
			sender?.sender_id?.open_id || sender?.sender_id?.user_id || "";

		return {
			id: msg.message_id,
			type: "text",
			platform: "lark",
			content,
			sender: {
				id: senderId,
				name: "",
			},
			chatId: msg.chat_id,
			timestamp: parseInt(msg.create_time, 10) || Date.now(),
		};
	}
}
