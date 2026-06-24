/**
 * Test helper: intercept outbound provider HTTP calls and reply with
 * canned SSE streams. Built on undici MockAgent so the real HTTP-layer
 * code path (fetch, headers, body serialization) is exercised end-to-end.
 *
 * Usage:
 *   const { agent, cleanup } = setupMockProvider();
 *   mockChatCompletion(agent, "https://prov.test/v1", [
 *     { event: "chunk", data: { content: "Hi" } },
 *     { event: "done", data: { requestId: "..." } },
 *   ]);
 *   // ... make requests via fetch ...
 *   await cleanup();
 *
 * NOTE: only outbound fetch traffic is intercepted. Loopback HTTP to
 *       LocalServer (127.0.0.1) is NOT intercepted — those use Node's
 *       built-in http and bypass undici's global dispatcher.
 */

import {
	MockAgent,
	setGlobalDispatcher,
	getGlobalDispatcher,
	type Dispatcher,
} from "undici";

export interface SSEEvent {
	event: string;
	data: unknown;
}

export interface MockProviderHandle {
	agent: MockAgent;
	cleanup: () => Promise<void>;
}

export function setupMockProvider(): MockProviderHandle {
	const prior = getGlobalDispatcher();
	const agent = new MockAgent({ connections: 1 });
	agent.disableNetConnect();
	// Allow loopback so LocalServer fetches still work
	agent.enableNetConnect((host) => /127\.0\.0\.1|localhost/.test(host));
	setGlobalDispatcher(agent);
	return {
		agent,
		cleanup: async () => {
			await agent.close();
			setGlobalDispatcher(prior as Dispatcher);
		},
	};
}

/**
 * Register an SSE-shaped response for POST {baseUrl}/chat/completions.
 *
 * If the parent baseUrl already ends with /chat/completions, only the
 * baseUrl is used as path; otherwise /chat/completions is appended.
 */
export function mockChatCompletion(
	agent: MockAgent,
	baseUrl: string,
	events: SSEEvent[],
): void {
	const url = new URL(baseUrl);
	const origin = `${url.protocol}//${url.host}`;
	const basePath = url.pathname.replace(/\/$/, "");
	const path = basePath.endsWith("/chat/completions")
		? basePath
		: `${basePath}/chat/completions`;
	const body = events
		.map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`)
		.join("");
	agent
		.get(origin)
		.intercept({ path, method: "POST" })
		.reply(200, body, {
			headers: { "content-type": "text/event-stream" },
		});
}
