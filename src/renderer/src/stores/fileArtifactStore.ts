import { create } from "zustand";
import type { ChatFileArtifact, ChatFileChangeSet } from "../types/electron";

/**
 * Renderer-side store for chat file artifacts and change sets, keyed by
 * `conversationId`. No persistence: artifacts are re-derived from messages
 * by future capture (§17) or fetched from main on demand.
 */
interface FileArtifactState {
	artifacts: Record<string, ChatFileArtifact[]>;
	changeSets: Record<string, ChatFileChangeSet[]>;

	addArtifact: (artifact: ChatFileArtifact) => void;
	addArtifacts: (artifacts: ChatFileArtifact[]) => void;
	addChangeSet: (changeSet: ChatFileChangeSet) => void;
	removeArtifact: (conversationId: string, artifactId: string) => void;
	removeChangeSet: (conversationId: string, changeSetId: string) => void;
	clearForConversation: (conversationId: string) => void;
	getForConversation: (conversationId: string) => {
		artifacts: ChatFileArtifact[];
		changeSets: ChatFileChangeSet[];
	};
	getForMessage: (
		conversationId: string,
		messageId: string,
	) => {
		artifacts: ChatFileArtifact[];
		changeSets: ChatFileChangeSet[];
	};
}

export const useFileArtifactStore = create<FileArtifactState>((set, get) => ({
	artifacts: {},
	changeSets: {},

	addArtifact: (artifact) =>
		set((state) => {
			const existing = state.artifacts[artifact.conversationId] ?? [];
			return {
				artifacts: {
					...state.artifacts,
					[artifact.conversationId]: [...existing, artifact],
				},
			};
		}),

	addArtifacts: (artifacts) =>
		set((state) => {
			if (artifacts.length === 0) return {};
			const next = { ...state.artifacts };
			for (const artifact of artifacts) {
				const existing = next[artifact.conversationId] ?? [];
				next[artifact.conversationId] = [...existing, artifact];
			}
			return { artifacts: next };
		}),

	addChangeSet: (changeSet) =>
		set((state) => {
			const existing = state.changeSets[changeSet.conversationId] ?? [];
			return {
				changeSets: {
					...state.changeSets,
					[changeSet.conversationId]: [...existing, changeSet],
				},
			};
		}),

	removeArtifact: (conversationId, artifactId) =>
		set((state) => {
			const existing = state.artifacts[conversationId];
			if (!existing) return {};
			return {
				artifacts: {
					...state.artifacts,
					[conversationId]: existing.filter((a) => a.id !== artifactId),
				},
			};
		}),

	removeChangeSet: (conversationId, changeSetId) =>
		set((state) => {
			const existing = state.changeSets[conversationId];
			if (!existing) return {};
			return {
				changeSets: {
					...state.changeSets,
					[conversationId]: existing.filter((c) => c.id !== changeSetId),
				},
			};
		}),

	clearForConversation: (conversationId) =>
		set((state) => {
			const nextArtifacts = { ...state.artifacts };
			const nextChangeSets = { ...state.changeSets };
			delete nextArtifacts[conversationId];
			delete nextChangeSets[conversationId];
			return { artifacts: nextArtifacts, changeSets: nextChangeSets };
		}),

	getForConversation: (conversationId) => {
		const { artifacts, changeSets } = get();
		return {
			artifacts: artifacts[conversationId] ?? [],
			changeSets: changeSets[conversationId] ?? [],
		};
	},

	getForMessage: (conversationId, messageId) => {
		const { artifacts, changeSets } = get();
		return {
			artifacts: (artifacts[conversationId] ?? []).filter(
				(a) => a.messageId === messageId,
			),
			changeSets: (changeSets[conversationId] ?? []).filter(
				(c) => c.messageId === messageId,
			),
		};
	},
}));
