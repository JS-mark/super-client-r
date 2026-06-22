/**
 * Attachment context resolver client (§14 minimal slice).
 *
 * Thin typed wrapper around `window.electron.attachment.resolveContext`.
 * Renderer code should never read attachment files directly — main is the
 * source of truth for the per-conversation attachments dir.
 */

import type {
	IPCResponse,
	ResolvedAttachmentBlock,
} from "@super-client/shared-types";

export interface ResolveAttachmentContextArgs {
	conversationId: string;
	attachmentIds: string[];
	/** Per-attachment byte budget; main defaults to 64 KiB when omitted. */
	maxBytesPerAttachment?: number;
}

export const attachmentResolverService = {
	resolveContext: (
		args: ResolveAttachmentContextArgs,
	): Promise<IPCResponse<ResolvedAttachmentBlock[]>> =>
		window.electron.attachment.resolveContext(args),
};
