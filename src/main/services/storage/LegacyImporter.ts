/**
 * Phase G-3 — 老数据导入。
 *
 * 老存储 (`<userData>/chats/<userId>/<convId>/`) 在 Phase E-7 后不再被
 * `loadConversations` 读取，旧用户升级会"看不到历史"。本服务一次性把老数据
 * 转成新 SessionStorage 形态。
 *
 * 策略（MVP）：
 *  - 全部导入为 **casual session**（projectId = null）。不重建 workspace → project
 *    映射——老 `WorkspaceConfig` 模型已删，自动派生 projectId 风险大于收益；
 *    用户可以手动改名分组。
 *  - sessionId 沿用老 conversationId（避免链接 / 引用失效）。
 *  - messages.json → JSONL 事件流（用 `messagesToEvents`）。
 *  - attachments / tool-outputs 子目录原样 cp 到新 session 子目录。
 *  - **不删老数据**：导入成功也保留 `<userData>/chats/`，给用户回滚底气。
 *  - **幂等**：StoreManager 上 `migrationV2Done` flag 防重入；新 SessionStorage 已
 *    存在同名 session 时跳过。
 */

import {
	cpSync,
	existsSync,
	readFileSync,
	readdirSync,
	statSync,
} from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import { messagesToEvents } from "@super-client/shared-types/messageConverter";
import type { ChatMessagePersist } from "@super-client/shared-types/chat";
import type { SessionMeta } from "@super-client/shared-types/project";
import type { SessionStorageService } from "./SessionStorageService";
import type { StoreManager } from "../../store/StoreManager";

export interface LegacyConvSummary {
	id: string;
	name: string;
	createdAt: number;
	updatedAt: number;
	messageCount: number;
	preview: string;
}

export interface LegacyDataInfo {
	/** 检出的老 conversation 数量 */
	count: number;
	/** 已经导入过（migrationV2Done flag） */
	alreadyImported: boolean;
	/** 老 chats 根目录（绝对路径），用于人工救援 */
	legacyDir: string;
	/** 检测时间内最近修改的几条预览，方便用户判断要不要导入 */
	preview: LegacyConvSummary[];
}

export interface ImportResult {
	total: number;
	imported: number;
	skipped: number;
	failed: number;
	warnings: { id: string; code: string; message: string }[];
	failures: {
		id: string;
		code: string;
		message: string;
		error?: string;
		recoverable: boolean;
	}[];
	dismissed: boolean;
}

export class LegacyImporter {
	constructor(
		private readonly sessionStorage: SessionStorageService,
		private readonly storeManager: StoreManager,
		private readonly userId: string,
	) {}

	private get legacyDir(): string {
		return join(app.getPath("userData"), "chats", this.userId);
	}

	/**
	 * 不修改任何数据，只扫一下老目录。
	 * 给 renderer 启动时判断"要不要弹 import 对话框"用。
	 */
	detect(): LegacyDataInfo {
		const dir = this.legacyDir;
		const alreadyImported = this.storeManager.isMigrationV2Done();
		if (!existsSync(dir)) {
			return { count: 0, alreadyImported, legacyDir: dir, preview: [] };
		}
		const ids: string[] = [];
		try {
			for (const entry of readdirSync(dir)) {
				if (entry.startsWith(".")) continue;
				const sub = join(dir, entry);
				try {
					if (!statSync(sub).isDirectory()) continue;
				} catch {
					continue;
				}
				if (existsSync(join(sub, "messages.json"))) {
					ids.push(entry);
				}
			}
		} catch {
			return { count: 0, alreadyImported, legacyDir: dir, preview: [] };
		}

		const summaries: LegacyConvSummary[] = [];
		for (const id of ids) {
			const meta = this.readLegacyMeta(id);
			if (meta) summaries.push(meta);
		}
		summaries.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));

		return {
			count: ids.length,
			alreadyImported,
			legacyDir: dir,
			preview: summaries.slice(0, 5),
		};
	}

	/**
	 * 真正执行导入。可重复调（幂等）；返回每条记录的处理结果。
	 *
	 * 只有全部成功/跳过时才置 `migrationV2Done = true`；出现 failures 时保留 retry
	 * 入口，避免失败数据被静默关闭。失败条目用户可凭 `<legacyDir>` 手动救援。
	 */
	importAll(): ImportResult {
		const result: ImportResult = {
			total: 0,
			imported: 0,
			skipped: 0,
			failed: 0,
			warnings: [],
			failures: [],
			dismissed: false,
		};
		const dir = this.legacyDir;
		if (!existsSync(dir)) {
			this.storeManager.markMigrationV2Done();
			return result;
		}

		for (const entry of readdirSync(dir)) {
			if (entry.startsWith(".")) continue;
			const convDir = join(dir, entry);
			try {
				if (!statSync(convDir).isDirectory()) continue;
			} catch {
				continue;
			}
			if (!existsSync(join(convDir, "messages.json"))) continue;
			result.total += 1;

			try {
				const outcome = this.importOne(entry, convDir, result);
				if (outcome === "imported") result.imported += 1;
				else result.skipped += 1;
			} catch (err) {
				result.failed += 1;
				const message = err instanceof Error ? err.message : String(err);
				result.failures.push({
					id: entry,
					code: classifyImportError(err),
					message,
					error: message,
					recoverable: true,
				});
			}
		}

		if (result.failures.length === 0) {
			this.storeManager.markMigrationV2Done();
		}
		return result;
	}

	// ─── helpers ─────────────────────────────────────────────────

	private readLegacyMeta(id: string): LegacyConvSummary | null {
		const metaPath = join(this.legacyDir, id, "metadata.json");
		if (!existsSync(metaPath)) return null;
		try {
			const raw = readFileSync(metaPath, "utf-8");
			const obj = JSON.parse(raw) as Partial<{
				id: string;
				name: string;
				createdAt: number;
				updatedAt: number;
				messageCount: number;
				preview: string;
			}>;
			return {
				id: obj.id ?? id,
				name: obj.name ?? "未命名对话",
				createdAt: obj.createdAt ?? 0,
				updatedAt: obj.updatedAt ?? 0,
				messageCount: obj.messageCount ?? 0,
				preview: obj.preview ?? "",
			};
		} catch {
			return null;
		}
	}

	private importOne(
		id: string,
		convDir: string,
		report: ImportResult,
	): "imported" | "skipped" {
		// 已存在同名新 session → 跳过
		try {
			this.sessionStorage.getMeta(id);
			return "skipped";
		} catch {
			// not found — proceed
		}

		const oldMeta = this.readLegacyMeta(id);
		const messagesPath = join(convDir, "messages.json");
		const messagesRaw = readFileSync(messagesPath, "utf-8");
		const persisted = JSON.parse(messagesRaw) as ChatMessagePersist[];
		const messages = (persisted ?? []).filter(
			(m) => m && typeof m === "object",
		);

		// 创建 casual session（projectId=null）
		// 直接 inject SessionMeta 而不是走 sessionStorage.create()，因为我们要保留原 id
		// 与时间戳。SessionStorage.create 只生成新 id；用 internal API 不暴露则手动构造。
		const now = Date.now();
		const meta: SessionMeta = {
			id,
			projectId: null,
			name: oldMeta?.name,
			chatMode: "chat",
			createdAt: oldMeta?.createdAt ?? now,
			updatedAt: oldMeta?.updatedAt ?? now,
			messageCount: messages.filter(
				(m) => m.role === "user" || m.role === "assistant",
			).length,
			preview: oldMeta?.preview,
			importSource: {
				kind: "legacy-conversation",
				id,
				legacyDir: convDir,
				needsCwdReview: true,
			},
		};

		// 用 SessionStorage 的内部 API：先 writeMeta (via 一个 trick)，再 appendEvent。
		// 因为 writeMeta 是 private，我们用 create + updateMeta 的组合来 backdoor。
		// → 更干净：在 SessionStorage 加一个 `injectLegacy(meta, events)` API。
		this.sessionStorage.injectLegacy(meta, messagesToEvents(messages));

		// 复制附件 / tool-outputs
		const subDir = this.sessionStorage.getSessionDir(id);
		for (const sub of ["attachments", "tool-outputs"] as const) {
			const src = join(convDir, sub);
			if (existsSync(src)) {
				try {
					cpSync(src, join(subDir, sub), { recursive: true });
				} catch (err) {
					report.warnings.push({
						id,
						code: `${sub.replace("-", "")}CopyFailed`,
						message: err instanceof Error ? err.message : String(err),
					});
				}
			}
		}

		return "imported";
	}
}

function classifyImportError(err: unknown): string {
	const message = err instanceof Error ? err.message : String(err);
	if (message.includes("JSON")) return "invalidMessagesJson";
	if (message.includes("ENOENT")) return "messagesMissing";
	if (message.includes("permission") || message.includes("EACCES")) {
		return "permissionDenied";
	}
	return "importFailed";
}

let _singleton: LegacyImporter | null = null;

export function initializeLegacyImporter(
	sessionStorage: SessionStorageService,
	storeManager: StoreManager,
	userId: string,
): LegacyImporter {
	_singleton = new LegacyImporter(sessionStorage, storeManager, userId);
	return _singleton;
}

export function getLegacyImporter(): LegacyImporter {
	if (!_singleton) {
		throw new Error(
			"LegacyImporter not initialized — call initializeLegacyImporter() first",
		);
	}
	return _singleton;
}
