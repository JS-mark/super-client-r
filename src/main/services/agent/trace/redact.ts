/**
 * AgentTrace 脱敏
 *
 * 详见 spec §17.6。三模式：
 *   - strict: API key 全 mask；attachment 内容只留 mime+size；prompt 截断 200 字
 *   - loose (默认): API key 仍 mask；prompt / attachment 完整保留——调试体验优先
 *   - off:   完全不脱敏；仅开发模式可选
 *
 * 实现保持纯函数 + 无副作用，便于单测。
 */

import type {
	AgentTraceRecord,
	AgentTraceRecordPayload,
	AgentTraceRedactionMode,
} from "@super-client/shared-types/agent-trace";

/** 常见敏感 key/header 名（不区分大小写）。 */
const SENSITIVE_KEYS = new Set([
	"apikey",
	"api_key",
	"api-key",
	"x-api-key",
	"authorization",
	"auth",
	"authtoken",
	"auth_token",
	"x-auth-token",
	"anthropic-api-key",
	"anthropic_auth_token",
	"openai-api-key",
	"openai_api_key",
	"bearer",
	"token",
	"access_token",
	"refresh_token",
]);

/** 形似 API key 的 token；保守覆盖 sk-/pk-/anth-/Bearer 前缀。 */
const KEY_LIKE_PATTERNS: RegExp[] = [
	/\bsk-(?:proj-)?[A-Za-z0-9_\-]{20,}\b/g,
	/\bpk-[A-Za-z0-9_\-]{20,}\b/g,
	/\banth(?:ropic)?-[A-Za-z0-9_\-]{20,}\b/g,
	/\bBearer\s+[A-Za-z0-9._\-]{20,}\b/gi,
];

const MASK = "***";
const PROMPT_TRUNCATE_LIMIT_STRICT = 200;

/**
 * 应用脱敏。
 *
 * 注：会对 record.payload 做深拷贝再修改，原 record 不变（trace 内部数据流单向）。
 */
export function redactRecord(
	record: AgentTraceRecord,
	mode: AgentTraceRedactionMode,
): AgentTraceRecord {
	if (mode === "off") return record;
	const cloned: AgentTraceRecord = {
		...record,
		payload: deepCloneJson(record.payload) as AgentTraceRecordPayload,
	};
	cloned.payload = redactPayload(cloned.payload, mode);
	return cloned;
}

/** 仅供单测使用的 helper。 */
export function redactPayload(
	payload: AgentTraceRecordPayload,
	mode: AgentTraceRedactionMode,
): AgentTraceRecordPayload {
	if (mode === "off") return payload;
	const masked = maskApiKeysDeep(payload) as AgentTraceRecordPayload;
	if (mode === "loose") return masked;
	// strict
	return strictenPayload(masked);
}

/** prompt 字符串截断；attachment 内容剥离。 */
function strictenPayload(
	payload: AgentTraceRecordPayload,
): AgentTraceRecordPayload {
	if (payload.kind !== "event") return payload;
	const ev = payload.event;
	// 只对包含完整 prompt / attachment 内容的事件做截断；当前 event 流里它们仅
	// 出现在 message.final 的 text / reasoning 上。
	if (ev.type === "message.final") {
		return {
			kind: "event",
			event: {
				...ev,
				text: truncate(ev.text, PROMPT_TRUNCATE_LIMIT_STRICT),
				reasoning: ev.reasoning
					? truncate(ev.reasoning, PROMPT_TRUNCATE_LIMIT_STRICT)
					: undefined,
			},
		};
	}
	if (ev.type === "text.delta" || ev.type === "reasoning.delta") {
		return {
			kind: "event",
			event: { ...ev, delta: truncate(ev.delta, PROMPT_TRUNCATE_LIMIT_STRICT) },
		};
	}
	return payload;
}

/**
 * 截断字符串。
 *
 * 注意：保留原字符长度（在末尾追加 `…(N more)`），便于调试时看到丢了多少。
 */
export function truncate(s: string, limit: number): string {
	if (s.length <= limit) return s;
	const dropped = s.length - limit;
	return `${s.slice(0, limit)}…(${dropped} more)`;
}

/**
 * 深度遍历，对常见敏感 key 名 mask、对 string value 应用 KEY_LIKE_PATTERNS。
 */
export function maskApiKeysDeep(value: unknown): unknown {
	if (value === null || value === undefined) return value;
	if (typeof value === "string") return maskKeyLikeString(value);
	if (typeof value !== "object") return value;
	if (Array.isArray(value)) return value.map(maskApiKeysDeep);
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
		if (SENSITIVE_KEYS.has(k.toLowerCase())) {
			out[k] = MASK;
		} else {
			out[k] = maskApiKeysDeep(v);
		}
	}
	return out;
}

function maskKeyLikeString(s: string): string {
	let out = s;
	for (const p of KEY_LIKE_PATTERNS) {
		out = out.replace(p, MASK);
	}
	return out;
}

function deepCloneJson<T>(v: T): T {
	// trace payload 受限于 IPC 可序列化，直接 JSON 往返。
	return JSON.parse(JSON.stringify(v ?? null)) as T;
}
