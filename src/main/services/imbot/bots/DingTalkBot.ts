import { DWClient, TOPIC_ROBOT } from "dingtalk-stream";
import type { DWClientDownStream } from "dingtalk-stream";
import axios from "axios";
import { BaseBot } from "./BaseBot";
import type { IMBotConfig, IMMessage } from "../types";

const DINGTALK_TOKEN_URL = "https://oapi.dingtalk.com/gettoken";
const DINGTALK_SEND_URL =
	"https://api.dingtalk.com/v1.0/robot/groupMessages/send";

/**
 * 钉钉机器人实现
 *
 * 使用 dingtalk-stream SDK 的 WebSocket 长连接模式接收消息
 * 通过 OpenAPI 发送群消息，通过 Webhook 发送广播
 */
export class DingTalkBot extends BaseBot {
	private client: DWClient | null = null;
	private accessToken: string = "";
	private tokenExpiresAt: number = 0;

	constructor(config: IMBotConfig) {
		super(config);
	}

	async start(): Promise<void> {
		const { appKey, appSecret } = this.config.dingtalk!;

		if (!appKey || !appSecret) {
			throw new Error("DingTalk appKey and appSecret are required");
		}

		this.client = new DWClient({
			clientId: appKey,
			clientSecret: appSecret,
		});

		this.client.registerCallbackListener(
			TOPIC_ROBOT,
			(msg: DWClientDownStream) => {
				try {
					const data = JSON.parse(msg.data);
					const message = this.convertMessage(data);
					this.emit("message", message);
				} catch (error) {
					console.error("[DingTalkBot] Failed to parse message:", error);
				}

				// 确认消息已收到，避免服务端重试
				this.client?.socketCallBackResponse(msg.headers.messageId, {
					status: "SUCCESS",
				});
			},
		);

		await this.client.connect();
		console.log(`[DingTalkBot] Started: ${this.config.name}`);
	}

	async stop(): Promise<void> {
		if (this.client) {
			this.client.disconnect();
			this.client = null;
			console.log(`[DingTalkBot] Stopped: ${this.config.name}`);
		}
	}

	async sendMessage(chatId: string, content: string): Promise<void> {
		const token = await this.getAccessToken();

		try {
			await axios.post(
				DINGTALK_SEND_URL,
				{
					msgParam: JSON.stringify({ content }),
					msgKey: "sampleText",
					openConversationId: chatId,
					robotCode: this.config.dingtalk!.appKey,
				},
				{
					headers: {
						"x-acs-dingtalk-access-token": token,
						"Content-Type": "application/json",
					},
				},
			);
		} catch (error) {
			console.error("[DingTalkBot] Failed to send message:", error);
			throw error;
		}
	}

	async broadcast(message: string): Promise<void> {
		const { webhookUrl } = this.config.dingtalk || {};
		if (!webhookUrl) {
			console.warn("[DingTalkBot] No webhookUrl configured for broadcast");
			return;
		}

		try {
			await axios.post(webhookUrl, {
				msgtype: "text",
				text: { content: message },
			});
		} catch (error) {
			console.error("[DingTalkBot] Failed to broadcast:", error);
			throw error;
		}
	}

	/**
	 * 获取 access token（带缓存，提前 5 分钟刷新）
	 */
	private async getAccessToken(): Promise<string> {
		const now = Date.now();
		if (this.accessToken && this.tokenExpiresAt > now + 5 * 60 * 1000) {
			return this.accessToken;
		}

		const { appKey, appSecret } = this.config.dingtalk!;

		const response = await axios.get(DINGTALK_TOKEN_URL, {
			params: { appkey: appKey, appsecret: appSecret },
		});

		if (response.data.errcode !== 0) {
			throw new Error(
				`Failed to get DingTalk access token: ${response.data.errmsg}`,
			);
		}

		this.accessToken = response.data.access_token;
		this.tokenExpiresAt = now + response.data.expires_in * 1000;

		return this.accessToken;
	}

	/**
	 * 将钉钉消息格式转为 IMMessage
	 */
	private convertMessage(data: any): IMMessage {
		const content =
			data.msgtype === "text"
				? data.text?.content?.trim() || ""
				: data.content || "";

		return {
			id: data.msgId || String(Date.now()),
			type: "text",
			platform: "dingtalk",
			content,
			sender: {
				id: data.senderStaffId || data.senderId || "",
				name: data.senderNick || "",
			},
			chatId: data.conversationId || "",
			timestamp: data.createAt || Date.now(),
		};
	}
}
