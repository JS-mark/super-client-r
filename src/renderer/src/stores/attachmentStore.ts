import { create } from "zustand";
import { persist } from "zustand/middleware";

export type AttachmentType = "image" | "document" | "code" | "audio" | "video" | "archive" | "other";

export interface Attachment {
	id: string;
	name: string;
	originalName: string;
	path: string;
	size: number;
	mimeType: string;
	type: AttachmentType;
	createdAt: string;
	conversationId?: string;
	messageId?: string;
	thumbnailPath?: string;
	url?: string; // Data URL for preview
}

export interface AttachmentState {
	// State
	attachments: Attachment[];
	isLoading: boolean;
	selectedAttachments: string[]; // IDs of selected attachments
	uploadProgress: Map<string, number>; // attachment ID -> progress percentage

	// Actions
	setAttachments: (attachments: Attachment[]) => void;
	addAttachment: (attachment: Attachment) => void;
	removeAttachment: (id: string) => void;
	updateAttachment: (id: string, updates: Partial<Attachment>) => void;
	selectAttachment: (id: string) => void;
	deselectAttachment: (id: string) => void;
	clearSelection: () => void;
	setLoading: (loading: boolean) => void;
	setUploadProgress: (id: string, progress: number) => void;
	clearUploadProgress: (id: string) => void;

	// Async actions
	loadAttachments: (filter?: { conversationId?: string; messageId?: string; type?: string }) => Promise<void>;
	uploadFile: (filePath: string, metadata?: { conversationId?: string; messageId?: string; customName?: string }) => Promise<Attachment | null>;
	deleteAttachment: (id: string) => Promise<boolean>;
	openAttachment: (id: string) => Promise<boolean>;
	readFileContent: (id: string) => Promise<string | null>;

	// Getters
	getAttachmentsByConversation: (conversationId: string) => Attachment[];
	getAttachmentsByMessage: (messageId: string) => Attachment[];
	getAttachmentsByType: (type: AttachmentType) => Attachment[];
	getImages: () => Attachment[];
	getSelectedAttachments: () => Attachment[];
}

export const useAttachmentStore = create<AttachmentState>()(
	persist(
		(set, get) => ({
			// Initial state
			attachments: [],
			isLoading: false,
			selectedAttachments: [],
			uploadProgress: new Map(),

			// Actions
			setAttachments: (attachments) => set({ attachments }),

			addAttachment: (attachment) =>
				set((state) => ({
					attachments: [attachment, ...state.attachments],
				})),

			removeAttachment: (id) =>
				set((state) => ({
					attachments: state.attachments.filter((a) => a.id !== id),
					selectedAttachments: state.selectedAttachments.filter((sid) => sid !== id),
				})),

			updateAttachment: (id, updates) =>
				set((state) => ({
					attachments: state.attachments.map((a) =>
						a.id === id ? { ...a, ...updates } : a
					),
				})),

			selectAttachment: (id) =>
				set((state) => ({
					selectedAttachments: state.selectedAttachments.includes(id)
						? state.selectedAttachments
						: [...state.selectedAttachments, id],
				})),

			deselectAttachment: (id) =>
				set((state) => ({
					selectedAttachments: state.selectedAttachments.filter((sid) => sid !== id),
				})),

			clearSelection: () => set({ selectedAttachments: [] }),

			setLoading: (loading) => set({ isLoading: loading }),

			setUploadProgress: (id, progress) =>
				set((state) => ({
					uploadProgress: new Map(state.uploadProgress).set(id, progress),
				})),

			clearUploadProgress: (id) =>
				set((state) => {
					const newMap = new Map(state.uploadProgress);
					newMap.delete(id);
					return { uploadProgress: newMap };
				}),

			// Async actions
			loadAttachments: async (filter) => {
				set({ isLoading: true });
				try {
					const result = await window.electron.file.listAttachments(filter);
					if (result.success && result.data) {
						set({ attachments: result.data.attachments });
					}
				} catch (error) {
					console.error("Failed to load attachments:", error);
				} finally {
					set({ isLoading: false });
				}
			},

			uploadFile: async (filePath, metadata) => {
				const tempId = `temp_${Date.now()}`;
				set((state) => ({
					uploadProgress: new Map(state.uploadProgress).set(tempId, 0),
				}));

				try {
					// Simulate progress updates
					const progressInterval = setInterval(() => {
						set((state) => {
							const current = state.uploadProgress.get(tempId) || 0;
							if (current < 90) {
								return {
									uploadProgress: new Map(state.uploadProgress).set(tempId, current + 10),
								};
							}
							return state;
						});
					}, 100);

					const result = await window.electron.file.saveAttachment({
						sourcePath: filePath,
						...metadata,
					});

					clearInterval(progressInterval);

					if (result.success && result.data) {
						const attachment = result.data;
						set((state) => ({
							attachments: [attachment, ...state.attachments],
							uploadProgress: new Map(state.uploadProgress).set(tempId, 100),
						}));

						// Clear progress after a delay
						setTimeout(() => {
							get().clearUploadProgress(tempId);
						}, 1000);

						return attachment;
					}
					return null;
				} catch (error) {
					console.error("Failed to upload file:", error);
					get().clearUploadProgress(tempId);
					return null;
				}
			},

			deleteAttachment: async (id) => {
				const attachment = get().attachments.find((a) => a.id === id);
				if (!attachment) return false;

				try {
					const result = await window.electron.file.deleteAttachment(attachment.path);
					if (result.success) {
						get().removeAttachment(id);
						return true;
					}
					return false;
				} catch (error) {
					console.error("Failed to delete attachment:", error);
					return false;
				}
			},

			openAttachment: async (id) => {
				const attachment = get().attachments.find((a) => a.id === id);
				if (!attachment) return false;

				try {
					const result = await window.electron.file.openAttachment(attachment.path);
					return result.success;
				} catch (error) {
					console.error("Failed to open attachment:", error);
					return false;
				}
			},

			readFileContent: async (id) => {
				const attachment = get().attachments.find((a) => a.id === id);
				if (!attachment) return null;

				try {
					const result = await window.electron.file.readFile(attachment.path);
					if (result.success && result.data) {
						return result.data.content;
					}
					return null;
				} catch (error) {
					console.error("Failed to read file content:", error);
					return null;
				}
			},

			// Getters
			getAttachmentsByConversation: (conversationId) => {
				return get().attachments.filter((a) => a.conversationId === conversationId);
			},

			getAttachmentsByMessage: (messageId) => {
				return get().attachments.filter((a) => a.messageId === messageId);
			},

			getAttachmentsByType: (type) => {
				return get().attachments.filter((a) => a.type === type);
			},

			getImages: () => {
				return get().attachments.filter((a) => a.type === "image");
			},

			getSelectedAttachments: () => {
				const { attachments, selectedAttachments } = get();
				return attachments.filter((a) => selectedAttachments.includes(a.id));
			},
		}),
		{
			name: "attachment-storage",
			partialize: (state) => ({
				attachments: state.attachments,
			}),
		}
	)
);
