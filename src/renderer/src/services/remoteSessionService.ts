/**
 * remoteSessionService — R-3 step 1 (plan §26.4).
 *
 * Thin wrapper over the `remoteChat` IPC namespace so callers in stores and
 * hooks don't reach into `window.electron.remoteChat` directly. This keeps the
 * dependency direction one-way (state ─→ service ─→ IPC) and makes future
 * refactors (test mocking, multi-platform routing, retry policy) a single
 * patch instead of touching every callsite.
 *
 * Scope of this slice: bind / unbind / getBinding / checkBotOnline.
 * Message-stream concerns (sendMessage / getRemoteMessages / onIMMessage) stay
 * in `useRemoteChat` because they own subscription / optimistic-state shape;
 * extracting those is a separate task once the message-store split (R-3
 * step 2) lands.
 */

import type { IPCResponse, RemoteBinding } from "../types/electron";

export const remoteSessionService = {
	bind: (
		conversationId: string,
		botId: string,
		chatId: string,
	): Promise<IPCResponse<RemoteBinding>> =>
		window.electron.remoteChat.bind(conversationId, botId, chatId),

	unbind: (conversationId: string): Promise<IPCResponse<void>> =>
		window.electron.remoteChat.unbind(conversationId),

	getBinding: (
		conversationId: string,
	): Promise<IPCResponse<RemoteBinding | null>> =>
		window.electron.remoteChat.getBinding(conversationId),

	checkBotOnline: (botId: string): Promise<IPCResponse<boolean>> =>
		window.electron.remoteChat.checkBotOnline(botId),
};
