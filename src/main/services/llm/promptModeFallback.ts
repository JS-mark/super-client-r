/**
 * Prompt-based Tool Calling Fallback.
 *
 * For models that do NOT support native function calling (e.g. DeepSeek-R1),
 * we inject tool descriptions into the system prompt and parse tool
 * invocations from the model's text output.
 *
 * Recognised XML tags (case-insensitive, self-closing or paired):
 *   <tool_call>  … </tool_call>
 *   <tool_use>   … </tool_use>
 *
 * The JSON payload inside each tag can be either:
 *   { "name": "…", "arguments": { … } }          — canonical
 *   { "name": "…", "parameters": { … } }          — alias
 *   { "name": "…", "input": { … } }               — Anthropic style
 */

import type { ChatCompletionRequest } from "../../ipc/types";

export interface ParsedToolCall {
	id: string;
	name: string;
	arguments: Record<string, unknown>;
}

/**
 * Build a system prompt section describing available tools for prompt-based
 * tool calling.
 */
export function buildToolPrompt(
	tools: ChatCompletionRequest["tools"],
): string {
	if (!tools || tools.length === 0) return "";

	const toolDescriptions = tools
		.map((t) => {
			const params = JSON.stringify(t.function.parameters, null, 2);
			return [
				`### ${t.function.name}`,
				t.function.description,
				"Parameters:",
				"```json",
				params,
				"```",
			].join("\n");
		})
		.join("\n\n");

	return `

--- Available Tools ---
You have access to the following tools. To call a tool, output a <tool_call> or <tool_use> XML block containing a JSON object with "name" and "arguments".

You may make multiple tool calls in a single response. Each call MUST be wrapped in its own XML tag.

Format (both are accepted):

<tool_call>
{"name": "tool_name", "arguments": {"key": "value"}}
</tool_call>

<tool_use>
{"name": "tool_name", "arguments": {"key": "value"}}
</tool_use>

After you output tool calls the system will execute them and return results in the next message. You can then continue your response.

IMPORTANT:
- You MUST use the XML tag format above. Do NOT merely describe what you would do — actually invoke the tool.
- Always wait for tool results before telling the user the outcome.

${toolDescriptions}`;
}

/**
 * Pattern that matches <tool_call>…</tool_call> or <tool_use>…</tool_use>
 * (case-insensitive).
 */
const TOOL_BLOCK_RE =
	/(?:<\s*)?(tool_call|tool_use)\s*>\s*([\s\S]*?)(?:<\s*\/\s*\1\s*>|$)/gi;

function extractJsonObject(raw: string): string {
	const start = raw.indexOf("{");
	if (start < 0) return raw.trim();
	let depth = 0;
	let inString = false;
	let escaped = false;
	for (let i = start; i < raw.length; i += 1) {
		const ch = raw[i];
		if (inString) {
			if (escaped) {
				escaped = false;
			} else if (ch === "\\") {
				escaped = true;
			} else if (ch === '"') {
				inString = false;
			}
			continue;
		}
		if (ch === '"') {
			inString = true;
			continue;
		}
		if (ch === "{") depth += 1;
		if (ch === "}") {
			depth -= 1;
			if (depth === 0) return raw.slice(start, i + 1);
		}
	}
	return raw.slice(start).trim();
}

/**
 * Try to extract a valid tool call from a raw JSON string found inside
 * a tool XML block. Handles several common payload shapes.
 */
function tryParseToolPayload(raw: string, idx: number): ParsedToolCall | null {
	let obj: Record<string, unknown>;
	try {
		obj = JSON.parse(extractJsonObject(raw));
	} catch {
		return null;
	}

	const name =
		(typeof obj.name === "string" && obj.name) ||
		(typeof obj.function === "string" && obj.function) ||
		(typeof obj.tool === "string" && obj.tool);

	if (!name) return null;

	const args: Record<string, unknown> =
		(typeof obj.arguments === "object" && obj.arguments !== null
			? (obj.arguments as Record<string, unknown>)
			: undefined) ??
		(typeof obj.parameters === "object" && obj.parameters !== null
			? (obj.parameters as Record<string, unknown>)
			: undefined) ??
		(typeof obj.input === "object" && obj.input !== null
			? (obj.input as Record<string, unknown>)
			: undefined) ??
		{};

	return {
		id: `prompt_tc_${Date.now()}_${idx}`,
		name,
		arguments: args,
	};
}

/**
 * Parse tool invocation blocks from model text output.
 *
 * @returns parsed tool calls and the text with all tool blocks stripped.
 */
export function parseToolCallsFromText(text: string): {
	cleanText: string;
	toolCalls: ParsedToolCall[];
} {
	const toolCalls: ParsedToolCall[] = [];
	let match: RegExpExecArray | null;
	let idx = 0;

	// Reset lastIndex because the regex is global+sticky
	TOOL_BLOCK_RE.lastIndex = 0;

	while ((match = TOOL_BLOCK_RE.exec(text)) !== null) {
		const payload = match[2];
		const tc = tryParseToolPayload(payload, idx);
		if (tc) {
			toolCalls.push(tc);
			idx++;
		}
	}

	const cleanText = text.replace(TOOL_BLOCK_RE, "").trim();
	return { cleanText, toolCalls };
}

/**
 * Quick check: does the text contain any tool invocation blocks?
 */
export function hasToolBlocks(text: string): boolean {
	TOOL_BLOCK_RE.lastIndex = 0;
	return TOOL_BLOCK_RE.test(text);
}
