const ASSISTANT_SENTINELS = [
	"<|eom|>",
	"<|endoftext|>",
	"<|end_of_text|>",
	"<|im_end|>",
] as const;

const ASSISTANT_SENTINEL_PATTERN = new RegExp(
	ASSISTANT_SENTINELS.map((token) =>
		token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
	).join("|"),
	"g",
);

const COMPLETE_TOOL_BLOCK_PATTERN =
	/(?:<\s*)?(?:tool_call|tool_use)\s*>\s*[\s\S]*?(?:<\s*\/\s*(?:tool_call|tool_use)\s*>|$)/gi;

const DANGLING_TOOL_MARKERS = [
	"<tool_call",
	"<tool_use",
	"tool_call>",
	"tool_use>",
	"tool_call",
	"tool_use",
] as const;

function stripDanglingSentinelPrefix(content: string): string {
	for (const token of ASSISTANT_SENTINELS) {
		for (let length = token.length - 1; length > 0; length -= 1) {
			const prefix = token.slice(0, length);
			if (content.endsWith(prefix)) {
				return content.slice(0, -length);
			}
		}
	}
	return content;
}

function stripToolCallBlocks(content: string): string {
	let cleaned = content.replace(COMPLETE_TOOL_BLOCK_PATTERN, "");
	const lower = cleaned.toLowerCase();
	let firstMarker = -1;
	for (const marker of DANGLING_TOOL_MARKERS) {
		const index = lower.lastIndexOf(marker);
		if (index < 0) continue;
		const after = cleaned.slice(index + marker.length);
		const looksLikeToolBlock =
			marker.startsWith("<") ||
			/^\s*(?:>|[:：])?\s*\{/.test(after);
		if (looksLikeToolBlock && (firstMarker < 0 || index < firstMarker)) {
			firstMarker = index;
		}
	}
	if (firstMarker >= 0) {
		cleaned = cleaned.slice(0, firstMarker);
	}
	return cleaned;
}

/**
 * Test whether a single trimmed line is a "naked" tool-call JSON envelope —
 * i.e. the kind some models emit as plain text when running in prompt-mode
 * tool-calling (no native function calling). Recognised shapes:
 *
 *   {"name": "<tool>", "arguments": {...}}
 *   {"tool_name": "<tool>", "parameters": {...}}
 *   {"function": "<tool>", "args": {...}}
 *
 * Must be a JSON-parseable object with exactly the recognised key pair (extra
 * unrelated keys → not a tool envelope, leave it alone). Conservative on
 * purpose: legitimate JSON the model is discussing must survive.
 */
function isNakedToolCallEnvelope(trimmed: string): boolean {
	if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return false;
	if (trimmed.length < 12) return false; // too short to carry name+args
	let parsed: unknown;
	try {
		parsed = JSON.parse(trimmed);
	} catch {
		return false;
	}
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
	const obj = parsed as Record<string, unknown>;
	const namePairs: Array<[string, string]> = [
		["name", "arguments"],
		["tool_name", "parameters"],
		["function", "args"],
		["tool", "input"],
	];
	for (const [nameKey, argsKey] of namePairs) {
		const name = obj[nameKey];
		const args = obj[argsKey];
		if (
			typeof name === "string" &&
			args !== null &&
			typeof args === "object"
		) {
			return true;
		}
	}
	return false;
}

/**
 * Strip standalone tool-call JSON lines from assistant content. Single-line
 * envelopes are handled directly; multi-line envelopes (the LLM pretty-prints
 * the JSON across several lines) are detected by accumulating brace-balanced
 * runs that start at the beginning of a line.
 *
 * Code-fenced blocks (```json ... ```) are NOT touched — the user / model may
 * be explicitly documenting the schema.
 */
function stripNakedToolCallEnvelopes(content: string): string {
	if (!content.includes("{")) return content;

	// Mask fenced code blocks so we don't accidentally strip them.
	const fences: string[] = [];
	const masked = content.replace(/```[\s\S]*?```/g, (m) => {
		fences.push(m);
		return `\u0000FENCE${fences.length - 1}\u0000`;
	});

	const lines = masked.split(/\r?\n/);
	const result: string[] = [];
	let i = 0;
	while (i < lines.length) {
		const line = lines[i];
		const trimmed = line.trim();

		// Fast path: single-line envelope.
		if (isNakedToolCallEnvelope(trimmed)) {
			i += 1;
			continue;
		}

		// Multi-line: a `{` at the start of a (trimmed) line — try to find a
		// matching `}` by brace-balance, then test the joined block.
		if (trimmed.startsWith("{") && !trimmed.endsWith("}")) {
			let depth = 0;
			let endLine = -1;
			for (let j = i; j < lines.length; j += 1) {
				for (const ch of lines[j]) {
					if (ch === "{") depth += 1;
					else if (ch === "}") depth -= 1;
				}
				if (depth === 0) {
					endLine = j;
					break;
				}
				// Bail out if the block grows unreasonably long — likely not
				// a tool call envelope, prevents pathological scans.
				if (j - i > 50) break;
			}
			if (endLine > i) {
				const block = lines.slice(i, endLine + 1).join("\n").trim();
				if (isNakedToolCallEnvelope(block)) {
					i = endLine + 1;
					continue;
				}
			}
		}

		result.push(line);
		i += 1;
	}

	// Unmask fences and collapse runs of blank lines left by drops.
	// Built via RegExp constructor (not a /.../ literal) so the null-byte
	// sentinel doesn't trip no-control-regex — the \u0000 markers are
	// intentional: they can't appear in normal assistant text.
	const fenceSentinel = String.fromCharCode(0);
	const unmaskFences = new RegExp(
		`${fenceSentinel}FENCE(\\d+)${fenceSentinel}`,
		"g",
	);
	return result
		.join("\n")
		.replace(unmaskFences, (_, n) => fences[Number(n)])
		.replace(/\n{3,}/g, "\n\n");
}

export function sanitizeAssistantContent(content: string): string {
	return stripDanglingSentinelPrefix(
		stripNakedToolCallEnvelopes(
			stripToolCallBlocks(content).replace(ASSISTANT_SENTINEL_PATTERN, ""),
		),
	);
}
