import { describe, expect, it, vi } from "vitest";
import { createAssistantStreamBuffer } from "../useAssistantStreamBuffer";

interface RafHarness {
	raf: (cb: FrameRequestCallback) => number;
	caf: (handle: number) => void;
	pending: Array<{ handle: number; cb: FrameRequestCallback }>;
	flush(): void;
	cancelledHandles: number[];
}

function createRafHarness(): RafHarness {
	const pending: Array<{ handle: number; cb: FrameRequestCallback }> = [];
	const cancelledHandles: number[] = [];
	let nextHandle = 1;

	const raf = (cb: FrameRequestCallback): number => {
		const handle = nextHandle++;
		pending.push({ handle, cb });
		return handle;
	};

	const caf = (handle: number): void => {
		const idx = pending.findIndex((p) => p.handle === handle);
		if (idx >= 0) pending.splice(idx, 1);
		cancelledHandles.push(handle);
	};

	const flush = (): void => {
		const drain = pending.splice(0, pending.length);
		for (const { cb } of drain) {
			cb(0);
		}
	};

	return { raf, caf, pending, flush, cancelledHandles };
}

function createStoreStub() {
	const setStreamingContent = vi.fn<(content: string) => void>();
	const updateLastMessage = vi.fn<(content: string) => void>();
	return { setStreamingContent, updateLastMessage };
}

describe("createAssistantStreamBuffer", () => {
	it("batches multiple appends into a single rAF flush", () => {
		const harness = createRafHarness();
		const store = createStoreStub();
		const buf = createAssistantStreamBuffer(store, {
			requestAnimationFrame: harness.raf,
			cancelAnimationFrame: harness.caf,
		});

		buf.append("hel");
		buf.append("lo");
		buf.append(" world");

		expect(harness.pending).toHaveLength(1);
		expect(store.setStreamingContent).not.toHaveBeenCalled();

		harness.flush();

		expect(store.setStreamingContent).toHaveBeenCalledTimes(1);
		expect(store.setStreamingContent).toHaveBeenLastCalledWith("hello world");
		expect(buf.getRef().current).toBe("hello world");
	});

	it("finalize commits immediately, calls updateLastMessage, and resets the ref", () => {
		const harness = createRafHarness();
		const store = createStoreStub();
		const buf = createAssistantStreamBuffer(store, {
			requestAnimationFrame: harness.raf,
			cancelAnimationFrame: harness.caf,
		});

		buf.append("partial ");
		buf.append("text");
		expect(harness.pending).toHaveLength(1);

		buf.finalize();

		// Pending rAF must be cancelled — no double-flush after finalize.
		expect(harness.pending).toHaveLength(0);
		expect(store.setStreamingContent).toHaveBeenCalledWith("partial text");
		expect(store.updateLastMessage).toHaveBeenCalledWith("partial text");
		expect(buf.getRef().current).toBe("");
	});

	it("finalize with explicit finalText overrides buffer content", () => {
		const store = createStoreStub();
		const harness = createRafHarness();
		const buf = createAssistantStreamBuffer(store, {
			requestAnimationFrame: harness.raf,
			cancelAnimationFrame: harness.caf,
		});
		buf.append("stale");
		buf.finalize("fresh commit");

		expect(store.setStreamingContent).toHaveBeenCalledWith("fresh commit");
		expect(store.updateLastMessage).toHaveBeenCalledWith("fresh commit");
		expect(buf.getRef().current).toBe("");
	});

	it("finalize with empty buffer is a no-op that still clears the ref", () => {
		const store = createStoreStub();
		const harness = createRafHarness();
		const buf = createAssistantStreamBuffer(store, {
			requestAnimationFrame: harness.raf,
			cancelAnimationFrame: harness.caf,
		});
		buf.finalize();
		expect(store.setStreamingContent).not.toHaveBeenCalled();
		expect(store.updateLastMessage).not.toHaveBeenCalled();
		expect(buf.getRef().current).toBe("");
	});

	it("clear cancels a pending rAF and resets the streaming state", () => {
		const harness = createRafHarness();
		const store = createStoreStub();
		const buf = createAssistantStreamBuffer(store, {
			requestAnimationFrame: harness.raf,
			cancelAnimationFrame: harness.caf,
		});
		buf.append("about-to-be-cancelled");
		expect(harness.pending).toHaveLength(1);

		buf.clear();

		expect(harness.pending).toHaveLength(0);
		expect(harness.cancelledHandles).toHaveLength(1);
		expect(store.setStreamingContent).toHaveBeenLastCalledWith("");
		expect(buf.getRef().current).toBe("");

		// A flushed rAF must NOT resurrect the cleared content.
		harness.flush();
		expect(store.setStreamingContent).toHaveBeenCalledTimes(1);
	});

	it("applies sanitizeAssistantContent on flush (strips well-known sentinels)", () => {
		const harness = createRafHarness();
		const store = createStoreStub();
		const buf = createAssistantStreamBuffer(store, {
			requestAnimationFrame: harness.raf,
			cancelAnimationFrame: harness.caf,
		});
		buf.append("answer<|im_end|>");
		harness.flush();
		expect(store.setStreamingContent).toHaveBeenCalledWith("answer");

		buf.append("<|im_end|>trailing<|endoftext|>");
		harness.flush();
		// Since ref was retained (interim flush), the accumulated content
		// after sanitisation should not contain sentinels.
		const lastCall = store.setStreamingContent.mock.calls.at(-1)![0] as string;
		expect(lastCall).not.toContain("<|im_end|>");
		expect(lastCall).not.toContain("<|endoftext|>");
	});

	it("setContent(_, true) flushes immediately without waiting for rAF", () => {
		const harness = createRafHarness();
		const store = createStoreStub();
		const buf = createAssistantStreamBuffer(store, {
			requestAnimationFrame: harness.raf,
			cancelAnimationFrame: harness.caf,
		});
		buf.setContent("snapshot", true);
		expect(harness.pending).toHaveLength(0);
		expect(store.setStreamingContent).toHaveBeenCalledWith("snapshot");
	});

	it("flush() commits the current buffer without resetting the ref", () => {
		const harness = createRafHarness();
		const store = createStoreStub();
		const buf = createAssistantStreamBuffer(store, {
			requestAnimationFrame: harness.raf,
			cancelAnimationFrame: harness.caf,
		});
		buf.append("kept");
		buf.flush();
		expect(store.setStreamingContent).toHaveBeenCalledWith("kept");
		expect(store.updateLastMessage).not.toHaveBeenCalled();
		expect(buf.getRef().current).toBe("kept");
	});

	it("dispose cancels a pending rAF", () => {
		const harness = createRafHarness();
		const store = createStoreStub();
		const buf = createAssistantStreamBuffer(store, {
			requestAnimationFrame: harness.raf,
			cancelAnimationFrame: harness.caf,
		});
		buf.append("dispose-me");
		expect(harness.pending).toHaveLength(1);
		buf.dispose();
		expect(harness.pending).toHaveLength(0);
	});
});
