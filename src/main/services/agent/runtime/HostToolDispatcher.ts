/**
 * HostToolDispatcher
 *
 * 详见 spec §4。所有 AgentRuntime adapter 收到模型的 tool 决策时，
 * **不**自己执行——必须先 `checkApproval`，再 `execute`。本 dispatcher 是
 * audit / approval 缓存 / artifact 抽取的唯一咽喉。
 *
 * 路由规则：
 *   - origin.kind === 'skill' 或 serverId 以 `skill:` 开头 → SkillService.executeSkill
 *   - origin.kind === 'mcp' / 'builtin'                   → McpService.callTool（带
 *                                                            cwd 解析 + _storageDir 注入，
 *                                                            行为与 modelHandlers.ts:22-75 一致）
 *
 * 审批规则：
 *   - 命中 ApprovalGrantStore             → allow (auto-grant)
 *   - runtime.approvalMode === 'full-access'  → allow (auto-policy)
 *   - runtime.approvalMode === 'auto-safe'    → ask（Phase 1：保守，未来按工具白名单收紧）
 *   - runtime.approvalMode === 'request'      → ask
 */

import { randomUUID } from "node:crypto";
import * as path from "node:path";
import type {
	ApprovalCheckResult,
	ToolCallContext,
	ToolDispatcher,
	ToolExecutionResult,
	ToolResultContent,
} from "@super-client/shared-types/agent-runtime";

import type { ApprovalGrantStore } from "../../runtime/ApprovalGrantStore";

// ─────────────────────────────────────────────────────────────────────
// Service contracts (依赖反转，便于单测)
// ─────────────────────────────────────────────────────────────────────

export interface McpToolCallService {
	callTool(
		serverId: string,
		toolName: string,
		args: Record<string, unknown>,
	): Promise<{ success: boolean; data?: unknown; error?: string }>;
}

export interface SkillToolCallService {
	executeSkill(
		skillId: string,
		toolName: string,
		args: Record<string, unknown>,
	): Promise<{ success: boolean; output?: unknown; error?: string }>;
}

export interface HostToolDispatcherDeps {
	mcp: McpToolCallService;
	skills: SkillToolCallService;
	approvals: Pick<ApprovalGrantStore, "findGrant" | "addGrant" | "recordDeny">;
}

// ─────────────────────────────────────────────────────────────────────
// 内置 MCP 注入规则（沿用 modelHandlers.ts:22-75 的语义）
// ─────────────────────────────────────────────────────────────────────

const SERVERS_WITH_PATH_ARGS = new Set(["@scp/file-system", "@scp/grep"]);
const PATH_ARG_KEYS = ["path", "source", "destination"];
const SERVERS_WITH_STORAGE = new Set(["@scp/plan", "@scp/task"]);

/**
 * 把相对路径拼到 cwd 上、给 plan/task 注入 `_storageDir`。
 *
 * 仅供内部使用；export 仅为单测能直接验证（与 spec §11 内置 MCP 回归套件对齐）。
 */
export function injectBuiltinArgs(
	serverId: string,
	args: Record<string, unknown>,
	cwd?: string,
): Record<string, unknown> {
	if (!cwd) return args;
	if (SERVERS_WITH_STORAGE.has(serverId)) {
		return { ...args, _storageDir: path.join(cwd, "todo") };
	}
	if (!SERVERS_WITH_PATH_ARGS.has(serverId)) return args;
	const out: Record<string, unknown> = { ...args };
	for (const key of PATH_ARG_KEYS) {
		const v = out[key];
		if (typeof v === "string" && v && !path.isAbsolute(v)) {
			out[key] = path.resolve(cwd, v);
		}
	}
	return out;
}

// ─────────────────────────────────────────────────────────────────────
// 审批 key 派生
// ─────────────────────────────────────────────────────────────────────

/** 把 tool call 收敛成 (operationType, target) 给 ApprovalGrantStore 查询。 */
function deriveApprovalKey(call: ToolCallContext): {
	operationType: string;
	target?: string;
} {
	// operationType 用 `tool:<originServerId>:<realName>` —— 与 host 前缀解耦，
	// 这样同一个 tool 即便 prefix 变也能复用 grant
	const op = `tool:${call.origin.serverId}:${call.origin.realName}`;
	const target = extractTarget(call.input);
	return { operationType: op, target };
}

function extractTarget(input: unknown): string | undefined {
	if (!input || typeof input !== "object") return undefined;
	const obj = input as Record<string, unknown>;
	for (const k of PATH_ARG_KEYS) {
		const v = obj[k];
		if (typeof v === "string" && v) return v;
	}
	const cmd = obj.command;
	if (typeof cmd === "string") return cmd;
	return undefined;
}

// ─────────────────────────────────────────────────────────────────────
// HostToolDispatcher 实现
// ─────────────────────────────────────────────────────────────────────

export class HostToolDispatcher implements ToolDispatcher {
	constructor(private readonly deps: HostToolDispatcherDeps) {}

	async checkApproval(call: ToolCallContext): Promise<ApprovalCheckResult> {
		const key = deriveApprovalKey(call);
		const grant = this.deps.approvals.findGrant({
			conversationId: call.conversationId,
			operationType: key.operationType,
			target: key.target,
		});
		if (grant) {
			return { kind: "allow", source: "auto-grant" };
		}

		const mode = call.runtime.runtimePolicy?.approvalMode ?? "request";
		switch (mode) {
			case "full-access":
				return { kind: "allow", source: "auto-policy" };
			case "auto-safe":
				// Phase 1 保守：auto-safe 仍走人工。后续按 tool 白名单或 sandbox 判断细化。
				return { kind: "ask", approvalId: randomUUID() };
			case "request":
			default:
				return { kind: "ask", approvalId: randomUUID() };
		}
	}

	async execute(call: ToolCallContext): Promise<ToolExecutionResult> {
		const startedAt = Date.now();
		try {
			const isSkill =
				call.origin.kind === "skill" ||
				call.origin.serverId.startsWith("skill:");

			if (isSkill) {
				const skillId = call.origin.serverId.startsWith("skill:")
					? call.origin.serverId.slice("skill:".length)
					: call.origin.serverId;
				const args = (call.input as Record<string, unknown>) ?? {};
				const r = await this.deps.skills.executeSkill(
					skillId,
					call.origin.realName,
					args,
				);
				if (!r.success) {
					return errorResult(r.error ?? "Skill tool call failed", startedAt);
				}
				return {
					content: normalizeOutput(r.output),
					isError: false,
					durationMs: Date.now() - startedAt,
				};
			}

			// MCP / builtin
			const args = injectBuiltinArgs(
				call.origin.serverId,
				(call.input as Record<string, unknown>) ?? {},
				call.cwd,
			);
			const r = await this.deps.mcp.callTool(
				call.origin.serverId,
				call.origin.realName,
				args,
			);
			if (!r.success) {
				return errorResult(r.error ?? "Tool call failed", startedAt);
			}
			return {
				content: normalizeOutput(r.data),
				isError: false,
				durationMs: Date.now() - startedAt,
			};
		} catch (err) {
			return errorResult(
				err instanceof Error ? err.message : String(err),
				startedAt,
				err,
			);
		}
	}
}

// ─────────────────────────────────────────────────────────────────────
// 输出归一化
// ─────────────────────────────────────────────────────────────────────

function errorResult(
	message: string,
	startedAt: number,
	raw?: unknown,
): ToolExecutionResult {
	return {
		content: { kind: "error", message, raw },
		isError: true,
		durationMs: Date.now() - startedAt,
	};
}

/**
 * 把 MCP / Skill 工具的原始输出归一化到 `ToolResultContent`。
 *
 * 输入约定：
 *   - string                              → TextResult
 *   - { content: [...] } (MCP standard)   → MixedResult / TextResult
 *   - { type: 'image', source, mime }     → ImageResult
 *   - 其它任意对象                          → StructuredResult
 *   - undefined / null                    → TextResult ('')
 */
export function normalizeOutput(raw: unknown): ToolResultContent {
	if (raw == null) return { kind: "text", text: "" };
	if (typeof raw === "string") return { kind: "text", text: raw };
	if (typeof raw !== "object") return { kind: "text", text: String(raw) };

	const obj = raw as Record<string, unknown>;
	if (Array.isArray(obj)) {
		return { kind: "structured", data: obj };
	}

	// MCP standard tool result shape: { content: Array<{ type, text|data, ... }> }
	if (Array.isArray(obj.content)) {
		const parts: Array<
			| { kind: "text"; text: string }
			| { kind: "image"; source: string; mime: string }
			| { kind: "structured"; data: unknown }
		> = [];
		for (const it of obj.content as Array<Record<string, unknown>>) {
			if (!it || typeof it !== "object") continue;
			if (it.type === "text" && typeof it.text === "string") {
				parts.push({ kind: "text", text: it.text });
			} else if (it.type === "image" && typeof it.data === "string") {
				parts.push({
					kind: "image",
					source: it.data,
					mime: typeof it.mimeType === "string" ? it.mimeType : "image/png",
				});
			} else {
				parts.push({ kind: "structured", data: it });
			}
		}
		if (parts.length === 1) return parts[0];
		if (parts.length === 0) return { kind: "text", text: "" };
		return { kind: "mixed", parts };
	}

	// 单个 image
	if (
		obj.type === "image" &&
		typeof obj.source === "string" &&
		typeof obj.mime === "string"
	) {
		return { kind: "image", source: obj.source, mime: obj.mime };
	}

	return { kind: "structured", data: obj };
}
