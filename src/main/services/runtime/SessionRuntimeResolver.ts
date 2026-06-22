/**
 * SessionRuntimeResolver
 *
 * Phase G-4 重构（2026-06-21）—— 之前读 `ConversationSummary + WorkspaceConfig`，
 * 在 Phase E 删 Workspace 抽象后新 session 命中不到 → 报 `WORKSPACE_NOT_FOUND` →
 * LLMService 静默 fallback 到 chat 模式 → 用户 ProjectSettings 形同虚设。
 *
 * 新模型下数据源：
 *   - `SessionStorageService.getMeta(sessionId)` → 当前 session 元数据
 *   - `ProjectStorageService.getSettings(projectId)` → 项目级 sparse 覆盖
 *   - `GLOBAL_RUNTIME_DEFAULTS` → app 级兜底（hard-coded；后续可挪到 config.json）
 *
 * 解析顺序（每个字段独立）：
 *   global default ← project settings ← session meta override ← per-message override
 *
 * `EffectiveSessionRuntime` 形态保持不变（避免破坏 LLMService / IPC consumer）。
 * `workspaceId` 字段填 `projectId ?? "default"` —— legacy 字段，新代码不该读它。
 */

import type {
	ActiveModelSelection,
	EffectiveSessionRuntime,
	EnabledCapability,
	InteractionProfile,
	ModelSelection,
	PlanMode,
	ResolveSessionRuntimeInput,
	WorkspaceContextPolicy,
	WorkspaceRuntimePolicy,
} from "../../ipc/types";
import type {
	ProjectSettings,
	SessionMeta,
} from "@super-client/shared-types/project";

import { storeManager as defaultStoreManager } from "../../store/StoreManager";
import type { StoreManager } from "../../store/StoreManager";
import { getProjectStorage } from "../storage/ProjectStorageService";
import { getSessionStorage } from "../storage/SessionStorageService";
import type { ProjectStorageService } from "../storage/ProjectStorageService";
import type { SessionStorageService } from "../storage/SessionStorageService";

export class SessionRuntimeResolveError extends Error {
	constructor(
		message: string,
		public readonly code:
			| "WORKSPACE_NOT_FOUND"
			| "MODEL_UNAVAILABLE"
			| "SESSION_NOT_FOUND",
	) {
		super(message);
		this.name = "SessionRuntimeResolveError";
	}
}

/**
 * App 级运行时默认值。projectSettings / sessionMeta 缺省时兜底。
 * 跟 StoreManager.createDefaultWorkspaceConfig 保持一致（后者作为老 default
 * workspace 的字段已经表达了同一份默认）。
 */
const GLOBAL_RUNTIME_DEFAULTS: {
	interactionProfile: InteractionProfile;
	runtimePolicy: WorkspaceRuntimePolicy;
	contextPolicy: WorkspaceContextPolicy;
	enabledCapabilities: EnabledCapability[];
} = {
	interactionProfile: "hybrid",
	runtimePolicy: {
		approvalMode: "request",
		sandboxMode: "workspace-write",
		writableRoots: [],
		networkAccess: "approval-required",
		externalAppAccess: "approval-required",
	},
	contextPolicy: {
		defaultAttachmentMode: "ask-before-read",
		includeWorkspaceKnowledge: false,
	},
	enabledCapabilities: [],
};

export class SessionRuntimeResolver {
	constructor(
		private readonly storeManager: StoreManager,
		private readonly sessionStorage: SessionStorageService,
		private readonly projectStorage: ProjectStorageService,
	) {}

	resolve(input: ResolveSessionRuntimeInput): EffectiveSessionRuntime {
		const { sessionId, messageOverride } = input;

		const meta = this.findMeta(sessionId);
		if (!meta) {
			throw new SessionRuntimeResolveError(
				`Session not found: ${sessionId}`,
				"SESSION_NOT_FOUND",
			);
		}

		const projectSettings = this.findProjectSettings(meta.projectId);

		const model = this.resolveModel(
			projectSettings,
			meta,
			messageOverride?.model,
		);

		const interactionProfile: InteractionProfile =
			messageOverride?.interactionProfile ??
			meta.interactionProfileOverride ??
			projectSettings?.interactionProfile ??
			GLOBAL_RUNTIME_DEFAULTS.interactionProfile;

		const planMode: PlanMode =
			messageOverride?.planMode ?? meta.planMode ?? "chat";

		const runtimePolicy = this.overlayRuntimePolicy(
			GLOBAL_RUNTIME_DEFAULTS.runtimePolicy,
			projectSettings?.runtimePolicy,
		);

		const contextPolicy = this.overlayContextPolicy(
			GLOBAL_RUNTIME_DEFAULTS.contextPolicy,
			projectSettings?.contextPolicy,
		);

		const enabledCapabilities =
			projectSettings?.enabledCapabilities ??
			GLOBAL_RUNTIME_DEFAULTS.enabledCapabilities;

		return {
			// `workspaceId` 是 EffectiveSessionRuntime 的 legacy 字段；新代码不应读它。
			// 填 projectId 或 "default" 兜底，保持类型契约不破。
			workspaceId: meta.projectId ?? "default",
			sessionId,
			model,
			interactionProfile,
			planMode,
			runtimePolicy,
			contextPolicy,
			enabledCapabilities,
			attachments: [],
			approvalGrants: meta.approvalGrants ?? [],
		};
	}

	// ─── private ────────────────────────────────────────────────

	private findMeta(sessionId: string): SessionMeta | null {
		try {
			return this.sessionStorage.getMeta(sessionId);
		} catch {
			return null;
		}
	}

	private findProjectSettings(
		projectId: string | null,
	): ProjectSettings | null {
		if (!projectId) return null;
		try {
			return this.projectStorage.getSettings(projectId);
		} catch {
			return null;
		}
	}

	private resolveModel(
		projectSettings: ProjectSettings | null,
		meta: SessionMeta,
		messageOverride: ModelSelection | undefined,
	): ModelSelection {
		const candidate =
			messageOverride ??
			meta.modelOverride ??
			projectSettings?.defaultModel ??
			toModelSelection(this.storeManager.getActiveModelSelection());

		if (!candidate) {
			throw new SessionRuntimeResolveError(
				"No model resolved: no message override, session override, project default, or global active model",
				"MODEL_UNAVAILABLE",
			);
		}
		return candidate;
	}

	private overlayRuntimePolicy(
		base: WorkspaceRuntimePolicy,
		override: Partial<WorkspaceRuntimePolicy> | undefined,
	): WorkspaceRuntimePolicy {
		if (!override) return base;
		return {
			approvalMode: override.approvalMode ?? base.approvalMode,
			sandboxMode: override.sandboxMode ?? base.sandboxMode,
			writableRoots: override.writableRoots ?? base.writableRoots,
			networkAccess: override.networkAccess ?? base.networkAccess,
			externalAppAccess: override.externalAppAccess ?? base.externalAppAccess,
		};
	}

	private overlayContextPolicy(
		base: WorkspaceContextPolicy,
		override: Partial<WorkspaceContextPolicy> | undefined,
	): WorkspaceContextPolicy {
		if (!override) return base;
		return {
			defaultAttachmentMode:
				override.defaultAttachmentMode ?? base.defaultAttachmentMode,
			includeWorkspaceKnowledge:
				override.includeWorkspaceKnowledge ?? base.includeWorkspaceKnowledge,
			maxAttachmentBytes:
				override.maxAttachmentBytes ?? base.maxAttachmentBytes,
		};
	}
}

function toModelSelection(
	active: ActiveModelSelection | undefined,
): ModelSelection | undefined {
	if (!active) return undefined;
	return { providerId: active.providerId, modelId: active.modelId };
}

let singleton: SessionRuntimeResolver | null = null;

export function getSessionRuntimeResolver(): SessionRuntimeResolver {
	if (!singleton) {
		singleton = new SessionRuntimeResolver(
			defaultStoreManager,
			getSessionStorage(),
			getProjectStorage(),
		);
	}
	return singleton;
}
