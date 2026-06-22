/**
 * Single source-of-truth resolver for "where this conversation runs".
 *
 * Phase G-2（2026-06-22 重写）——
 * 之前会话 cwd 是用户 home / project.cwd。新设计把会话工作目录改为
 * **per-session 沙箱**：
 *
 *   - casual:  `<userData>/chats/<userId>/session/<sid>`
 *   - project: `<userData>/chats/<userId>/<projectId>/session/<sid>`
 *
 * 项目的真实路径作为"可操作范围"约束注入到系统提示词，**不再作为 cwd**。
 * 这样做的好处：
 *   - 每个会话天然隔离临时产物（todo state / 缓存 / scratch files）
 *   - 项目目录里不再被插入 `.scr-data` 一类的客户端数据
 *   - AI 在 system prompt 里被明确告知项目根路径与边界
 *
 * 当 sessionId 解析失败时回退到 userData 根目录，避免 cwd 落到无写权限处。
 *
 * Callers：
 *   - `AgentSDKService.processSDKChat`（Agent SDK cwd）
 *   - `modelHandlers.getCwdForConversation`（chat completion cwd）
 *   - IPC `cwd.resolveSessionCwd` 直接代理本函数（保持单一源）
 *   - 系统提示词组装走 `resolveConversationProjectRoot`
 */

import { app } from "electron";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { getProjectStorage } from "../storage/ProjectStorageService";
import { getSessionStorage } from "../storage/SessionStorageService";

const SESSION_SEGMENT = "session";

/**
 * 会话工作目录（per-session 沙箱）。永远在 userData 下，绝不落到 project.cwd。
 * 调用方拿到后可直接用于子进程 cwd。
 */
export function resolveConversationCwd(conversationId: string): string {
	try {
		const meta = getSessionStorage().getMeta(conversationId);
		// TODO(multi-user): SessionMeta 暂时不带 userId，跟全仓约定 'default'
		const userId = "default";
		const userData = app.getPath("userData");
		const projectSegment = meta.projectId === null ? "" : meta.projectId;
		const sandboxDir = projectSegment
			? join(userData, "chats", userId, projectSegment, SESSION_SEGMENT, conversationId)
			: join(userData, "chats", userId, SESSION_SEGMENT, conversationId);
		try {
			mkdirSync(sandboxDir, { recursive: true });
		} catch {
			/* best-effort：失败也返回路径，调用方再决定如何回退 */
		}
		return sandboxDir;
	} catch {
		// session 解析失败 → 退回 userData 根；不再退到 home，避免误把 home 当沙箱
		return app.getPath("userData");
	}
}

/**
 * 会话绑定的项目根目录（项目会话才有）。提供给系统提示词作为
 * "可操作范围"约束。casual 会话返回 null。
 */
export function resolveConversationProjectRoot(
	conversationId: string,
): string | null {
	try {
		const meta = getSessionStorage().getMeta(conversationId);
		if (meta.projectId === null) return null;
		const project = getProjectStorage()
			.list()
			.find((p) => p.id === meta.projectId);
		return project?.cwd ?? null;
	} catch {
		return null;
	}
}
