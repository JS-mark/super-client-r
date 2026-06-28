/**
 * Tool adapter — converts the request's OpenAI-format tool list into an AI
 * SDK `ToolSet`, wrapping each tool's `execute` with the four cross-cutting
 * concerns the legacy `LLMService` enforced inline:
 *
 *   1. Emit `tool_call` event (parity with the IPC contract).
 *   2. Permission check (`checkPermission`).
 *   3. Runtime policy evaluation (`evaluateRuntimePolicy`).
 *   4. Emit `tool_result` / `tool_error` event with duration.
 *
 * The AI SDK loops on tool calls itself (`streamText` + `stopWhen`), so this
 * is the only integration point we need.
 */

import { jsonSchema, tool, type ToolSet } from "ai";
import type {
	ChatCompletionRequest,
	ChatStreamEvent,
} from "../../ipc/types";
import { RuntimeApprovalRequiredError, type ToolExecutor } from "./LLMService";

export interface BuildToolSetArgs {
	request: ChatCompletionRequest;
	toolExecutor: ToolExecutor | undefined;
	broadcast: (event: ChatStreamEvent) => void;
	/** Mirrors `LLMService.checkToolPermission` */
	checkPermission: (args: {
		toolCallId: string;
		toolName: string;
		toolArgs: string;
	}) => Promise<boolean>;
	/** Mirrors `LLMService.evaluateToolRuntimePolicy` */
	evaluateRuntimePolicy: (
		toolName: string,
		args: Record<string, unknown>,
	) => { allowed: true } | { allowed: false; code: string; message: string };
	/**
	 * Prompt the user for a one-shot runtime-policy approval. Resolves `true`
	 * when the user picks "allow"; `false` otherwise (including request abort).
	 * Reuses the same `tool_approval_request` channel `checkPermission` uses.
	 */
	awaitRuntimeApproval: (args: {
		toolCallId: string;
		toolName: string;
		toolArgs: string;
		code: string;
		message: string;
	}) => Promise<boolean>;
	/**
	 * Interactive `AskUserQuestion` flow. Resolves to the user's
	 * `{questions, answers}` payload, or `null` when skipped / aborted.
	 * The renderer reads `toolCall.input` directly for the questions array,
	 * so we don't need to ship it again here — only the `toolCallId` is used
	 * to correlate the renderer's response.
	 */
	awaitUserQuestionAnswer: (args: {
		toolCallId: string;
		toolName: string;
		toolArgs: string;
	}) => Promise<Record<string, unknown> | null>;
}

/**
 * Strip the optional internal-MCP prefix (`scp-agent-builtins__`,
 * `@scp/...`, etc.) so we can match a tool name regardless of how the
 * runtime wrapped it. Lowercased.
 */
function bareToolName(name: string): string {
	const lower = name.toLowerCase();
	if (lower.includes("__")) return lower.split("__").pop() ?? lower;
	if (lower.includes(":")) return lower.split(":").pop() ?? lower;
	return lower;
}

function isAskUserQuestionTool(name: string): boolean {
	const bare = bareToolName(name);
	return bare === "askuserquestion" || bare === "ask_user_question";
}

export function buildToolSet(args: BuildToolSetArgs): ToolSet | undefined {
	const {
		request,
		toolExecutor,
		broadcast,
		checkPermission,
		evaluateRuntimePolicy,
		awaitRuntimeApproval,
		awaitUserQuestionAnswer,
	} = args;
	if (!request.tools || request.tools.length === 0 || !toolExecutor)
		return undefined;

	const set: ToolSet = {};
	for (const t of request.tools) {
		const name = t.function.name;
		set[name] = tool({
			description: t.function.description,
			inputSchema: jsonSchema(
				t.function.parameters as Parameters<typeof jsonSchema>[0],
			),
			execute: async (input, { toolCallId }) => {
				const argsObj =
					input && typeof input === "object"
						? (input as Record<string, unknown>)
						: {};
				const argsJson = JSON.stringify(argsObj);

				broadcast({
					requestId: request.requestId,
					type: "tool_call",
					toolCall: { id: toolCallId, name, arguments: argsJson },
				});

				// ── AskUserQuestion interception ────────────────────────────
				// The "tool" is really a UI affordance: the renderer reads
				// `toolCall.input` from the tool_call event above and renders
				// `AskUserQuestionCard`, then submits answers through the
				// approval IPC. We skip the permission/policy gates and the
				// MCP executor entirely; the user's payload becomes the
				// tool_result.
				if (isAskUserQuestionTool(name)) {
					const payload = await awaitUserQuestionAnswer({
						toolCallId,
						toolName: name,
						toolArgs: argsJson,
					});
					if (payload === null) {
						// Skipped / aborted — surface as tool_error so the model
						// sees a clean signal and can fall back to plain text.
						const skipMessage =
							"User skipped the clarification — proceed using sensible defaults or ask in prose.";
						broadcast({
							requestId: request.requestId,
							type: "tool_error",
							toolError: {
								toolCallId,
								name,
								error: skipMessage,
								code: "ASK_USER_QUESTION_SKIPPED",
							},
						});
						throw new Error(skipMessage);
					}
					// Build the tool_result the model sees.
					// IMPORTANT: don't echo `questions` back — that's the same
					// array the model just sent as the tool argument, and at
					// least DeepSeek-v3.2 (and a few other non-Anthropic models)
					// then misread the response as "the tool wants me to ask
					// these questions" and re-asks the user in plain markdown.
					// What the model actually needs is "the user answered, here
					// are their picks, proceed". Use a result envelope whose
					// `status` + `user_answers` shape leaves no ambiguity.
					const userAnswers =
						payload && typeof payload === "object" && "answers" in payload
							? ((payload as { answers?: Record<string, unknown> })
									.answers ?? {})
							: {};
					const modelResult = {
						status: "answered" as const,
						user_answers: userAnswers,
						note:
							"The user provided the answers above. Use them as the source of truth and continue with the next step. Do NOT call AskUserQuestion again for the same topic, and do NOT repeat the same questions in plain text.",
					};
					broadcast({
						requestId: request.requestId,
						type: "tool_result",
						toolResult: { toolCallId, name, result: modelResult },
					});
					return modelResult;
				}

				const approved = await checkPermission({
					toolCallId,
					toolName: name,
					toolArgs: argsJson,
				});
				if (!approved) {
					broadcast({
						requestId: request.requestId,
						type: "tool_error",
						toolError: {
							toolCallId,
							name,
							error: "Tool call was rejected by user.",
							code: "TOOL_REJECTED",
						},
					});
					throw new Error("Tool call was rejected by user.");
				}

				// Pre-flight policy check. Two outcomes branch differently:
				//   - hard deny → emit `tool_error` and abort (status quo).
				//   - needs-approval → prompt the user via the same approval
				//     channel `checkPermission` uses, then re-dispatch with
				//     `approvalGranted: true` so the McpService gate lets it
				//     through. The renderer-side `ApprovalDecisionCard` already
				//     renders the prompt when `permission_request` lands.
				let runtimeApprovalGranted = false;
				const policy = evaluateRuntimePolicy(name, argsObj);
				if (!policy.allowed) {
					if (policy.code === "runtime.needsApproval") {
						const approvedByUser = await awaitRuntimeApproval({
							toolCallId,
							toolName: name,
							toolArgs: argsJson,
							code: policy.code,
							message: policy.message,
						});
						if (!approvedByUser) {
							const message =
								"Workspace policy: command approval declined.";
							broadcast({
								requestId: request.requestId,
								type: "tool_error",
								toolError: {
									toolCallId,
									name,
									error: message,
									code: policy.code,
								},
							});
							throw new Error(message);
						}
						runtimeApprovalGranted = true;
					} else {
						broadcast({
							requestId: request.requestId,
							type: "tool_error",
							toolError: {
								toolCallId,
								name,
								error: policy.message,
								code: policy.code,
							},
						});
						throw new Error(policy.message);
					}
				}

				const started = Date.now();
				try {
					const result = await toolExecutor(name, argsObj, {
						approvalGranted: runtimeApprovalGranted,
					});
					const duration = Date.now() - started;
					broadcast({
						requestId: request.requestId,
						type: "tool_result",
						toolResult: { toolCallId, name, result, duration },
					});
					return result;
				} catch (err) {
					// Second-chance approval: the policy gate inside
					// `McpService.callTool` re-evaluates and may raise
					// `needs-approval` even when the pre-flight check above said
					// allow (e.g. policy resolved with stale workspace state).
					// Prompt the user once and retry rather than surfacing as
					// a raw failure.
					if (err instanceof RuntimeApprovalRequiredError) {
						const approvedByUser = await awaitRuntimeApproval({
							toolCallId,
							toolName: name,
							toolArgs: argsJson,
							code: err.code,
							message: err.message,
						});
						if (approvedByUser) {
							const retryStarted = Date.now();
							try {
								const result = await toolExecutor(name, argsObj, {
									approvalGranted: true,
								});
								const duration = Date.now() - retryStarted;
								broadcast({
									requestId: request.requestId,
									type: "tool_result",
									toolResult: { toolCallId, name, result, duration },
								});
								return result;
							} catch (retryErr) {
								const duration = Date.now() - retryStarted;
								const retryMessage =
									retryErr instanceof Error
										? retryErr.message
										: String(retryErr);
								broadcast({
									requestId: request.requestId,
									type: "tool_error",
									toolError: {
										toolCallId,
										name,
										error: retryMessage,
										duration,
									},
								});
								throw retryErr;
							}
						}
						const declined = "Workspace policy: command approval declined.";
						broadcast({
							requestId: request.requestId,
							type: "tool_error",
							toolError: {
								toolCallId,
								name,
								error: declined,
								code: err.code,
							},
						});
						throw new Error(declined);
					}

					const duration = Date.now() - started;
					const message = err instanceof Error ? err.message : String(err);
					broadcast({
						requestId: request.requestId,
						type: "tool_error",
						toolError: { toolCallId, name, error: message, duration },
					});
					throw err;
				}
			},
		});
	}
	return set;
}
