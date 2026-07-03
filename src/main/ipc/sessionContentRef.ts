import { TextDecoder } from "node:util";

import type { SessionContentRefReadResult } from "@super-client/shared-types/electron-api";
import type { ReadContentRefResult } from "../services/storage/SessionStorageService";

const UTF8_DECODER = new TextDecoder("utf-8", { fatal: false });

const TEXT_MEDIA_TYPES = new Set([
	"application/javascript",
	"application/json",
	"application/ld+json",
	"application/manifest+json",
	"application/typescript",
	"application/x-javascript",
	"application/x-ndjson",
	"application/x-yaml",
	"application/xml",
	"application/yaml",
	"image/svg+xml",
]);

export function isTextLikeMediaType(mediaType?: string): boolean {
	const normalized = mediaType?.split(";")[0]?.trim().toLowerCase();
	if (!normalized) return false;
	return (
		normalized.startsWith("text/") ||
		TEXT_MEDIA_TYPES.has(normalized) ||
		normalized.endsWith("+json") ||
		normalized.endsWith("+xml") ||
		normalized.endsWith("+yaml") ||
		normalized.endsWith("+yml")
	);
}

export function toSessionContentRefReadResult(
	ref: ReadContentRefResult,
): SessionContentRefReadResult {
	const result: SessionContentRefReadResult = {
		contentRef: ref.contentRef,
		byteLength: ref.byteLength,
		totalByteLength: ref.totalByteLength,
		offset: ref.offset,
		bytesRead: ref.bytesRead,
		truncated: ref.truncated,
		...(ref.nextOffset !== undefined ? { nextOffset: ref.nextOffset } : {}),
		...(ref.mediaType ? { mediaType: ref.mediaType } : {}),
		...(ref.source ? { source: ref.source } : {}),
	};

	if (!isTextLikeMediaType(ref.mediaType)) {
		return result;
	}

	return { ...result, text: UTF8_DECODER.decode(ref.data) };
}
