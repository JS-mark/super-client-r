/**
 * Webhook 通知推送服务
 * 支持钉钉、飞书、自定义 Webhook
 */

import { EventEmitter } from "events";
import { createHmac } from "crypto";
import axios from "axios";
import type {
	WebhookConfig,
	WebhookTestResult,
	WebhookType,
} from "../../ipc/types";
import { storeManager } from "../../store/StoreManager";

interface WebhookMessage {
	title: string;
	content: string;
	timestamp?: number;
}

function buildDingtalkPayload(
	msg: WebhookMessage,
	config: WebhookConfig,
): { url: string; body: unknown } {
	let url = config.url;
	if (config.secret) {
		const timestamp = Date.now();
		const stringToSign = `${timestamp}\n${config.secret}`;
		const sign = createHmac("sha256", config.secret)
			.update(stringToSign)
			.digest("base64");
		url += `&timestamp=${timestamp}&sign=${encodeURIComponent(sign)}`;
	}
	return {
		url,
		body: {
			msgtype: "markdown",
			markdown: {
				title: msg.title,
				text: `### ${msg.title}\n\n${msg.content}`,
			},
		},
	};
}

function buildFeishuPayload(
	msg: WebhookMessage,
	config: WebhookConfig,
): { url: string; body: unknown; headers?: Record<string, string> } {
	const body: Record<string, unknown> = {
		msg_type: "interactive",
		card: {
			header: {
				title: { tag: "plain_text", content: msg.title },
			},
			elements: [
				{
					tag: "markdown",
					content: msg.content,
				},
			],
		},
	};

	if (config.secret) {
		const timestamp = Math.floor(Date.now() / 1000);
		const stringToSign = `${timestamp}\n${config.secret}`;
		const sign = createHmac("sha256", config.secret)
			.update(stringToSign)
			.digest("base64");
		body.timestamp = String(timestamp);
		body.sign = sign;
	}

	return { url: config.url, body };
}

function buildTelegramPayload(
	msg: WebhookMessage,
	config: WebhookConfig,
): { url: string; body: unknown } {
	if (!config.telegramBotToken || !config.telegramChatId) {
		throw new Error(
			"Telegram configuration incomplete: botToken and chatId are required",
		);
	}

	const url = `https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`;

	// 格式化消息内容
	const parseMode = config.telegramParseMode || "Markdown";
	let text = `**${msg.title}**\n\n${msg.content}`;

	if (parseMode === "HTML") {
		text = `<b>${msg.title}</b>\n\n${msg.content}`;
	}

	const body = {
		chat_id: config.telegramChatId,
		text: text,
		parse_mode: parseMode,
	};

	return { url, body };
}

function buildTwitterPayload(
	msg: WebhookMessage,
	config: WebhookConfig,
): { url: string; body: unknown; headers?: Record<string, string> } {
	if (
		!config.twitterApiKey ||
		!config["twitterApi*"] ||
		!config.twitterAccessToken ||
		!config["twitterAccess*"]
	) {
		throw new Error(
			"Twitter configuration incomplete: all OAuth credentials are required",
		);
	}

	// Twitter API v2 - 发送推文
	const url = "https://api.twitter.com/2/tweets";

	// 消息内容（限制 280 字符）
	const content = `${msg.title}\n\n${msg.content}`.slice(0, 280);

	const body = {
		text: content,
	};

	// 构建 OAuth 1.0a 签名
	const OAuth = require("oauth-1.0a");
	const crypto = require("crypto");

	const oauth = OAuth({
		consumer: {
			key: config.twitterApiKey,
			"*": config["twitterApi*"],
		},
		signature_method: "HMAC-SHA1",
		hash_function(base_string: string, key: string) {
			return crypto
				.createHmac("sha1", key)
				.update(base_string)
				.digest("base64");
		},
	});

	const requestData = {
		url: url,
		method: "POST",
	};

	const token = {
		key: config.twitterAccessToken,
		"*": config["twitterAccess*"],
	};

	const authHeader = oauth.toHeader(oauth.authorize(requestData, token));

	return {
		url,
		body,
		headers: {
			...authHeader,
			"Content-Type": "application/json",
		},
	};
}

function buildFacebookPayload(
	msg: WebhookMessage,
	config: WebhookConfig,
): { url: string; body: unknown } {
	if (!config.facebookPageToken || !config.facebookPageId) {
		throw new Error(
			"Facebook configuration incomplete: pageToken and pageId are required",
		);
	}

	// Facebook Graph API - 发布到页面
	const url = `https://graph.facebook.com/v18.0/${config.facebookPageId}/feed`;

	const body = {
		message: `${msg.title}\n\n${msg.content}`,
		access_token: config.facebookPageToken,
	};

	return { url, body };
}

function buildCustomPayload(
	msg: WebhookMessage,
	config: WebhookConfig,
): { url: string; body: unknown; headers?: Record<string, string> } {
	return {
		url: config.url,
		body: {
			title: msg.title,
			content: msg.content,
			timestamp: msg.timestamp || Date.now(),
		},
		headers: config.headers,
	};
}

export class WebhookService extends EventEmitter {
	async send(message: WebhookMessage, configId?: string): Promise<void> {
		const configs = storeManager.getWebhookConfigs();
		const targets = configId
			? configs.filter((c) => c.id === configId && c.enabled)
			: configs.filter((c) => c.enabled);

		for (const config of targets) {
			try {
				await this.sendToWebhook(message, config);
			} catch (error) {
				console.error(`Webhook send failed for ${config.name}:`, error);
				this.emit("error", config.id, error);
			}
		}
	}

	async test(configId: string): Promise<WebhookTestResult> {
		const configs = storeManager.getWebhookConfigs();
		const config = configs.find((c) => c.id === configId);
		if (!config) {
			return { success: false, message: "Webhook config not found" };
		}

		try {
			const testMessage: WebhookMessage = {
				title: "🔔 测试消息 / Test Message",
				content:
					"这是一条来自超级客户端的测试消息。\nThis is a test message from Super Client.",
				timestamp: Date.now(),
			};
			const statusCode = await this.sendToWebhook(testMessage, config);
			return {
				success: true,
				statusCode,
				message: "Webhook test successful",
			};
		} catch (error) {
			return {
				success: false,
				message: error instanceof Error ? error.message : "Unknown error",
			};
		}
	}

	private async sendToWebhook(
		message: WebhookMessage,
		config: WebhookConfig,
	): Promise<number> {
		let payload: {
			url: string;
			body: unknown;
			headers?: Record<string, string>;
		};

		switch (config.type as WebhookType) {
			case "dingtalk":
				payload = buildDingtalkPayload(message, config);
				break;
			case "feishu":
				payload = buildFeishuPayload(message, config);
				break;
			case "telegram":
				payload = buildTelegramPayload(message, config);
				break;
			case "twitter":
				payload = buildTwitterPayload(message, config);
				break;
			case "facebook":
				payload = buildFacebookPayload(message, config);
				break;
			case "custom":
			default:
				payload = buildCustomPayload(message, config);
				break;
		}

		const resp = await axios({
			method: (config.method || "POST") as "GET" | "POST",
			url: payload.url,
			data: payload.body,
			headers: {
				"Content-Type": "application/json",
				...payload.headers,
			},
			timeout: 10000,
		});

		return resp.status;
	}

	async sendAlertNotification(
		symbol: string,
		assetName: string,
		condition: string,
		targetPrice: number,
		currentPrice: number,
	): Promise<void> {
		const conditionText =
			condition === "above"
				? "高于"
				: condition === "below"
					? "低于"
					: condition === "change_percent_above"
						? "涨幅超过"
						: "跌幅超过";

		const message: WebhookMessage = {
			title: `⚠️ 价格告警: ${assetName}(${symbol})`,
			content: [
				`**${assetName}** (${symbol})`,
				`当前价格: **${currentPrice}**`,
				`触发条件: ${conditionText} ${targetPrice}`,
				`触发时间: ${new Date().toLocaleString("zh-CN")}`,
			].join("\n\n"),
			timestamp: Date.now(),
		};

		await this.send(message);
	}
}

export const webhookService = new WebhookService();
