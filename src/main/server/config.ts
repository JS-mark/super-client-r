import crypto from "crypto";
import { storeManager } from "../store";
import { encryptedKeyStore } from "../store/encryptedKeyStore";

export const SERVER_CONFIG = {
	PORT: 3000,
	/** 无需认证的公开路径 */
	PUBLIC_PATHS: [
		"/health",
		"/favicon.ico",
		"/api-docs",
		"/plugin-dev",
		"/swagger.json",
		"/swagger-ui/",
		"/v1/app/init-config",
	],
};

/** EncryptedKeyStore 里 server 自身 sk- key 的引用 id。 */
const SERVER_API_KEY_REF = "server:apiKey";

/**
 * 获取或生成本地 HTTP Server 的 API Key。
 *
 * E1 密钥安全改造：key **不再明文写入 config store**，而是经 safeStorage 加密
 * 后存入 EncryptedKeyStore（分表落盘）。首次调用随机生成 sk- 前缀的 key。
 *
 * 加密不可用时（safeStorage 不可用）EncryptedKeyStore 走内存 fallback：
 * key 在进程存活期间可用但不落盘——绝不静默回退明文落盘。
 */
export function getOrCreateApiKey(): string {
	const fromStore = encryptedKeyStore.getKey(SERVER_API_KEY_REF);
	if (fromStore) return fromStore;

	// 历史明文（迁移前的旧数据）：读出后立即加密迁移、清除明文。
	const legacy = storeManager.getConfig("apiKey");
	if (legacy) {
		encryptedKeyStore.setKey(SERVER_API_KEY_REF, legacy);
		if (encryptedKeyStore.isAvailable()) {
			storeManager.deleteConfig("apiKey");
		}
		return legacy;
	}

	const key = `sk-${crypto.randomBytes(32).toString("hex")}`;
	encryptedKeyStore.setKey(SERVER_API_KEY_REF, key);
	return key;
}

/**
 * 启动时一次性迁移 server 自身的明文 sk- key 到加密存储，并从 config 磁盘
 * 移除明文。幂等；加密不可用时保留明文（避免丢 key）。
 */
export function migrateServerApiKey(): void {
	const legacy = storeManager.getConfig("apiKey");
	if (!legacy) return;
	if (!encryptedKeyStore.isAvailable()) return;
	if (!encryptedKeyStore.hasKey(SERVER_API_KEY_REF)) {
		encryptedKeyStore.setKey(SERVER_API_KEY_REF, legacy);
	}
	storeManager.deleteConfig("apiKey");
}
