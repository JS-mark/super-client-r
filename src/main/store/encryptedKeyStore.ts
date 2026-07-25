/**
 * 加密密钥存储（分表）
 *
 * 用 Electron 的 `safeStorage`（OS 级 keychain / DPAPI / kwallet）加密敏感
 * 密钥，密文与主 config 分表落盘（独立文件），主 config 只保留引用 id。
 *
 * 安全约束（E1 密钥安全改造）：
 * - `safeStorage.isEncryptionAvailable() === false` 时**禁止静默回退明文落盘**：
 *   此时只在内存保存密钥（进程存活期间可用），不写磁盘；`isAvailable()`
 *   返回 false，供上层向 UI 提示并允许「仅内存不落盘」降级。
 * - 密文文件采用**原子写**（临时文件 + rename），并 `chmod 0600`
 *   （Windows 无 POSIX 权限，best-effort 跳过；加密才是唯一防线，不依赖文件权限）。
 * - 本模块严禁把明文密钥写入日志。
 */

import { app, safeStorage } from "electron";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	writeFileSync,
	chmodSync,
	unlinkSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { logger } from "../utils/logger";

const log = logger.withContext("EncryptedKeyStore");

/** 磁盘密文文件的 JSON 形态。 */
interface EncryptedKeyFile {
	version: 1;
	/** refId → base64(safeStorage 密文)。 */
	keys: Record<string, string>;
}

/** 仅暴露本模块用到的 safeStorage 子集，便于单测注入。 */
export interface SafeStorageLike {
	isEncryptionAvailable(): boolean;
	encryptString(plainText: string): Buffer;
	decryptString(encrypted: Buffer): string;
}

export interface EncryptedKeyStoreOptions {
	/** 密文文件所在目录；缺省用 `app.getPath("userData")`。 */
	baseDir?: string;
	/** safeStorage 实现；缺省用 electron 的 safeStorage。 */
	safeStorage?: SafeStorageLike;
	/** 密文文件名（不含目录）。 */
	fileName?: string;
}

const DEFAULT_FILE_NAME = "provider-keys.enc.json";

export class EncryptedKeyStore {
	private readonly options: EncryptedKeyStoreOptions;
	/**
	 * 明文密钥的进程内缓存。加密可用时作为读加速；加密不可用时作为唯一
	 * 存储（不落盘）。key 为 refId，value 为明文密钥。
	 */
	private memory = new Map<string, string>();
	private loaded = false;

	constructor(options: EncryptedKeyStoreOptions = {}) {
		this.options = options;
	}

	private get safe(): SafeStorageLike {
		return this.options.safeStorage ?? safeStorage;
	}

	private get filePath(): string {
		const base = this.options.baseDir ?? app.getPath("userData");
		return join(base, this.options.fileName ?? DEFAULT_FILE_NAME);
	}

	/**
	 * 当前平台是否可加密落盘。false 时上层应提示用户，并只允许「仅内存不落盘」。
	 */
	isAvailable(): boolean {
		try {
			return this.safe.isEncryptionAvailable();
		} catch {
			return false;
		}
	}

	/** 惰性从磁盘装载密文并解密到内存缓存（仅在加密可用时读盘）。 */
	private ensureLoaded(): void {
		if (this.loaded) return;
		this.loaded = true;
		if (!this.isAvailable()) return;
		const path = this.filePath;
		if (!existsSync(path)) return;
		try {
			const raw = readFileSync(path, "utf-8");
			const parsed = JSON.parse(raw) as EncryptedKeyFile;
			if (!parsed || typeof parsed !== "object" || !parsed.keys) return;
			for (const [refId, b64] of Object.entries(parsed.keys)) {
				if (typeof b64 !== "string") continue;
				try {
					const plain = this.safe.decryptString(Buffer.from(b64, "base64"));
					this.memory.set(refId, plain);
				} catch {
					// 单条解密失败（例如换过 keychain）不影响其余密钥。
					log.warn("Failed to decrypt a stored key; skipping", { refId });
				}
			}
		} catch (error) {
			log.error(
				"Failed to load encrypted key store",
				error instanceof Error ? error : undefined,
			);
		}
	}

	/** 把内存里的密钥全量加密后原子写盘。加密不可用时直接跳过（不落盘）。 */
	private persist(): void {
		if (!this.isAvailable()) return;
		const path = this.filePath;
		const keys: Record<string, string> = {};
		for (const [refId, plain] of this.memory) {
			keys[refId] = this.safe.encryptString(plain).toString("base64");
		}
		const payload: EncryptedKeyFile = { version: 1, keys };
		const dir = dirname(path);
		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true });
		}
		const tmp = `${path}.${process.pid}.${this.memory.size}.tmp`;
		try {
			writeFileSync(tmp, JSON.stringify(payload), { mode: 0o600 });
			// rename 是同分区原子操作：崩溃只可能留下 tmp 或旧文件，不会半写。
			renameSync(tmp, path);
			this.chmod0600(path);
		} catch (error) {
			try {
				if (existsSync(tmp)) unlinkSync(tmp);
			} catch {
				// best-effort 清理
			}
			throw error;
		}
	}

	private chmod0600(path: string): void {
		if (process.platform === "win32") return; // Win 走 ACL，无 POSIX 权限位
		try {
			chmodSync(path, 0o600);
		} catch {
			// 加密才是唯一防线，权限设置失败不致命
		}
	}

	/** 是否存在某 refId 的密钥。 */
	hasKey(refId: string): boolean {
		this.ensureLoaded();
		return this.memory.has(refId);
	}

	/** 读取明文密钥（仅主进程内部使用；绝不返回给渲染端）。 */
	getKey(refId: string): string | undefined {
		this.ensureLoaded();
		return this.memory.get(refId);
	}

	/**
	 * 写入密钥。空字符串等价于删除。加密可用时立即加密落盘；不可用时仅存内存。
	 */
	setKey(refId: string, plainText: string): void {
		this.ensureLoaded();
		if (!plainText) {
			this.deleteKey(refId);
			return;
		}
		this.memory.set(refId, plainText);
		this.persist();
	}

	/** 删除密钥并落盘。 */
	deleteKey(refId: string): void {
		this.ensureLoaded();
		if (this.memory.delete(refId)) {
			this.persist();
		}
	}
}

// 单例
export const encryptedKeyStore = new EncryptedKeyStore();
