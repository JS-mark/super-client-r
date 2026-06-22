/**
 * RuntimePolicyService
 *
 * 职责：
 *  1. 操作分类（risk + scope）
 *  2. 内存 audit log（最近 N 条决策）
 *  3. **R-6** policy evaluation：根据 `WorkspaceRuntimePolicy` 决定 allow / deny / needs-approval
 *
 * 设计原则：
 *  - evaluate 是**纯函数**：caller 传入 ctx + policy，service 不反向读 store。这样 caller
 *    可以自由地决定 policy 来源（resolver 快照、workspace config、session override）。
 *  - 第一阶段仅启用最低风险的 enforcement 类：`external-app === "blocked"` 时 deny。
 *    其它类（network / file-write / command）保持 audit-only，等专门接入。
 *  - `runtimeEnforcement` 标记控制 enforcement，不再影响 audit log 持久化（之前的
 *    "关闭 flag 时不写 buffer" 语义被移除——auditing 始终发生，flag 只决定是否阻断）。
 */

import { randomUUID } from "node:crypto";
import type {
	ClassifiedRuntimeOperation,
	RuntimeAuditEntry,
	RuntimeDecision,
	RuntimeOperationContext,
	RuntimeOperationKind,
	RuntimeRiskLevel,
	RuntimeScope,
	WorkspaceRuntimePolicy,
} from "@super-client/shared-types/chat";

const DEFAULT_BUFFER_SIZE = 500;

const KIND_RISK: Record<RuntimeOperationKind, RuntimeRiskLevel> = {
	"tool-execute": "low",
	"file-read": "low",
	"file-write": "medium",
	"file-delete": "high",
	"command-exec": "high",
	"network-request": "medium",
	"external-app": "medium",
};

const KIND_SCOPE: Record<RuntimeOperationKind, RuntimeScope> = {
	"tool-execute": "workspace",
	"file-read": "workspace",
	"file-write": "workspace",
	"file-delete": "workspace",
	"command-exec": "system",
	"network-request": "network",
	"external-app": "external",
};

/** R-6: evaluate 的返回。 */
export interface PolicyEvaluation {
	/** allow / deny / needs-approval。没有 prompt path 的 caller 必须拒绝或标 audit-only。 */
	decision: "allow" | "deny" | "needs-approval";
	reason?: string;
	code?: string;
}

export class RuntimePolicyService {
	private buffer: RuntimeAuditEntry[] = [];
	private readonly maxSize: number;
	private enforcementEnabled = true;

	constructor(maxSize = DEFAULT_BUFFER_SIZE) {
		this.maxSize = maxSize;
	}

	/** §22 回滚开关：renderer 通过 featureFlags.set 推送当前状态。 */
	setEnforcementEnabled(value: boolean): void {
		this.enforcementEnabled = value;
	}

	isEnforcementEnabled(): boolean {
		return this.enforcementEnabled;
	}

	/** 仅根据操作类型与目标做基础分类，不读取任何 workspace policy。 */
	classify(ctx: RuntimeOperationContext): ClassifiedRuntimeOperation {
		const risk = this.deriveRisk(ctx);
		const scope = KIND_SCOPE[ctx.kind];
		return { ...ctx, risk, scope };
	}

	/**
	 * R-6 — 根据 WorkspaceRuntimePolicy 评估一次操作。
	 *
	 * 当前仅启用 **最保守的一档**：`external-app` kind 且 policy.externalAppAccess
	 * 为 `"blocked"` 时 deny。其它类（network / file-write / command）在本阶段
	 * 仍返回 allow，等各自的 caller path 独立接入。
	 *
	 * `enforcementEnabled === false` 时无条件 allow，作为 §22 rollback 闸门。
	 * `policy === undefined` 时也 allow（"无策略 = 不阻断"），避免在 workspace
	 * 元数据缺失（旧会话/迁移期）时硬死。
	 */
	evaluate(
		op: RuntimeOperationContext | ClassifiedRuntimeOperation,
		policy: WorkspaceRuntimePolicy | undefined,
	): PolicyEvaluation {
		if (!this.enforcementEnabled) {
			return { decision: "allow", reason: "enforcement-disabled" };
		}
		if (!policy) {
			return { decision: "allow", reason: "no-policy" };
		}

		switch (op.kind) {
			case "external-app": {
				if (policy.externalAppAccess === "blocked") {
					return {
						decision: "deny",
						code: "runtime.externalAppBlocked",
						reason: "workspace-policy:external-app-blocked",
					};
				}
				if (policy.externalAppAccess === "approval-required") {
					return {
						decision: "needs-approval",
						code: "runtime.externalAppNeedsApproval",
						reason: "workspace-policy:external-app-approval-required",
					};
				}
				return { decision: "allow" };
			}
			case "network-request": {
				if (policy.networkAccess === "blocked") {
					return {
						decision: "deny",
						code: "runtime.networkBlocked",
						reason: "workspace-policy:network-blocked",
					};
				}
				if (policy.networkAccess === "approval-required") {
					return {
						decision: "needs-approval",
						code: "runtime.networkNeedsApproval",
						reason: "workspace-policy:network-approval-required",
					};
				}
				return { decision: "allow" };
			}
			case "file-write":
			case "file-delete": {
				if (policy.sandboxMode === "read-only") {
					return {
						decision: "deny",
						code: "runtime.writeBlockedReadOnly",
						reason: "workspace-policy:read-only-sandbox",
					};
				}
				if (policy.approvalMode === "request") {
					return {
						decision: "needs-approval",
						code: "runtime.writeNeedsApproval",
						reason: "workspace-policy:file-write-approval-required",
					};
				}
				return { decision: "allow" };
			}
			case "command-exec": {
				if (policy.sandboxMode !== "system-access") {
					return {
						decision: "needs-approval",
						code: "runtime.commandNeedsApproval",
						reason: "workspace-policy:command-approval-required",
					};
				}
				if (policy.approvalMode === "request") {
					return {
						decision: "needs-approval",
						code: "runtime.commandNeedsApproval",
						reason: "workspace-policy:command-approval-required",
					};
				}
				return { decision: "allow" };
			}
			case "file-read":
			case "tool-execute":
			default:
				return { decision: "allow", reason: "audit-only:not-enforced" };
		}
	}

	/** 写入一条 audit；若 op 是 RuntimeOperationContext 则先 classify。 */
	record(
		op: RuntimeOperationContext | ClassifiedRuntimeOperation,
		decision: RuntimeDecision,
		reason?: string,
	): RuntimeAuditEntry {
		const classified = "risk" in op && "scope" in op ? op : this.classify(op);
		const entry: RuntimeAuditEntry = {
			...classified,
			id: randomUUID(),
			timestamp: Date.now(),
			decision,
			reason,
		};
		this.buffer.push(entry);
		if (this.buffer.length > this.maxSize) {
			this.buffer.splice(0, this.buffer.length - this.maxSize);
		}
		return entry;
	}

	/** 返回最近的 audit 条目，最新的在末尾。 */
	getAuditLog(limit?: number): RuntimeAuditEntry[] {
		if (typeof limit === "number" && limit > 0) {
			return this.buffer.slice(-limit);
		}
		return this.buffer.slice();
	}

	clearAuditLog(): void {
		this.buffer = [];
	}

	private deriveRisk(ctx: RuntimeOperationContext): RuntimeRiskLevel {
		const base = KIND_RISK[ctx.kind];
		if (ctx.kind === "command-exec" || ctx.kind === "file-delete") {
			return "high";
		}
		// 命中典型敏感路径时从 medium 升 high
		const target = ctx.target?.toLowerCase();
		if (target) {
			if (
				target.startsWith("/etc") ||
				target.startsWith("/sbin") ||
				target.startsWith("/usr/") ||
				target.includes(".ssh") ||
				target.includes(".aws") ||
				target.includes(".env")
			) {
				return "high";
			}
		}
		return base;
	}
}

let singleton: RuntimePolicyService | null = null;

export function getRuntimePolicyService(): RuntimePolicyService {
	if (!singleton) singleton = new RuntimePolicyService();
	return singleton;
}
