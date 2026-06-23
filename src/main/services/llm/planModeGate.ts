import { getRuntimePolicyService } from "../runtime/RuntimePolicyService";
import { getSessionRuntimeResolver } from "../runtime/SessionRuntimeResolver";
import type { ChatCompletionRequest } from "../../ipc/types";
import type { PlanMode } from "@super-client/shared-types/chat";
import type { ToolExecutor } from "./LLMService";

const PLAN_NOTE =
	"You are in PLAN ONLY mode. Describe the plan you would carry out, but do NOT call any tools. If tool input is needed for planning, list the calls and arguments you would make in prose.";

/**
 * R-5 — Plan-mode gate.
 *
 * Runs before the provider-specific chat-completion path. When the session's
 * `planMode` is `plan-only`, we:
 *   - drop the tool list and toolExecutor so the model cannot call tools
 *   - prepend a one-line instruction to the system message so the model
 *     understands it should describe a plan without invoking anything
 *   - record a single audit deny so the gate is observable in the runtime
 *     inspector
 *
 * Other plan modes (`chat`, `plan-then-ask`, `auto-execute-safe`,
 * `full-agent`) are informational here; the chip writes them to conversation
 * metadata and the resolver exposes them, but nothing is gated. Their
 * enforcement is a separate task.
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
	if (planMode !== "plan-only") return { request, toolExecutor };

	// Audit-record the gate firing once per request.
	try {
		getRuntimePolicyService().record(
			{
				workspaceId: "",
				sessionId,
				source: "llm",
				operation: "plan-mode:strip-tools",
				kind: "tool-execute",
			},
			"denied",
			"plan-only-mode",
		);
	} catch {
		/* never let audit failure block the user */
	}

	// Prepend a system note so the model knows to plan, not act.
	const messages = request.messages.slice();
	const first = messages[0];
	if (
		first &&
		(first as { role?: string }).role === "system" &&
		typeof (first as { content?: unknown }).content === "string"
	) {
		messages[0] = {
			...(first as object),
			content: `${PLAN_NOTE}\n\n${(first as { content: string }).content}`,
		} as ChatCompletionRequest["messages"][number];
	} else {
		messages.unshift({
			role: "system",
			content: PLAN_NOTE,
		} as ChatCompletionRequest["messages"][number]);
	}

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
