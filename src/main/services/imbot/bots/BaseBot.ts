import { EventEmitter } from "events";
import type { IMBotConfig, IMMessage } from "../types";

/**
 * IM 机器人抽象基类
 *
 * 所有具体的机器人实现都继承此类
 */
export abstract class BaseBot extends EventEmitter {
	protected config: IMBotConfig;

	constructor(config: IMBotConfig) {
		super();
		this.config = config;
	}

	/**
	 * 启动机器人
	 */
	abstract start(): Promise<void>;

	/**
	 * 停止机器人
	 */
	abstract stop(): Promise<void>;

	/**
	 * 发送消息到指定聊天
	 *
	 * @param chatId 聊天 ID
	 * @param content 消息内容
	 */
	abstract sendMessage(chatId: string, content: string): Promise<void>;

	/**
	 * 广播消息到所有配置的群组
	 *
	 * @param message 消息内容
	 */
	abstract broadcast(message: string): Promise<void>;

	/**
	 * 获取机器人配置
	 */
	getConfig(): IMBotConfig {
		return this.config;
	}

	/**
	 * 更新机器人配置
	 */
	updateConfig(config: IMBotConfig): void {
		this.config = config;
	}
}
