// @vitest-environment node
//
// E1 密钥安全改造 — server/config getOrCreateApiKey / migrateServerApiKey 单测。
//
// 验证：
//  - 首次生成 sk- key 只进 keystore、不写 config。
//  - 二次调用返回同一 key（幂等）。
//  - 历史明文 config.apiKey 被迁移进 keystore 并从 config 移除。
//  - 加密不可用时不清明文（避免丢 key）。

import { beforeEach, describe, expect, it, vi } from "vitest";

const configMem = new Map<string, unknown>();
const keyMem = new Map<string, string>();
let encAvailable = true;

vi.mock("../../store", () => ({
	storeManager: {
		getConfig: (k: string) => configMem.get(k),
		setConfig: (k: string, v: unknown) => configMem.set(k, v),
		deleteConfig: (k: string) => configMem.delete(k),
	},
}));

vi.mock("../../store/encryptedKeyStore", () => ({
	encryptedKeyStore: {
		isAvailable: () => encAvailable,
		hasKey: (ref: string) => keyMem.has(ref),
		getKey: (ref: string) => keyMem.get(ref),
		setKey: (ref: string, v: string) => {
			if (!v) keyMem.delete(ref);
			else keyMem.set(ref, v);
		},
		deleteKey: (ref: string) => keyMem.delete(ref),
	},
}));

import { getOrCreateApiKey, migrateServerApiKey } from "../config";

beforeEach(() => {
	configMem.clear();
	keyMem.clear();
	encAvailable = true;
});

describe("getOrCreateApiKey", () => {
	it("generates an sk- key into keystore, not into config", () => {
		const key = getOrCreateApiKey();
		expect(key).toMatch(/^sk-[0-9a-f]{64}$/);
		expect(keyMem.get("server:apiKey")).toBe(key);
		expect(configMem.has("apiKey")).toBe(false);
	});

	it("is idempotent — returns the same key on repeated calls", () => {
		const a = getOrCreateApiKey();
		const b = getOrCreateApiKey();
		expect(a).toBe(b);
	});

	it("migrates a legacy plaintext config key into keystore and removes it", () => {
		configMem.set("apiKey", "sk-legacy-key");
		const key = getOrCreateApiKey();
		expect(key).toBe("sk-legacy-key");
		expect(keyMem.get("server:apiKey")).toBe("sk-legacy-key");
		expect(configMem.has("apiKey")).toBe(false);
	});

	it("keeps legacy plaintext when encryption unavailable (no data loss)", () => {
		encAvailable = false;
		configMem.set("apiKey", "sk-legacy-key");
		const key = getOrCreateApiKey();
		expect(key).toBe("sk-legacy-key");
		// 加密不可用：不清明文
		expect(configMem.get("apiKey")).toBe("sk-legacy-key");
	});
});

describe("migrateServerApiKey", () => {
	it("moves plaintext to keystore and clears config", () => {
		configMem.set("apiKey", "sk-legacy");
		migrateServerApiKey();
		expect(keyMem.get("server:apiKey")).toBe("sk-legacy");
		expect(configMem.has("apiKey")).toBe(false);
	});

	it("does nothing when there is no legacy key", () => {
		migrateServerApiKey();
		expect(keyMem.size).toBe(0);
	});

	it("does not clear plaintext when encryption unavailable", () => {
		encAvailable = false;
		configMem.set("apiKey", "sk-legacy");
		migrateServerApiKey();
		expect(configMem.get("apiKey")).toBe("sk-legacy");
	});
});
