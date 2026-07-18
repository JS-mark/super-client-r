import type {
	ChatFileArtifact,
	ChatFileChangeSet,
	FileOpenTarget,
} from "../types/electron";
import { toRedactedPathLabel } from "./privacyDisplay";

export interface ArtifactLibraryItem {
	id: string;
	conversationId: string;
	messageId: string;
	kind: ChatFileArtifact["kind"];
	source: ChatFileArtifact["source"];
	name: string;
	displayPath: string;
	fullPath: string;
	extension?: string;
	additions?: number;
	deletions?: number;
	canReveal: boolean;
	canOpen: boolean;
	origin: "artifact" | "change";
	canDiff?: boolean;
	diffPreview?: string;
	openTargets?: FileOpenTarget[];
}

export interface BuildArtifactLibraryInput {
	conversationId: string | null | undefined;
	artifacts: ChatFileArtifact[];
	changeSets: ChatFileChangeSet[];
}

function normalizePath(path: string): string {
	return path.replace(/\\/g, "/");
}

function basename(path: string): string {
	const normalized = normalizePath(path);
	return normalized.split("/").filter(Boolean).at(-1) ?? normalized;
}

function extOf(path: string): string | undefined {
	const name = basename(path);
	const idx = name.lastIndexOf(".");
	return idx >= 0 ? name.slice(idx + 1) : undefined;
}

function displayPathForArtifact(artifact: ChatFileArtifact): string {
	return artifact.relativePath?.trim() || toRedactedPathLabel(artifact.path);
}

function displayPathForChange(path: string): string {
	return toRedactedPathLabel(path);
}

export function buildArtifactLibraryItems(
	input: BuildArtifactLibraryInput,
): ArtifactLibraryItem[] {
	const { conversationId } = input;
	if (!conversationId) return [];

	const items: ArtifactLibraryItem[] = [];
	const seen = new Set<string>();
	const push = (item: ArtifactLibraryItem): void => {
		const key = `${item.messageId}:${item.kind}:${normalizePath(item.fullPath)}`;
		if (seen.has(key)) return;
		seen.add(key);
		items.push(item);
	};

	for (const artifact of input.artifacts) {
		if (artifact.conversationId !== conversationId) continue;
		push({
			id: artifact.id,
			conversationId: artifact.conversationId,
			messageId: artifact.messageId,
			kind: artifact.kind,
			source: artifact.source,
			name: artifact.name,
			displayPath: displayPathForArtifact(artifact),
			fullPath: artifact.path,
			...(artifact.extension ? { extension: artifact.extension } : {}),
			canReveal: artifact.policy.canReveal !== false,
			canOpen: artifact.policy.canOpen !== false,
			canDiff: artifact.policy.canDiff,
			openTargets: artifact.openTargets,
			origin: "artifact",
		});
	}

	for (const changeSet of input.changeSets) {
		if (changeSet.conversationId !== conversationId) continue;
		for (const file of changeSet.files) {
			const extension = extOf(file.path);
			push({
				id: `${changeSet.id}:${file.path}`,
				conversationId: changeSet.conversationId,
				messageId: changeSet.messageId,
				kind: file.status === "added" ? "created" : "modified",
				source: "tool",
				name: basename(file.path),
				displayPath: displayPathForChange(file.path),
				fullPath: file.path,
				...(extension ? { extension } : {}),
				...(file.diffPreview ? { diffPreview: file.diffPreview } : {}),
				additions: file.additions,
				deletions: file.deletions,
				canReveal: file.status !== "deleted",
				canOpen: file.status !== "deleted",
				origin: "change",
			});
		}
	}

	return items;
}
