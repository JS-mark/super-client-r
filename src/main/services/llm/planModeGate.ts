import { getRuntimePolicyService } from "../runtime/RuntimePolicyService";
import { getSessionRuntimeResolver } from "../runtime/SessionRuntimeResolver";
import type { ChatCompletionRequest } from "../../ipc/types";
import type { PlanMode } from "@super-client/shared-types/chat";
import type { ToolExecutor } from "./LLMService";
import {
	isDestructiveTool,
	planModeToPolicy,
} from "../agent/runtime/planModeToolGuard";

const PLAN_ONLY_NOTE =
	"You are in PLAN ONLY mode. Describe the plan you would carry out, but do NOT call any tools. If tool input is needed for planning, list the calls and arguments you would make in prose.";

const PLAN_THEN_ASK_NOTE =
	"You are in PLAN THEN ASK mode. You may call read-oriented tools (Read/Grep/Glob/WebFetch/AskUserQuestion) to gather context, but you MUST NOT call any tool that writes files, deletes, or executes commands. Describe destructive steps in prose and ask the user to confirm before running them.";

/**
 * R-5 — Plan-mode gate.
 *
 * Runs before the provider-specific chat-completion path. When the session's
 * `planMode` is `plan-only` or `plan-then-ask`, we clamp the tool surface
 * exposed to the model:
 *   - `plan-only`      → drop the entire tools list + toolExecutor
 *   - `plan-then-ask`  → keep only read-oriented tools; drop write/exec ones
 *     (classification lives in `planModeToolGuard.isDestructiveTool` so the
 *     runtime-first `canUseTool` guard uses the exact same policy)
 *
 * In both cases we:
 *   - prepend a one-line instruction to the system message describing the
 *     restriction so the model behaves consistently
 *   - record an audit deny (once per request) so the gate is observable in
 *     the runtime inspector
 *
 * Other plan modes (`chat`, `auto-execute-safe`, `full-agent`) pass through
 * unchanged; enforcement for those is a separate task.
 */
export function applyPlanModeGate(
	request: ChatCompletionRequest,
	toolExecutor: ToolExecutor | undefined,
): {
	request: ChatCompletionRequest;
	toolExecutor: ToolExecutor | undefined;
} {
	const sessionId = request.conversationId;
	if (!sessionId) return { request, toolExecutor };

	let planMode: PlanMode = "chat";
	try {
		planMode = getSessionRuntimeResolver().resolve({ sessionId }).planMode;
	} catch {
		// Resolver failure is non-fatal — treat as "chat" so legacy paths
		// keep working. The audit log will see no deny here.
		return { request, toolExecutor };
	}

	const policy = planModeToPolicy(planMode);
	if (policy === "allow") return { request, toolExecutor };

	// Audit-record the gate firing once per request.
	try {
		getRuntimePolicyService().record(
			{
				workspaceId: "",
				sessionId,
				source: "llm",
				operation:
					policy === "deny-all"
						? "plan-mode:strip-tools"
						: "plan-mode:strip-destructive-tools",
				kind: "tool-execute",
			},
			"denied",
			`plan-mode:${planMode}`,
		);
	} catch {
		/* never let audit failure block the user */
	}

	// Prepend a system note so the model knows the restriction.
	const note = policy === "deny-all" ? PLAN_ONLY_NOTE : PLAN_THEN_ASK_NOTE;
	const messages = request.messages.slice();
	const first = messages[0];
	if (
		first &&
		(first as { role?: string }).role === "system" &&
		typeof (first as { content?: unknown }).content === "string"
	) {
		messages[0] = {
			...(first as object),
			content: `${note}\n\n${(first as { content: string }).content}`,
		} as ChatCompletionRequest["messages"][number];
	} else {
		messages.unshift({
			role: "system",
			content: note,
		} as ChatCompletionRequest["messages"][number]);
	}

	if (policy === "deny-all") {
		return {
			request: {
				...request,
				messages,
				tools: undefined,
				toolMapping: undefined,
				toolPermission: undefined,
			},
			toolExecutor: undefined,
		};
	}

	// deny-write-only: keep only read-oriented tools. Drop matching
	// entries from tools[] AND toolMapping so the model can't see destructive
	// tool schemas. toolExecutor stays wired (the executor itself is a
	// second-line defence via runtime canUseTool + resolver).
	const originalTools = request.tools ?? [];
	const filteredTools = originalTools.filter(
		(t) => !isDestructiveTool(t.function.name),
	);
	let filteredMapping: ChatCompletionRequest["toolMapping"];
	if (request.toolMapping) {
		filteredMapping = {};
		for (const [wireName, target] of Object.entries(request.toolMapping)) {
			if (!isDestructiveTool(wireName)) {
				filteredMapping[wireName] = target;
			}
		}
	}

	return {
		request: {
			...request,
			messages,
			tools: filteredTools.length > 0 ? filteredTools : undefined,
			toolMapping: filteredMapping,
		},
		toolExecutor,
	};
}
