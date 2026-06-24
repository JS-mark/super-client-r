// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { mockChatCompletion, setupMockProvider } from "../mockProvider";

let _cleanup: (() => Promise<void>) | null = null;

afterEach(async () => {
	if (_cleanup) {
		await _cleanup();
		_cleanup = null;
	}
});

describe("mockProvider", () => {
	it("intercepts outbound provider HTTP and replies with SSE body", async () => {
		const { agent, cleanup } = setupMockProvider();
		_cleanup = cleanup;
		mockChatCompletion(agent, "https://prov.test/v1", [
			{ event: "chunk", data: { content: "Hi" } },
			{ event: "done", data: { requestId: "r1" } },
		]);

		const res = await fetch("https://prov.test/v1/chat/completions", {
			method: "POST",
			body: "{}",
		});
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("text/event-stream");
		const text = await res.text();
		expect(text).toContain("event: chunk");
		expect(text).toContain('"content":"Hi"');
		expect(text).toContain("event: done");
	});

	it("appends /chat/completions to baseUrl when missing", async () => {
		const { agent, cleanup } = setupMockProvider();
		_cleanup = cleanup;
		mockChatCompletion(agent, "https://x.test/v1", [
			{ event: "done", data: {} },
		]);
		const res = await fetch("https://x.test/v1/chat/completions", {
			method: "POST",
			body: "{}",
		});
		expect(res.status).toBe(200);
	});
});
