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
import type { ToolExecutor } from "./LLMService";

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
}

export function buildToolSet(args: BuildToolSetArgs): ToolSet | undefined {
	const {
		request,
		toolExecutor,
		broadcast,
		checkPermission,
		evaluateRuntimePolicy,
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

				const policy = evaluateRuntimePolicy(name, argsObj);
				if (!policy.allowed) {
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

				const started = Date.now();
				try {
					const result = await toolExecutor(name, argsObj);
					const duration = Date.now() - started;
					broadcast({
						requestId: request.requestId,
						type: "tool_result",
						toolResult: { toolCallId, name, result, duration },
					});
					return result;
				} catch (err) {
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
