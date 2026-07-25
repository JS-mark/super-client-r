// @vitest-environment node
//
// E1 密钥安全改造 — StoreManager 密钥分离 / 脱敏 / 迁移 单测。
//
// 用内存 Map 模拟 electron-store，用可控 fake 模拟 EncryptedKeyStore，验证：
//  - saveModelProvider：密钥进 keystore、config 记录里 apiKey 恒为空。
//  - getModelProviders / getModelProvider：对外一律脱敏（apiKey="")。
//  - getModelProviderApiKey：主进程内部能解密取回真实密钥；回退历史明文。
//  - 空 apiKey 保存不覆盖已存密钥。
//  - deleteModelProvider 同步删 keystore。
//  - migrateModelProviderKeys：迁移明文→keystore、清 config 明文、幂等。
//  - 搜索配置密钥同型行为。
//  - saveModelProvider 返回加密可用性。

import { beforeEach, describe, expect, it, vi } from "vitest";

// 内存 electron-store。
const storeData = new Map<string, unknown>();

vi.mock("electron-store", () => {
	class FakeStore {
		get(key: string) {
			return storeData.get(key);
		}
		set(key: string, value: unknown) {
			storeData.set(key, value);
		}
		delete(key: string) {
			storeData.delete(key);
		}
		get store() {
			return Object.fromEntries(storeData);
		}
		clear() {
			storeData.clear();
		}
	}
	return { default: FakeStore };
});

vi.mock("electron", () => ({
	app: { getPath: () => "/tmp/scr-test-userdata" },
}));

// 可控的 fake EncryptedKeyStore。
const keyMem = new Map<string, string>();
let encAvailable = true;

vi.mock("../encryptedKeyStore", () => ({
	encryptedKeyStore: {
		isAvailable: () => encAvailable,
		hasKey: (ref: string) => keyMem.has(ref),
		getKey: (ref: string) => keyMem.get(ref),
		setKey: (ref: string, v: string) => {
			if (!v) {
				keyMem.delete(ref);
				return;
			}
			// 模拟"加密不可用只存内存"——本 fake 无论如何存内存即可，测试
			// 通过 isAvailable 区分是否落盘语义。
			keyMem.set(ref, v);
		},
		deleteKey: (ref: string) => {
			keyMem.delete(ref);
		},
	},
}));

vi.mock("../../services/llm/modelNormalizer", () => ({
	ensureModelDefaults: (m: Record<string, unknown>) => m,
}));

import { StoreManager } from "../StoreManager";
import type { ModelProvider } from "../../ipc/types";

function makeProvider(id: string, apiKey: string): ModelProvider {
	return {
		id,
		name: `p-${id}`,
		preset: "openai" as ModelProvider["preset"],
		baseUrl: "https://api.example.com/v1",
		apiKey,
		enabled: true,
		tested: false,
		models: [],
		createdAt: 1,
		updatedAt: 1,
	};
}

let store: StoreManager;

beforeEach(() => {
	storeData.clear();
	keyMem.clear();
	encAvailable = true;
	store = new StoreManager();
});

describe("saveModelProvider — key separation", () => {
	it("puts the key in keystore and never writes plaintext to config", () => {
		store.saveModelProvider(makeProvider("p1", "sk-secret-1"));

		// keystore 有密文引用
		expect(keyMem.get("modelProvider:p1")).toBe("sk-secret-1");
		// config 里 apiKey 恒为空
		const rawConfig = storeData.get("modelProviders") as ModelProvider[];
		expect(rawConfig[0].apiKey).toBe("");
	});

	it("returns encryption availability status", () => {
		const res = store.saveModelProvider(makeProvider("p1", "sk-x"));
		expect(res.encryptionAvailable).toBe(true);
		expect(res.keyPersisted).toBe(true);
	});

	it("flags keyPersisted=false when encryption unavailable", () => {
		encAvailable = false;
		const res = store.saveModelProvider(makeProvider("p1", "sk-x"));
		expect(res.encryptionAvailable).toBe(false);
		expect(res.keyPersisted).toBe(false);
	});

	it("empty apiKey does not overwrite an existing key", () => {
		store.saveModelProvider(makeProvider("p1", "sk-original"));
		// 再存一次，apiKey 为空（模拟渲染端不回传明文）
		store.saveModelProvider(makeProvider("p1", ""));
		expect(store.getModelProviderApiKey("p1")).toBe("sk-original");
	});
});

describe("getModelProviders — redaction", () => {
	it("masks apiKey in list and single getters", () => {
		store.saveModelProvider(makeProvider("p1", "sk-secret-1"));
		const list = store.getModelProviders();
		expect(list[0].apiKey).toBe("");
		const single = store.getModelProvider("p1");
		expect(single?.apiKey).toBe("");
	});

	it("getModelProviderApiKey returns the real key (main-process only)", () => {
		store.saveModelProvider(makeProvider("p1", "sk-secret-1"));
		expect(store.getModelProviderApiKey("p1")).toBe("sk-secret-1");
	});

	it("getModelProviderApiKey falls back to legacy plaintext in config", () => {
		// 直接写入历史明文（未迁移）
		storeData.set("modelProviders", [makeProvider("legacy", "sk-legacy")]);
		expect(store.getModelProviderApiKey("legacy")).toBe("sk-legacy");
	});
});

describe("deleteModelProvider", () => {
	it("removes the provider and its stored key", () => {
		store.saveModelProvider(makeProvider("p1", "sk-x"));
		store.deleteModelProvider("p1");
		expect(keyMem.has("modelProvider:p1")).toBe(false);
		expect(store.getModelProviders()).toHaveLength(0);
	});
});

describe("migrateModelProviderKeys", () => {
	it("moves plaintext keys into keystore and clears config plaintext", () => {
		storeData.set("modelProviders", [
			makeProvider("a", "sk-a"),
			makeProvider("b", "sk-b"),
		]);
		const res = store.migrateModelProviderKeys();
		expect(res.available).toBe(true);
		expect(res.migrated).toBe(2);
		expect(keyMem.get("modelProvider:a")).toBe("sk-a");
		expect(keyMem.get("modelProvider:b")).toBe("sk-b");
		const raw = storeData.get("modelProviders") as ModelProvider[];
		expect(raw.every((p) => p.apiKey === "")).toBe(true);
	});

	it("is idempotent — a second run migrates nothing", () => {
		storeData.set("modelProviders", [makeProvider("a", "sk-a")]);
		store.migrateModelProviderKeys();
		const res2 = store.migrateModelProviderKeys();
		expect(res2.migrated).toBe(0);
	});

	it("does not migrate or clear plaintext when encryption is unavailable", () => {
		encAvailable = false;
		storeData.set("modelProviders", [makeProvider("a", "sk-a")]);
		const res = store.migrateModelProviderKeys();
		expect(res.available).toBe(false);
		expect(res.migrated).toBe(0);
		// 明文保留（避免丢 key）
		const raw = storeData.get("modelProviders") as ModelProvider[];
		expect(raw[0].apiKey).toBe("sk-a");
	});
});

describe("search config keys — same guarantees", () => {
	it("separates, redacts, resolves and migrates search config keys", () => {
		store.saveSearchConfig({
			id: "s1",
			provider: "tavily",
			name: "tav",
			apiKey: "sk-search",
			enabled: true,
		});
		// 脱敏
		expect(store.getSearchConfigs()[0].apiKey).toBe("");
		// 内部解密
		expect(store.getSearchConfigApiKey("s1")).toBe("sk-search");
		// keystore 分表
		expect(keyMem.get("searchConfig:s1")).toBe("sk-search");

		store.deleteSearchConfig("s1");
		expect(keyMem.has("searchConfig:s1")).toBe(false);
	});

	it("migrateSearchConfigKeys moves plaintext and clears config", () => {
		storeData.set("searchConfigs", [
			{
				id: "s1",
				provider: "tavily",
				name: "tav",
				apiKey: "sk-search",
				enabled: true,
			},
		]);
		const res = store.migrateSearchConfigKeys();
		expect(res.migrated).toBe(1);
		expect(keyMem.get("searchConfig:s1")).toBe("sk-search");
		const raw = storeData.get("searchConfigs") as Array<{ apiKey: string }>;
		expect(raw[0].apiKey).toBe("");
	});
});
