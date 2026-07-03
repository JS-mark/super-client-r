export const REDACTED_VALUE = "<redacted>";
export const APP_DATA_PLACEHOLDER = "<app-data>";

export interface PrivacyRedactionContext {
	homeDir?: string;
	appUserDataDir?: string;
	remoteIdVisibleChars?: number;
}

type HeaderLike =
	| Record<string, unknown>
	| Iterable<[string, unknown]>
	| { forEach: (callback: (value: unknown, key: string) => void) => void };

const SENSITIVE_KEY_NAMES = new Set([
	"apikey",
	"api_key",
	"api-key",
	"xapikey",
	"x_api_key",
	"x-api-key",
	"authorization",
	"proxyauthorization",
	"proxy_authorization",
	"proxy-authorization",
	"cookie",
	"setcookie",
	"set_cookie",
	"set-cookie",
	"auth",
	"authtoken",
	"auth_token",
	"auth-token",
	"token",
	"accesstoken",
	"access_token",
	"access-token",
	"refreshtoken",
	"refresh_token",
	"refresh-token",
	"clientsecret",
	"client_secret",
	"client-secret",
	"password",
	"secret",
	"privatekey",
	"private_key",
	"private-key",
]);

const URL_QUERY_SECRET_NAMES = new Set([
	"apikey",
	"api_key",
	"api-key",
	"key",
	"token",
	"access_token",
	"access-token",
	"refresh_token",
	"refresh-token",
	"auth",
	"authorization",
	"client_secret",
	"client-secret",
	"password",
	"secret",
	"code",
]);

const REMOTE_ID_KEYS = new Set([
	"botid",
	"bot_id",
	"bot-id",
	"chatid",
	"chat_id",
	"chat-id",
	"remoteid",
	"remote_id",
	"remote-id",
	"remotebotid",
	"remote_bot_id",
	"remote-bot-id",
	"remotechatid",
	"remote_chat_id",
	"remote-chat-id",
	"senderid",
	"sender_id",
	"sender-id",
	"remotesenderid",
	"remote_sender_id",
	"remote-sender-id",
]);

const KEY_LIKE_PATTERNS: Array<[RegExp, string]> = [
	[/\bBearer\s+[A-Za-z0-9._~+\-/=]{12,}\b/gi, `Bearer ${REDACTED_VALUE}`],
	[/\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}\b/g, REDACTED_VALUE],
	[/\bpk-[A-Za-z0-9_-]{16,}\b/g, REDACTED_VALUE],
	[/\banth(?:ropic)?-[A-Za-z0-9_-]{16,}\b/gi, REDACTED_VALUE],
];

const URL_PATTERN = /\bhttps?:\/\/[^\s"'<>]+/gi;

export function redactDiagnosticValue(
	value: unknown,
	context: PrivacyRedactionContext = {},
): unknown {
	if (typeof value === "string") {
		return redactString(value, context);
	}
	if (Array.isArray(value)) {
		return value.map((item) => redactDiagnosticValue(item, context));
	}
	if (!value || typeof value !== "object") {
		return value;
	}

	const out: Record<string, unknown> = {};
	for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
		if (isSensitiveKey(key)) {
			out[key] = nestedValue ? REDACTED_VALUE : nestedValue;
		} else if (isRemoteIdKey(key)) {
			out[key] =
				typeof nestedValue === "string"
					? redactRemoteId(nestedValue, context.remoteIdVisibleChars)
					: REDACTED_VALUE;
		} else {
			out[key] = redactDiagnosticValue(nestedValue, context);
		}
	}
	return out;
}

export function redactPath(
	pathOrText: string,
	context: PrivacyRedactionContext = {},
): string {
	let out = pathOrText;
	if (context.appUserDataDir) {
		out = replacePathPrefix(out, context.appUserDataDir, APP_DATA_PLACEHOLDER);
	}
	if (context.homeDir) {
		out = replacePathPrefix(out, context.homeDir, "~");
	}
	return out;
}

export function redactUrl(urlOrText: string): string {
	if (urlOrText.startsWith("?")) {
		return redactQueryString(urlOrText);
	}
	return urlOrText.replace(URL_PATTERN, (match) => redactSingleUrl(match));
}

export function redactHeaders(headers: HeaderLike): Record<string, unknown> {
	const out: Record<string, unknown> = {};

	if (isHeaderForEach(headers)) {
		headers.forEach((value, key) => {
			out[key] = isSensitiveKey(key) ? REDACTED_VALUE : value;
		});
		return out;
	}

	if (isIterableHeaders(headers)) {
		for (const [key, value] of headers) {
			out[key] = isSensitiveKey(key) ? REDACTED_VALUE : value;
		}
		return out;
	}

	for (const [key, value] of Object.entries(headers)) {
		out[key] = isSensitiveKey(key) ? REDACTED_VALUE : value;
	}
	return out;
}

export function redactRemoteId(value: string, visibleChars = 4): string {
	if (!value) return value;
	const keep = Math.max(1, visibleChars);
	return `...${value.slice(-keep)}`;
}

function redactString(value: string, context: PrivacyRedactionContext): string {
	let out = redactPath(value, context);
	out = redactUrl(out);
	for (const [pattern, replacement] of KEY_LIKE_PATTERNS) {
		out = out.replace(pattern, replacement);
	}
	return out;
}

function redactSingleUrl(rawUrl: string): string {
	try {
		const url = new URL(rawUrl);
		redactSearchParams(url.searchParams);
		if (url.hash.startsWith("#")) {
			const hashText = url.hash.slice(1);
			if (hashText.includes("=")) {
				const hashParams = new URLSearchParams(hashText);
				redactSearchParams(hashParams);
				url.hash = hashParams.toString();
			}
		}
		return formatRedactionPlaceholders(url.toString());
	} catch {
		return rawUrl;
	}
}

function redactQueryString(query: string): string {
	const prefix = query.startsWith("?") ? "?" : "";
	const params = new URLSearchParams(prefix ? query.slice(1) : query);
	redactSearchParams(params);
	return formatRedactionPlaceholders(`${prefix}${params.toString()}`);
}

function redactSearchParams(params: URLSearchParams): void {
	for (const key of Array.from(params.keys())) {
		if (isUrlQuerySecretKey(key)) {
			params.set(key, REDACTED_VALUE);
		}
	}
}

function replacePathPrefix(text: string, prefix: string, replacement: string): string {
	const normalizedPrefix = trimTrailingSeparators(prefix);
	if (!normalizedPrefix) return text;
	const pattern = new RegExp(`${escapeRegExp(normalizedPrefix)}(?=$|[/\\\\])`, "g");
	return text.replace(pattern, replacement);
}

function trimTrailingSeparators(value: string): string {
	return value.replace(/[/\\]+$/g, "");
}

function isSensitiveKey(key: string): boolean {
	return SENSITIVE_KEY_NAMES.has(normalizeKey(key));
}

function isUrlQuerySecretKey(key: string): boolean {
	return URL_QUERY_SECRET_NAMES.has(normalizeKey(key));
}

function isRemoteIdKey(key: string): boolean {
	return REMOTE_ID_KEYS.has(normalizeKey(key));
}

function normalizeKey(key: string): string {
	return key.trim().toLowerCase();
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatRedactionPlaceholders(value: string): string {
	return value.replace(/%3Credacted%3E/gi, REDACTED_VALUE);
}

function isHeaderForEach(value: HeaderLike): value is {
	forEach: (callback: (value: unknown, key: string) => void) => void;
} {
	return typeof (value as { forEach?: unknown }).forEach === "function";
}

function isIterableHeaders(value: HeaderLike): value is Iterable<[string, unknown]> {
	return typeof (value as { [Symbol.iterator]?: unknown })[Symbol.iterator] ===
		"function";
}
