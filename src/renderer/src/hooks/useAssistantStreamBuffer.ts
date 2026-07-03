/**
 * useAssistantStreamBuffer — rAF-batched assistant streaming buffer.
 *
 * Extracted from `useChat.ts` (Phase 0b hook slim-down). Owns the two refs
 * that used to live inline in `useChat`:
 *   - `streamContentRef`: cumulative assistant text for the in-flight bubble.
 *   - `streamFlushRafRef`: pending `requestAnimationFrame` handle used to
 *     batch multiple `append()` calls into a single UI flush.
 *
 * The buffer applies `sanitizeAssistantContent()` on every write to the
 * message store (interim flush AND final commit) to preserve prior behavior.
 *
 * Test surface: `createAssistantStreamBuffer()` is the pure factory the
 * tests exercise directly, without needing renderHook / RTL. The React
 * hook is a thin memoised wrapper that also cancels any pending rAF on
 * unmount.
 */
import { useEffect, useMemo, useRef } from "react";
import { sanitizeAssistantContent } from "../lib/assistantContent";

export interface AssistantStreamBufferStoreApi {
	setStreamingContent: (content: string) => void;
	updateLastMessage: (content: string) => void;
}

export interface AssistantStreamBufferHandle {
	/** Append a delta chunk. Schedules an rAF-batched flush. */
	append(delta: string): void;
	/**
	 * Replace the entire buffer content. Optionally flush immediately
	 * (bypassing rAF batching) — used by callers that need the store to
	 * reflect the new snapshot synchronously.
	 */
	setContent(content: string, immediate?: boolean): void;
	/** Cancel any pending rAF and reset the buffer to empty. */
	clear(): void;
	/**
	 * Immediate flush + reset the buffer. When `finalText` is provided,
	 * that text (sanitised) replaces the current buffer content before
	 * being committed via `setStreamingContent` + `updateLastMessage`.
	 */
	finalize(finalText?: string | null): void;
	/** Immediate flush without resetting the ref. */
	flush(): void;
	/**
	 * Expose the underlying content ref. Consumers that must read the
	 * current buffer synchronously (e.g. `stopCurrentStream`) use this.
	 */
	getRef(): { current: string };
	/** Dispose — cancels pending rAF. Called by the hook on unmount. */
	dispose(): void;
}

export interface AssistantStreamBufferOptions {
	requestAnimationFrame?: (cb: FrameRequestCallback) => number;
	cancelAnimationFrame?: (handle: number) => void;
}

/**
 * Pure factory. Returns a mutable buffer handle. Prefer this in tests so
 * we don't require a React tree or `@testing-library/react`.
 */
export function createAssistantStreamBuffer(
	storeApi: AssistantStreamBufferStoreApi,
	options?: AssistantStreamBufferOptions,
): AssistantStreamBufferHandle {
	const raf =
		options?.requestAnimationFrame ??
		(typeof requestAnimationFrame === "function"
			? requestAnimationFrame
			: (cb: FrameRequestCallback): number => {
					// Fallback for non-browser environments — schedule on macrotask.
					return setTimeout(() => cb(Date.now()), 0) as unknown as number;
				});
	const caf =
		options?.cancelAnimationFrame ??
		(typeof cancelAnimationFrame === "function"
			? cancelAnimationFrame
			: (handle: number) => clearTimeout(handle as unknown as ReturnType<typeof setTimeout>));

	const contentRef: { current: string } = { current: "" };
	const rafRef: { current: number | null } = { current: null };

	const applyFlush = (): void => {
		rafRef.current = null;
		const sanitized = sanitizeAssistantContent(contentRef.current);
		storeApi.setStreamingContent(sanitized);
	};

	const schedule = (): void => {
		if (rafRef.current !== null) return;
		rafRef.current = raf(applyFlush);
	};

	const cancelPending = (): void => {
		if (rafRef.current !== null) {
			caf(rafRef.current);
			rafRef.current = null;
		}
	};

	const setContent = (content: string, immediate = false): void => {
		contentRef.current = content;
		if (immediate) {
			cancelPending();
			if (!contentRef.current) {
				storeApi.setStreamingContent("");
				return;
			}
			applyFlush();
			return;
		}
		schedule();
	};

	const append = (delta: string): void => {
		if (!delta) return;
		setContent(contentRef.current + delta);
	};

	const flush = (): void => {
		cancelPending();
		if (!contentRef.current) return;
		applyFlush();
	};

	const clear = (): void => {
		cancelPending();
		contentRef.current = "";
		storeApi.setStreamingContent("");
	};

	const finalize = (finalText?: string | null): void => {
		cancelPending();
		const source =
			finalText !== undefined && finalText !== null
				? finalText
				: contentRef.current;
		if (!source) {
			// Nothing to commit — still reset the ref to keep the "finalize
			// leaves the buffer empty" invariant callers rely on.
			contentRef.current = "";
			return;
		}
		const sanitized = sanitizeAssistantContent(source);
		storeApi.setStreamingContent(sanitized);
		storeApi.updateLastMessage(sanitized);
		contentRef.current = "";
	};

	return {
		append,
		setContent,
		clear,
		finalize,
		flush,
		getRef: () => contentRef,
		dispose: cancelPending,
	};
}

/**
 * React hook wrapper. Memoises the buffer per-mount and cancels any
 * pending rAF on unmount.
 *
 * NOTE: `storeApi` is captured via a ref so that consumers can pass a
 * fresh object literal each render without invalidating the memo. In
 * practice the setters (`setStreamingContent` / `updateLastMessage`) come
 * from Zustand selectors and are stable, but the ref pattern is defensive.
 */
export function useAssistantStreamBuffer(
	storeApi: AssistantStreamBufferStoreApi,
): AssistantStreamBufferHandle {
	const apiRef = useRef(storeApi);
	apiRef.current = storeApi;

	const handle = useMemo(() => {
		return createAssistantStreamBuffer({
			setStreamingContent: (content) => apiRef.current.setStreamingContent(content),
			updateLastMessage: (content) => apiRef.current.updateLastMessage(content),
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		return () => {
			handle.dispose();
		};
	}, [handle]);

	return handle;
}
