// @vitest-environment node
//
// E1 密钥安全改造 — EncryptedKeyStore 单测。
//
// 覆盖：
//  - 加密可用：set 后密文落盘、原子写、chmod 0600、新实例能解密读回。
//  - 磁盘上不出现明文密钥。
//  - 加密不可用：只存内存、绝不落盘、isAvailable() 反映真实状态。
//  - 空字符串等价删除；delete 落盘。

import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// electron.app / electron.safeStorage 都不在测试环境里；我们通过 options 注入
// baseDir + safeStorage，所以只需保证 import 不崩。
vi.mock("electron", () => ({
	app: { getPath: () => tmpdir() },
	safeStorage: {
		isEncryptionAvailable: () => false,
		encryptString: (s: string) => Buffer.from(s),
		decryptString: (b: Buffer) => b.toString(),
	},
}));

vi.mock("../../utils/logger", () => ({
	logger: {
		withContext: () => ({
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
			debug: vi.fn(),
		}),
	},
}));

import { EncryptedKeyStore, type SafeStorageLike } from "../encryptedKeyStore";

/** 可用的 fake safeStorage：用可逆前缀模拟加密，便于断言"磁盘无明文"。 */
function makeAvailableSafe(): SafeStorageLike {
	return {
		isEncryptionAvailable: () => true,
		encryptString: (plain: string) => Buffer.from(`ENC(${plain})`, "utf-8"),
		decryptString: (buf: Buffer) => {
			const s = buf.toString("utf-8");
			const m = /^ENC\((.*)\)$/s.exec(s);
			if (!m) throw new Error("bad ciphertext");
			return m[1];
		},
	};
}

let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "enc-key-store-"));
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

describe("EncryptedKeyStore — encryption available", () => {
	it("persists ciphertext to disk and reads it back via a fresh instance", () => {
		const safe = makeAvailableSafe();
		const store = new EncryptedKeyStore({ baseDir: dir, safeStorage: safe });

		store.setKey("provider_1", "sk-secret-123");
		expect(store.getKey("provider_1")).toBe("sk-secret-123");
		expect(store.hasKey("provider_1")).toBe(true);

		// 全新实例（清空内存）应能从磁盘解密读回。
		const store2 = new EncryptedKeyStore({ baseDir: dir, safeStorage: safe });
		expect(store2.getKey("provider_1")).toBe("sk-secret-123");
	});

	it("never writes the plaintext key to disk", () => {
		const safe = makeAvailableSafe();
		const store = new EncryptedKeyStore({ baseDir: dir, safeStorage: safe });
		store.setKey("provider_1", "sk-plaintext-should-not-leak");

		const file = join(dir, "provider-keys.enc.json");
		expect(existsSync(file)).toBe(true);
		const raw = readFileSync(file, "utf-8");
		expect(raw).not.toContain("sk-plaintext-should-not-leak");
	});

	it("chmods the ciphertext file to 0600 on POSIX", () => {
		if (process.platform === "win32") return;
		const safe = makeAvailableSafe();
		const store = new EncryptedKeyStore({ baseDir: dir, safeStorage: safe });
		store.setKey("provider_1", "sk-x");
		const file = join(dir, "provider-keys.enc.json");
		const mode = statSync(file).mode & 0o777;
		expect(mode).toBe(0o600);
	});

	it("leaves no .tmp file behind after an atomic write", () => {
		const safe = makeAvailableSafe();
		const store = new EncryptedKeyStore({ baseDir: dir, safeStorage: safe });
		store.setKey("provider_1", "sk-x");
		const { readdirSync } = require("node:fs") as typeof import("node:fs");
		const leftovers = readdirSync(dir).filter((f: string) => f.endsWith(".tmp"));
		expect(leftovers).toEqual([]);
	});

	it("treats empty string as delete and removes the key", () => {
		const safe = makeAvailableSafe();
		const store = new EncryptedKeyStore({ baseDir: dir, safeStorage: safe });
		store.setKey("provider_1", "sk-x");
		store.setKey("provider_1", "");
		expect(store.hasKey("provider_1")).toBe(false);
		expect(store.getKey("provider_1")).toBeUndefined();
	});

	it("deleteKey removes the key and persists", () => {
		const safe = makeAvailableSafe();
		const store = new EncryptedKeyStore({ baseDir: dir, safeStorage: safe });
		store.setKey("a", "sk-a");
		store.setKey("b", "sk-b");
		store.deleteKey("a");

		const store2 = new EncryptedKeyStore({ baseDir: dir, safeStorage: safe });
		expect(store2.hasKey("a")).toBe(false);
		expect(store2.getKey("b")).toBe("sk-b");
	});
});

describe("EncryptedKeyStore — encryption unavailable", () => {
	function makeUnavailableSafe(): SafeStorageLike {
		return {
			isEncryptionAvailable: () => false,
			encryptString: () => {
				throw new Error("should not encrypt when unavailable");
			},
			decryptString: () => {
				throw new Error("should not decrypt when unavailable");
			},
		};
	}

	it("reports isAvailable() === false", () => {
		const store = new EncryptedKeyStore({
			baseDir: dir,
			safeStorage: makeUnavailableSafe(),
		});
		expect(store.isAvailable()).toBe(false);
	});

	it("keeps keys in memory but never writes to disk", () => {
		const store = new EncryptedKeyStore({
			baseDir: dir,
			safeStorage: makeUnavailableSafe(),
		});
		store.setKey("provider_1", "sk-mem-only");
		// 内存可用
		expect(store.getKey("provider_1")).toBe("sk-mem-only");
		// 磁盘不落盘
		const file = join(dir, "provider-keys.enc.json");
		expect(existsSync(file)).toBe(false);
	});

	it("does not leak the key to a fresh instance (no disk persistence)", () => {
		const safe = makeUnavailableSafe();
		const store = new EncryptedKeyStore({ baseDir: dir, safeStorage: safe });
		store.setKey("provider_1", "sk-mem-only");

		const store2 = new EncryptedKeyStore({ baseDir: dir, safeStorage: safe });
		expect(store2.getKey("provider_1")).toBeUndefined();
	});
});
