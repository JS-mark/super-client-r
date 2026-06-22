import type { ChatFileArtifact, ChatFileChangeSet } from "../types/electron";

/**
 * Pure helper that derives `ChatFileArtifact` and `ChatFileChangeSet` entries
 * from a completed tool_result. No React / Zustand dependencies — all inputs
 * are passed in.
 *
 * Scope (§17/§19): file-system MCP tools (single-file artifacts) plus a
 * minimal `git status --porcelain` / `git diff --name-only` parser to emit
 * change sets. Errors and unknown tool shapes yield empty arrays.
 */
export interface CaptureFileArtifactInput {
	conversationId: string;
	messageId: string;
	toolCallId: string;
	/** Tool name as emitted by the LLM. May or may not include a `serverId:` prefix. */
	toolName: string;
	toolInput: Record<string, unknown>;
	/** Raw tool result. Only string results are inspected for change sets. */
	toolResult?: unknown;
	isError: boolean;
}

export interface CaptureResult {
	artifacts: ChatFileArtifact[];
	changeSets: ChatFileChangeSet[];
}

function bareToolName(name: string): string {
	if (!name) return "";
	const idx = name.lastIndexOf(":");
	return idx >= 0 ? name.slice(idx + 1) : name;
}

function safeId(toolCallId: string, path: string): string {
	const sanitized = path.replace(/[^a-z0-9]/gi, "_");
	return `artifact_${toolCallId}_${sanitized}`.slice(0, 120);
}

function fileNameOf(p: string): string {
	const trimmed = p.replace(/[\\/]+$/, "");
	const parts = trimmed.split(/[\\/]/);
	return parts[parts.length - 1] || trimmed;
}

function extensionOf(name: string): string | undefined {
	const dot = name.lastIndexOf(".");
	if (dot <= 0 || dot === name.length - 1) return undefined;
	return name.slice(dot + 1).toLowerCase();
}

type ChangeFile = ChatFileChangeSet["files"][number];

/**
 * Map a 1-2 char porcelain status code to a ChangeFile status. Returns
 * `undefined` for codes we don't want to surface (e.g. ignored).
 */
function porcelainStatus(code: string): ChangeFile["status"] | undefined {
	const c = code.trim();
	if (!c) return undefined;
	// Untracked is `??`; treat as added.
	if (c === "??") return "added";
	// Use the first non-space character as the dominant status indicator.
	const first = c.replace(/\s/g, "")[0];
	switch (first) {
		case "A":
			return "added";
		case "M":
			return "modified";
		case "D":
			return "deleted";
		case "R":
			return "renamed";
		case "C":
			return "added"; // copied → treat as added
		default:
			return undefined;
	}
}

/**
 * Parse `git status --porcelain` output. Each line is `<XY> <path>` where
 * XY is two status chars. Returns parsed entries or an empty array.
 */
export function parseGitStatusPorcelain(raw: string): ChangeFile[] {
	const out: ChangeFile[] = [];
	const lines = raw.split(/\r?\n/);
	for (const line of lines) {
		if (!line.trim()) continue;
		// Porcelain v1: cols 0-1 = XY status, col 2 = space, col 3+ = path.
		// We accept slightly relaxed forms: optional leading spaces.
		const match = line.match(/^\s*(\S{1,2})\s+(.+?)\s*$/);
		if (!match) continue;
		const status = porcelainStatus(match[1]);
		if (!status) continue;
		let path = match[2];
		// Renames: `old -> new` — keep the new path.
		if (status === "renamed" && path.includes("->")) {
			const [, newPath] = path.split("->").map((s) => s.trim());
			if (newPath) path = newPath;
		}
		// Strip surrounding quotes (porcelain quotes paths with special chars).
		if (path.startsWith('"') && path.endsWith('"')) {
			path = path.slice(1, -1);
		}
		if (!path) continue;
		out.push({ path, status, additions: 0, deletions: 0 });
	}
	return out;
}

/**
 * Parse `git diff --name-only` output. Each non-empty line is a path.
 * Status is unknown → mark as modified.
 */
export function parseGitDiffNameOnly(raw: string): ChangeFile[] {
	const out: ChangeFile[] = [];
	for (const line of raw.split(/\r?\n/)) {
		const path = line.trim();
		if (!path) continue;
		out.push({ path, status: "modified", additions: 0, deletions: 0 });
	}
	return out;
}

function tryBuildChangeSetFromBash(
	args: CaptureFileArtifactInput,
): ChatFileChangeSet | undefined {
	const command = args.toolInput.command;
	if (typeof command !== "string") return undefined;
	if (typeof args.toolResult !== "string") return undefined;

	let files: ChangeFile[] = [];
	if (/\bgit\s+status\b.*--porcelain\b/.test(command)) {
		files = parseGitStatusPorcelain(args.toolResult);
	} else if (/\bgit\s+diff\b.*--name-only\b/.test(command)) {
		files = parseGitDiffNameOnly(args.toolResult);
	} else {
		return undefined;
	}

	if (files.length === 0) return undefined;

	return {
		id: `change_${args.toolCallId}`,
		conversationId: args.conversationId,
		messageId: args.messageId,
		files,
		additions: 0,
		deletions: 0,
	};
}

export function captureFileArtifactsFromToolResult(
	args: CaptureFileArtifactInput,
): CaptureResult {
	const empty: CaptureResult = { artifacts: [], changeSets: [] };
	if (args.isError) return empty;
	if (!args.conversationId || !args.messageId) return empty;

	const bare = bareToolName(args.toolName);

	// Single-file write/edit/create/read tools.
	let path: string | undefined;
	let kind: ChatFileArtifact["kind"] | undefined;

	switch (bare) {
		case "write_file":
		case "create_file": {
			const p = args.toolInput.path;
			if (typeof p === "string") {
				path = p;
				kind = "created";
			}
			break;
		}
		case "edit_file": {
			const p = args.toolInput.path;
			if (typeof p === "string") {
				path = p;
				kind = "modified";
			}
			break;
		}
		case "read_file": {
			const p = args.toolInput.path;
			if (typeof p === "string") {
				path = p;
				kind = "read";
			}
			break;
		}
		case "delete_file":
			// Deletions tracked via ChatFileChangeSet; bash branch covers git output.
			return empty;
		case "bash":
		case "shell":
		case "exec": {
			const cs = tryBuildChangeSetFromBash(args);
			return cs ? { artifacts: [], changeSets: [cs] } : empty;
		}
		default:
			// TODO(§19+): expand to multi-file tools like apply_patch / batch
			// MCP write tools once their result shapes are agreed.
			return empty;
	}

	if (!path || !kind) return empty;

	const name = fileNameOf(path);
	const artifact: ChatFileArtifact = {
		id: safeId(args.toolCallId, path),
		conversationId: args.conversationId,
		messageId: args.messageId,
		path,
		name,
		extension: extensionOf(name),
		kind,
		source: "tool",
		openTargets: [],
		policy: {
			canOpen: true,
			canReveal: true,
			canDiff: kind === "modified",
		},
	};

	return { artifacts: [artifact], changeSets: [] };
}
