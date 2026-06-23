/**
 * Convert the legacy OpenAI-shaped message array the renderer/HTTP route
 * sends us into AI SDK `ModelMessage[]`.
 *
 * Consecutive `role:"tool"` messages are coalesced into a single tool turn
 * because the AI SDK groups tool results inside one `tool` message — the
 * same pattern the existing Anthropic branch already follows.
 */

import type { ModelMessage } from "ai";
import type { ChatCompletionRequest } from "../../ipc/types";

type InMsg = ChatCompletionRequest["messages"][number];

export function toModelMessages(messages: InMsg[]): ModelMessage[] {
	const out: ModelMessage[] = [];
	for (const msg of messages) {
		if (!("role" in msg)) continue;

		if (msg.role === "system" && typeof msg.content === "string") {
			out.push({ role: "system", content: msg.content });
			continue;
		}

		if (msg.role === "user" && typeof msg.content === "string") {
			out.push({ role: "user", content: msg.content });
			continue;
		}

		if (msg.role === "assistant") {
			const toolCalls =
				"tool_calls" in msg && Array.isArray(msg.tool_calls)
					? msg.tool_calls
					: undefined;
			if (toolCalls && toolCalls.length > 0) {
				const parts: Array<
					| { type: "text"; text: string }
					| {
							type: "tool-call";
							toolCallId: string;
							toolName: string;
							input: unknown;
					  }
				> = [];
				if (typeof msg.content === "string" && msg.content) {
					parts.push({ type: "text", text: msg.content });
				}
				for (const tc of toolCalls) {
					let input: unknown = {};
					try {
						input = tc.function.arguments
							? JSON.parse(tc.function.arguments)
							: {};
					} catch {
						input = {};
					}
					parts.push({
						type: "tool-call",
						toolCallId: tc.id,
						toolName: tc.function.name,
						input,
					});
				}
				out.push({ role: "assistant", content: parts });
			} else if (typeof msg.content === "string") {
				out.push({ role: "assistant", content: msg.content });
			}
			continue;
		}

		if (msg.role === "tool" && "tool_call_id" in msg) {
			const part = {
				type: "tool-result" as const,
				toolCallId: msg.tool_call_id,
				toolName: "",
				output: { type: "text" as const, value: msg.content },
			};
			const last = out[out.length - 1];
			if (last && last.role === "tool" && Array.isArray(last.content)) {
				(last.content as unknown as Array<typeof part>).push(part);
			} else {
				out.push({ role: "tool", content: [part] } as ModelMessage);
			}
			continue;
		}
	}
	return out;
}
