/**
 * AgentRuntimeRegistry
 *
 * 详见 spec §5。Adapter 在 app-ready 时统一注册，broker / IPC handler 通过
 * `resolveForSession` 选择。
 *
 * 选择决策（spec §5.1）：
 *   - 优先使用 `SessionMeta.runtimeId`（会话级、不可变）
 *   - 缺省时 `pickDefaultRuntimeId(profile, model)` 派生：
 *       claude-code        → claude-sdk
 *       codex              → codex（未注册降级 llm-loop + warn）
 *       hybrid + anthropic → claude-sdk
 *       hybrid + others    → llm-loop
 */

import type {
	AgentRuntime,
	AgentRuntimeDescriptor,
	AgentRuntimeId,
	CustomAgentRuntimeId,
} from "@super-client/shared-types/agent-runtime";
import type {
	InteractionProfile,
	ModelSelection,
} from "@super-client/shared-types/chat";
import type { SessionMeta } from "@super-client/shared-types/project";

// ─────────────────────────────────────────────────────────────────────
// pickDefaultRuntimeId
// ─────────────────────────────────────────────────────────────────────

/**
 * Anthropic 原生 provider id。其它 OpenAI 兼容（DeepSeek、OpenRouter、Bedrock 等）
 * 都走 llm-loop 直到 1.5b 之后能够透传给 Claude SDK 的 third-party 网关模式。
 */
const ANTHROPIC_NATIVE_PROVIDERS = new Set(["anthropic", "claude"]);

export interface PickDefaultRuntimeContext {
	profile: InteractionProfile;
	model: ModelSelection;
	/** 可选：供 codex 缺位时用 logger 警告。 */
	onCodexFallback?: (reason: string) => void;
	/** 用于 codex registered 检查：注册表内是否已注册 codex runtime。 */
	codexRegistered?: boolean;
}

export function pickDefaultRuntimeId(
	ctx: PickDefaultRuntimeContext,
): AgentRuntimeId {
	switch (ctx.profile) {
		case "claude-code":
			return "claude-sdk";

		case "codex": {
			if (ctx.codexRegistered) return "codex";
			ctx.onCodexFallback?.(
				"profile=codex but no CodexRuntime registered; falling back to llm-loop",
			);
			return "llm-loop";
		}

		case "hybrid":
		default:
			return ANTHROPIC_NATIVE_PROVIDERS.has(ctx.model.providerId.toLowerCase())
				? "claude-sdk"
				: "llm-loop";
	}
}

// ─────────────────────────────────────────────────────────────────────
// AgentRuntimeRegistry
// ─────────────────────────────────────────────────────────────────────

export class RuntimeNotRegisteredError extends Error {
	readonly code = "RuntimeNotRegistered" as const;
	constructor(public readonly id: string) {
		super(`AgentRuntime not registered: ${id}`);
		this.name = "RuntimeNotRegisteredError";
	}
}

export interface ResolveForSessionInput {
	sessionMeta: Pick<SessionMeta, "runtimeId">;
	/** 当 SessionMeta.runtimeId 缺失时用于派生默认值 */
	profile: InteractionProfile;
	model: ModelSelection;
}

export class AgentRuntimeRegistry {
	private readonly byId = new Map<string, AgentRuntime>();
	private logger?: (msg: string) => void;

	setLogger(logger: (msg: string) => void): void {
		this.logger = logger;
	}

	register(runtime: AgentRuntime): void {
		const id = runtime.descriptor.id;
		if (this.byId.has(id)) {
			throw new Error(`AgentRuntime already registered: ${id}`);
		}
		this.byId.set(id, runtime);
	}

	unregister(id: AgentRuntimeId | CustomAgentRuntimeId): boolean {
		return this.byId.delete(id);
	}

	get(id: AgentRuntimeId | CustomAgentRuntimeId): AgentRuntime {
		const rt = this.byId.get(id);
		if (!rt) throw new RuntimeNotRegisteredError(id);
		return rt;
	}

	tryGet(id: AgentRuntimeId | CustomAgentRuntimeId): AgentRuntime | null {
		return this.byId.get(id) ?? null;
	}

	has(id: AgentRuntimeId | CustomAgentRuntimeId): boolean {
		return this.byId.has(id);
	}

	list(): AgentRuntimeDescriptor[] {
		return [...this.byId.values()].map((r) => r.descriptor);
	}

	/**
	 * 解析会话应使用的 runtime。
	 *
	 * 优先级：sessionMeta.runtimeId（不可变）→ pickDefaultRuntimeId。
	 * 任一选定的 id 未注册都抛 RuntimeNotRegisteredError——拒绝静默降级，
	 * 调用方可能需要 fallback 自行处理。
	 */
	resolveForSession(input: ResolveForSessionInput): AgentRuntime {
		const explicit = input.sessionMeta.runtimeId;
		if (explicit) {
			const rt = this.tryGet(explicit);
			if (rt) return rt;
			// 显式选定但未注册：不静默换 default，抛错让上层选择
			throw new RuntimeNotRegisteredError(explicit);
		}
		const id = pickDefaultRuntimeId({
			profile: input.profile,
			model: input.model,
			codexRegistered: this.has("codex"),
			onCodexFallback: (reason) => this.logger?.(reason),
		});
		const rt = this.tryGet(id);
		if (!rt) throw new RuntimeNotRegisteredError(id);
		return rt;
	}

	/** App quit 时调用所有 adapter 的 dispose。 */
	async disposeAll(): Promise<void> {
		await Promise.all(
			[...this.byId.values()].map((r) =>
				r.dispose ? r.dispose().catch(() => undefined) : undefined,
			),
		);
		this.byId.clear();
	}
}

// ─────────────────────────────────────────────────────────────────────
// 单例（main bootstrap 用）
// ─────────────────────────────────────────────────────────────────────

let singleton: AgentRuntimeRegistry | null = null;

export function getAgentRuntimeRegistry(): AgentRuntimeRegistry {
	if (!singleton) singleton = new AgentRuntimeRegistry();
	return singleton;
}

export function setAgentRuntimeRegistry(
	instance: AgentRuntimeRegistry | null,
): void {
	singleton = instance;
}

export function _resetAgentRuntimeRegistryForTest(): void {
	singleton = null;
}
