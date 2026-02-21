import crypto from "crypto";
import { storeManager } from "../store";

export const SERVER_CONFIG = {
	PORT: 3000,
	/** 无需认证的公开路径 */
	PUBLIC_PATHS: [
		"/health",
		"/favicon.ico",
		"/api-docs",
		"/swagger.json",
		"/swagger-ui/",
	],
};

/**
 * 获取或生成 API Key
 * 首次调用时随机生成 sk- 前缀的标准 API Key 并持久化到 store
 */
export function getOrCreateApiKey(): string {
	const existing = storeManager.getConfig("apiKey");
	if (existing) return existing;

	const key = `sk-${crypto.randomBytes(32).toString("hex")}`;
	storeManager.setConfig("apiKey", key);
	return key;
}
