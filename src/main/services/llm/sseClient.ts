/**
 * SSE (Server-Sent Events) stream parser.
 *
 * Reads a fetch Response body (ReadableStream<Uint8Array>) and yields
 * `{ event, data }` for each `event: <name>\ndata: <json>\n\n` frame.
 *
 * Per SSE spec:
 *   - Multiple `data:` lines in one frame are concatenated with newline
 *   - Missing `event:` defaults to "message"
 *   - Lines starting with ':' are comments and ignored
 *   - Malformed JSON is silently skipped (returns nothing for that frame)
 *
 * Used by ClaudeCodeAgentRuntime to consume `/v1/llm/chat/completions`
 * and by the `@scp/agent-builtins::Task` tool to consume recursive
 * subagent streams.
 */

export interface SSEFrame {
	event: string;
	data: unknown;
}

export async function* parseSSEStream(
	body: ReadableStream<Uint8Array>,
): AsyncGenerator<SSEFrame, void, void> {
	const reader = body.getReader();
	const decoder = new TextDecoder("utf-8");
	let buf = "";

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			buf += decoder.decode(value, { stream: true });

			let sep: number;
			while ((sep = buf.indexOf("\n\n")) >= 0) {
				const frame = buf.slice(0, sep);
				buf = buf.slice(sep + 2);
				const parsed = parseFrame(frame);
				if (parsed) yield parsed;
			}
		}
		// Flush any final frame without trailing blank line.
		buf += decoder.decode();
		if (buf.trim()) {
			const parsed = parseFrame(buf);
			if (parsed) yield parsed;
		}
	} finally {
		try {
			reader.releaseLock();
		} catch {
			/* ignore */
		}
	}
}

function parseFrame(frame: string): SSEFrame | null {
	const lines = frame.split("\n");
	let event = "message";
	const dataParts: string[] = [];
	for (const raw of lines) {
		const line = raw.trim();
		if (!line || line.startsWith(":")) continue;
		if (line.startsWith("event:")) {
			event = line.slice(6).trim();
		} else if (line.startsWith("data:")) {
			dataParts.push(line.slice(5).trim());
		}
	}
	if (dataParts.length === 0) return null;
	const dataStr = dataParts.join("\n");
	try {
		const data = JSON.parse(dataStr);
		return { event, data };
	} catch {
		return null;
	}
}
