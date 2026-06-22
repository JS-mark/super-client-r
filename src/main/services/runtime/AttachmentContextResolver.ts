/**
 * AttachmentContextResolver
 *
 * §14 minimal slice (Plan §9 attachment context modes).
 *
 * Reads text-like conversation attachments from the per-conversation
 * attachments directory and returns blocks suitable for inclusion in an
 * LLM prompt. Non-text or unknown extensions yield a `reference` block
 * (metadata only) so the model is still aware the file exists without
 * receiving the bytes.
 *
 * Out of scope (deferred):
 *  - vision / binary embedding
 *  - per-conversation token budgeting beyond the per-file byte cap
 *  - the `ask-before-read` and `ignore-for-model` context modes
 */

import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { extname, join } from "path";

import type { ResolvedAttachmentBlock } from "@super-client/shared-types";
import { getSessionStorage } from "../storage/SessionStorageService";
import { logger } from "../../utils/logger";
import { getRuntimePolicyService } from "./RuntimePolicyService";
import { getSessionRuntimeResolver } from "./SessionRuntimeResolver";

/** Default per-attachment byte budget: 64 KiB. */
const DEFAULT_MAX_BYTES = 64 * 1024;

/**
 * Extensions considered "text-like" — content is inlined into the prompt.
 * Extensions outside this set fall back to reference-only.
 */
const TEXT_LIKE_EXTENSIONS = new Set<string>([
	// Plain text / docs
	".txt",
	".md",
	".markdown",
	// Structured text
	".json",
	".yaml",
	".yml",
	".toml",
	".xml",
	".html",
	".css",
	// Source code
	".js",
	".ts",
	".tsx",
	".jsx",
	".py",
	".rs",
	".go",
	".java",
	".c",
	".h",
	".cpp",
	".hpp",
	".cs",
	".rb",
	".php",
	".sh",
	".bash",
	".sql",
	".swift",
	".kt",
	".gradle",
	".dockerfile",
	".gitignore",
]);

const TEXT_MIME_HINTS: Record<string, string> = {
	".txt": "text/plain",
	".md": "text/markdown",
	".markdown": "text/markdown",
	".json": "application/json",
	".yaml": "application/yaml",
	".yml": "application/yaml",
	".toml": "application/toml",
	".xml": "application/xml",
	".html": "text/html",
	".css": "text/css",
	".js": "application/javascript",
	".ts": "application/typescript",
	".tsx": "application/typescript",
	".jsx": "application/javascript",
	".py": "text/x-python",
	".rs": "text/x-rust",
	".go": "text/x-go",
	".java": "text/x-java",
	".c": "text/x-c",
	".h": "text/x-c",
	".cpp": "text/x-c++",
	".hpp": "text/x-c++",
	".cs": "text/x-csharp",
	".rb": "text/x-ruby",
	".php": "application/x-php",
	".sh": "application/x-sh",
	".bash": "application/x-sh",
	".sql": "application/sql",
	".swift": "text/x-swift",
	".kt": "text/x-kotlin",
	".gradle": "text/x-groovy",
	".dockerfile": "text/x-dockerfile",
	".gitignore": "text/plain",
};

interface ResolveArgs {
	conversationId: string;
	attachmentIds: string[];
	/** Per-attachment byte budget; defaults to 64 KiB. */
	maxBytesPerAttachment?: number;
}

export class AttachmentContextResolver {
	async resolve(args: ResolveArgs): Promise<ResolvedAttachmentBlock[]> {
		const { conversationId, attachmentIds } = args;
		const maxBytes = args.maxBytesPerAttachment ?? DEFAULT_MAX_BYTES;

		if (!attachmentIds || attachmentIds.length === 0) return [];

		let dir: string;
		try {
			dir = getSessionStorage().getAttachmentsDir(conversationId);
		} catch (err) {
			logger.warn(
				`[AttachmentContextResolver] getAttachmentsDir failed for ${conversationId}: ${
					err instanceof Error ? err.message : String(err)
				}`,
			);
			return attachmentIds.map((id) => referenceFallback(id));
		}

		// Build a single id→file map to avoid re-listing for every id.
		const fileByBasename = new Map<string, string>();
		if (existsSync(dir)) {
			try {
				for (const file of readdirSync(dir)) {
					const ext = extname(file);
					const base = ext ? file.slice(0, -ext.length) : file;
					fileByBasename.set(base, file);
				}
			} catch (err) {
				logger.warn(
					`[AttachmentContextResolver] readdir failed for ${dir}: ${
						err instanceof Error ? err.message : String(err)
					}`,
				);
			}
		}

		const blocks: ResolvedAttachmentBlock[] = [];
		for (const id of attachmentIds) {
			blocks.push(
				this.resolveOne(id, conversationId, dir, fileByBasename, maxBytes),
			);
		}
		return blocks;
	}

	private resolveOne(
		id: string,
		conversationId: string,
		dir: string,
		fileByBasename: Map<string, string>,
		maxBytes: number,
	): ResolvedAttachmentBlock {
		const fileName = fileByBasename.get(id);
		if (!fileName) {
			// File not located on disk — return reference fallback so the
			// model is still informed without crashing the send pipeline.
			return referenceFallback(id);
		}

		const fullPath = join(dir, fileName);
		if (!this.guardRead(conversationId, fullPath)) {
			return {
				attachmentId: id,
				fileName,
				size: 0,
				resolution: "reference",
			};
		}
		const ext = extname(fileName).toLowerCase();
		const mimeType = TEXT_MIME_HINTS[ext];

		let size = 0;
		try {
			size = statSync(fullPath).size;
		} catch (err) {
			logger.warn(
				`[AttachmentContextResolver] stat failed for ${fullPath}: ${
					err instanceof Error ? err.message : String(err)
				}`,
			);
			return {
				attachmentId: id,
				fileName,
				mimeType,
				size: 0,
				resolution: "reference",
			};
		}

		if (!TEXT_LIKE_EXTENSIONS.has(ext)) {
			return {
				attachmentId: id,
				fileName,
				mimeType,
				size,
				resolution: "reference",
			};
		}

		try {
			let text = readFileSync(fullPath, "utf-8");
			let truncated = false;
			if (Buffer.byteLength(text, "utf-8") > maxBytes) {
				// Slice on a byte boundary then decode safely.
				const buf = Buffer.from(text, "utf-8").subarray(0, maxBytes);
				text = buf.toString("utf-8");
				truncated = true;
			}
			return {
				attachmentId: id,
				fileName,
				mimeType,
				size,
				resolution: "text",
				text,
				truncated,
			};
		} catch (err) {
			logger.warn(
				`[AttachmentContextResolver] read failed for ${fullPath}: ${
					err instanceof Error ? err.message : String(err)
				}`,
			);
			return {
				attachmentId: id,
				fileName,
				mimeType,
				size,
				resolution: "reference",
			};
		}
	}

	private guardRead(conversationId: string, fullPath: string): boolean {
		let workspaceId = "default";
		let policy;
		try {
			const runtime = getSessionRuntimeResolver().resolve({
				sessionId: conversationId,
			});
			workspaceId = runtime.workspaceId;
			policy = runtime.runtimePolicy;
		} catch {
			// Missing runtime should not break attachment display; still audit.
		}
		const ctx = {
			workspaceId,
			sessionId: conversationId,
			source: "llm" as const,
			operation: "attachment.resolveContext",
			kind: "file-read" as const,
			target: fullPath,
		};
		const evaluation = getRuntimePolicyService().evaluate(ctx, policy);
		if (
			evaluation.decision === "deny" ||
			evaluation.decision === "needs-approval"
		) {
			getRuntimePolicyService().record(ctx, "denied", evaluation.reason);
			return false;
		}
		getRuntimePolicyService().record(ctx, "audit-only", evaluation.reason);
		return true;
	}
}

function referenceFallback(id: string): ResolvedAttachmentBlock {
	return {
		attachmentId: id,
		fileName: id,
		size: 0,
		resolution: "reference",
	};
}

let _resolver: AttachmentContextResolver | null = null;

export function getAttachmentContextResolver(): AttachmentContextResolver {
	if (!_resolver) _resolver = new AttachmentContextResolver();
	return _resolver;
}
