// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
	APP_DATA_PLACEHOLDER,
	REDACTED_VALUE,
	redactDiagnosticValue,
	redactHeaders,
	redactPath,
	redactRemoteId,
	redactUrl,
} from "../redaction";

const context = {
	homeDir: "/Users/mark",
	appUserDataDir: "/Users/mark/Library/Application Support/Super Client",
};

describe("privacy redaction", () => {
	it("redacts the app userData path before the home path", () => {
		expect(
			redactPath(
				"/Users/mark/Library/Application Support/Super Client/projects/p1/session.jsonl",
				context,
			),
		).toBe(`${APP_DATA_PLACEHOLDER}/projects/p1/session.jsonl`);
	});

	it("redacts home paths in standalone paths and diagnostic text", () => {
		expect(redactPath("/Users/mark/code/app", context)).toBe("~/code/app");
		expect(
			redactPath("cwd=/Users/mark/code/app output=/tmp/super-client", context),
		).toBe("cwd=~/code/app output=/tmp/super-client");
	});

	it("redacts only secret URL query values", () => {
		expect(redactUrl("https://example.com/callback?token=abc&x=1")).toBe(
			`https://example.com/callback?token=${REDACTED_VALUE}&x=1`,
		);
		expect(redactUrl("GET https://example.com/path?api_key=k&name=visible")).toBe(
			`GET https://example.com/path?api_key=${REDACTED_VALUE}&name=visible`,
		);
	});

	it("redacts sensitive headers", () => {
		expect(
			redactHeaders({
				authorization: "Bearer abc",
				Cookie: "sid=secret",
				"x-api-key": "key",
				accept: "application/json",
			}),
		).toEqual({
			authorization: REDACTED_VALUE,
			Cookie: REDACTED_VALUE,
			"x-api-key": REDACTED_VALUE,
			accept: "application/json",
		});
	});

	it("redacts nested secrets, paths, URLs, and remote ids without mutating input", () => {
		const input = {
			cwd: "/Users/mark/code/app",
			callback: "https://example.com/oauth?code=secret&state=ok",
			headers: {
				authorization: "Bearer super-secret-token",
				accept: "application/json",
			},
			remote: {
				botId: "bot_1234567890abcdef",
				chatId: "chat_abcdef1234567890",
			},
			items: [{ apiKey: "sk-proj-AAAABBBBCCCCDDDDEEEEFFFF" }],
		};

		const output = redactDiagnosticValue(input, context);

		expect(output).toEqual({
			cwd: "~/code/app",
			callback: `https://example.com/oauth?code=${REDACTED_VALUE}&state=ok`,
			headers: {
				authorization: REDACTED_VALUE,
				accept: "application/json",
			},
			remote: {
				botId: "...cdef",
				chatId: "...7890",
			},
			items: [{ apiKey: REDACTED_VALUE }],
		});
		expect(input.remote.botId).toBe("bot_1234567890abcdef");
	});

	it("shows only the last characters of remote ids", () => {
		expect(redactRemoteId("remote-chat-abcdef")).toBe("...cdef");
		expect(redactRemoteId("remote-chat-abcdef", 6)).toBe("...abcdef");
	});
});
