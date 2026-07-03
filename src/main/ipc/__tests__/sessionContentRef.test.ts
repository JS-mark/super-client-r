// @vitest-environment node

import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";

import {
	isTextLikeMediaType,
	toSessionContentRefReadResult,
} from "../sessionContentRef";

const contentRef =
	"session-content://v1/tool-outputs/content-refs/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

describe("session content ref IPC mapper", () => {
	it("includes UTF-8 text for explicit text-like payloads", () => {
		const result = toSessionContentRefReadResult({
			contentRef,
			byteLength: 13,
			sha256: "a".repeat(64),
			mediaType: "text/plain; charset=utf-8",
			source: "assistant",
			data: Buffer.from("hello session", "utf-8"),
			offset: 0,
			bytesRead: 13,
			totalByteLength: 13,
			truncated: false,
		});

		expect(result).toEqual({
			contentRef,
			byteLength: 13,
			totalByteLength: 13,
			offset: 0,
			bytesRead: 13,
			truncated: false,
			mediaType: "text/plain; charset=utf-8",
			source: "assistant",
			text: "hello session",
		});
		expect(result).not.toHaveProperty("sha256");
		expect(result).not.toHaveProperty("data");
	});

	it("recognizes structured text media types", () => {
		expect(isTextLikeMediaType("application/json")).toBe(true);
		expect(isTextLikeMediaType("application/vnd.example+json")).toBe(true);
		expect(isTextLikeMediaType("image/svg+xml")).toBe(true);
		expect(isTextLikeMediaType("application/octet-stream")).toBe(false);
	});

	it("returns metadata only for binary payloads", () => {
		const result = toSessionContentRefReadResult({
			contentRef,
			byteLength: 4,
			sha256: "a".repeat(64),
			mediaType: "application/octet-stream",
			source: "tool",
			data: Buffer.from([0, 1, 2, 3]),
			offset: 0,
			bytesRead: 4,
			totalByteLength: 4,
			truncated: false,
		});

		expect(result).toEqual({
			contentRef,
			byteLength: 4,
			totalByteLength: 4,
			offset: 0,
			bytesRead: 4,
			truncated: false,
			mediaType: "application/octet-stream",
			source: "tool",
		});
	});

	it("decodes text-like payload previews with replacement characters", () => {
		const result = toSessionContentRefReadResult({
			contentRef,
			byteLength: 2,
			sha256: "a".repeat(64),
			mediaType: "text/plain",
			data: Buffer.from([0xc3, 0x28]),
			offset: 0,
			bytesRead: 2,
			totalByteLength: 2,
			truncated: false,
		});

		expect(result).toEqual({
			contentRef,
			byteLength: 2,
			totalByteLength: 2,
			offset: 0,
			bytesRead: 2,
			truncated: false,
			mediaType: "text/plain",
			text: "\uFFFD(",
		});
	});

	it("includes pagination metadata for truncated previews", () => {
		const result = toSessionContentRefReadResult({
			contentRef,
			byteLength: 11,
			sha256: "a".repeat(64),
			mediaType: "text/plain",
			data: Buffer.from("hello", "utf-8"),
			offset: 0,
			bytesRead: 5,
			totalByteLength: 11,
			truncated: true,
			nextOffset: 5,
		});

		expect(result).toEqual({
			contentRef,
			byteLength: 11,
			totalByteLength: 11,
			offset: 0,
			bytesRead: 5,
			truncated: true,
			nextOffset: 5,
			mediaType: "text/plain",
			text: "hello",
		});
	});
});
