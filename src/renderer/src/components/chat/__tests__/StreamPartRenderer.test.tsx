import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MessagePart } from "@super-client/shared-types/chat";
import { StreamPartRenderer } from "../parts/StreamPartRenderer";

const readContentRefMock = vi.hoisted(() => vi.fn());

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock("../../Markdown", () => ({
	Markdown: ({ content }: { content: string }) => <div>{content}</div>,
	StreamingMarkdown: ({ fallbackContent }: { fallbackContent: string }) => (
		<div>{fallbackContent}</div>
	),
}));

vi.mock("../../../services/sessionContentRefService", () => ({
	sessionContentRefService: {
		read: readContentRefMock,
	},
}));

let container: HTMLDivElement | undefined;
let root: Root | undefined;

afterEach(() => {
	if (root) {
		act(() => {
			root?.unmount();
		});
	}
	root = undefined;
	container?.remove();
	container = undefined;
	readContentRefMock.mockReset();
});

function render(part: MessagePart): string {
	return renderToStaticMarkup(<StreamPartRenderer part={part} />);
}

function renderInteractive(part: MessagePart, sessionId = "session-1"): void {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	act(() => {
		root?.render(<StreamPartRenderer part={part} sessionId={sessionId} />);
	});
}

async function clickButton(label: string): Promise<void> {
	const button = Array.from(container?.querySelectorAll("button") ?? []).find(
		(candidate) => candidate.textContent?.includes(label),
	);
	if (!button) throw new Error(`Button not found: ${label}`);
	await act(async () => {
		button.click();
	});
}

describe("StreamPartRenderer", () => {
	it("renders code block parts with dedicated code card chrome", () => {
		const html = render({
			id: "code-1",
			type: "code_block",
			state: "complete",
			createdAt: 1,
			updatedAt: 1,
			language: "ts",
			title: "ts",
			content: "const answer: number = 42;\nconsole.log(answer);",
			lineCount: 2,
		});

		expect(html).toContain("structured-code-card");
		expect(html).toContain("TS");
		expect(html).toContain("ts");
		expect(html).toContain("Copy code");
		// Wrap is on by default (chat bubbles are narrow), so the toggle's
		// tooltip is the "off" affordance: "Disable line wrap".
		expect(html).toContain("Disable line wrap");
		expect(html).not.toContain("code-block-cm rounded-lg overflow-hidden my-4");
	});

	it("renders table parts as safe table markup", () => {
		const html = render({
			id: "table-1",
			type: "table",
			state: "complete",
			createdAt: 1,
			updatedAt: 1,
			title: "Files",
			columns: ["name", "size"],
			rows: [["a.ts", 12]],
		});

		expect(html).toContain("Files");
		expect(html).toContain("<table");
		expect(html).toContain("a.ts");
		expect(html).toContain("12");
	});

	it("escapes artifact preview instead of injecting html", () => {
		const html = render({
			id: "artifact-1",
			type: "artifact",
			state: "complete",
			createdAt: 1,
			updatedAt: 1,
			artifactId: "a1",
			artifactType: "html",
			title: "Preview",
			preview: '<img src=x onerror="alert(1)">',
		});

		expect(html).toContain("Preview");
		expect(html).not.toContain("<img src=x");
		expect(html).toContain("&lt;img");
	});

	it("renders sources without falling back to raw json", () => {
		const html = render({
			id: "sources-1",
			type: "sources",
			state: "complete",
			createdAt: 1,
			updatedAt: 1,
			sources: [
				{
					id: "s1",
					title: "Spec",
					path: "/tmp/spec.md",
					snippet: "Important detail",
					sourceType: "file",
				},
			],
		});

		expect(html).toContain("Sources");
		expect(html).toContain("Spec");
		expect(html).toContain("/tmp/spec.md");
		expect(html).not.toContain('"sourceType"');
	});

	it("renders tool parts as capped summaries instead of raw json fallback", () => {
		const largeOutput = "line\n".repeat(400);
		const html = render({
			id: "tool-1",
			type: "tool",
			state: "complete",
			createdAt: 1,
			updatedAt: 1,
			toolUseId: "call-1",
			name: "bash",
			input: { command: "printf lots" },
			output: largeOutput,
			duration: 12,
		});

		expect(html).toContain("bash");
		expect(html).toContain("Result");
		expect(html).toContain("12ms");
		expect(html).toContain("...");
		expect(html).not.toContain(largeOutput);
		expect(html).not.toContain('"toolUseId"');
	});

	it("renders contentRef text parts as lightweight summaries", () => {
		const fullContent = "FULL_TEXT_PAYLOAD_SHOULD_NOT_RENDER".repeat(200);
		const html = render({
			id: "text-ref-1",
			type: "text",
			state: "complete",
			createdAt: 1,
			updatedAt: 1,
			content: fullContent,
			contentRef: "blob://messages/text-ref-1",
			byteLength: 2048,
			truncated: true,
		});

		expect(html).toContain("Text");
		expect(html).toContain("referenced content");
		expect(html).toContain("blob://messages/text-ref-1");
		expect(html).toContain("2 KB");
		expect(html).toContain("Truncated");
		expect(html).not.toContain("FULL_TEXT_PAYLOAD_SHOULD_NOT_RENDER");
	});

	it("does not render inline payloads for referenced code, tool, data, and artifact parts", () => {
		const cases: MessagePart[] = [
			{
				id: "code-ref-1",
				type: "code_block",
				state: "complete",
				createdAt: 1,
				updatedAt: 1,
				language: "ts",
				title: "large.ts",
				content: "CODE_PAYLOAD_SHOULD_NOT_RENDER".repeat(100),
				contentRef: "blob://messages/code-ref-1",
				byteLength: 2048,
				truncated: true,
			},
			{
				id: "tool-ref-1",
				type: "tool",
				state: "complete",
				createdAt: 1,
				updatedAt: 1,
				toolUseId: "call-1",
				name: "bash",
				input: { command: "cat large.log" },
				output: "TOOL_RESULT_PAYLOAD_SHOULD_NOT_RENDER".repeat(100),
				contentRef: "blob://messages/tool-ref-1",
				byteLength: 1536,
				truncated: false,
			},
			{
				id: "data-ref-1",
				type: "data",
				state: "complete",
				createdAt: 1,
				updatedAt: 1,
				title: "Metrics",
				format: "json",
				value: { secret: "DATA_PAYLOAD_SHOULD_NOT_RENDER" },
				contentRef: "blob://messages/data-ref-1",
				byteLength: 512,
				truncated: true,
			},
			{
				id: "artifact-ref-1",
				type: "artifact",
				state: "complete",
				createdAt: 1,
				updatedAt: 1,
				artifactId: "artifact-1",
				artifactType: "html",
				title: "Report",
				preview: "ARTIFACT_PREVIEW_SHOULD_NOT_RENDER",
				contentRef: "blob://messages/artifact-ref-1",
				byteLength: 4096,
				truncated: true,
			},
		];

		for (const part of cases) {
			const html = render(part);

			expect(html).toContain(part.contentRef);
			expect(html).toContain("referenced content");
			expect(html).not.toContain("SHOULD_NOT_RENDER");
			expect(html).not.toContain('"contentRef"');
		}
	});

	it("escapes referenced content metadata instead of injecting html", () => {
		const html = render({
			id: "artifact-ref-html-1",
			type: "artifact",
			state: "complete",
			createdAt: 1,
			updatedAt: 1,
			artifactId: "artifact-html-1",
			artifactType: "html",
			title: "HTML Preview",
			preview: '<script>alert("preview")</script>',
			contentRef: '<img src=x onerror="alert(1)">',
			byteLength: 64,
			truncated: true,
		});

		expect(html).toContain("HTML Preview");
		expect(html).not.toContain("<img src=x");
		expect(html).not.toContain("<script>");
		expect(html).toContain("&lt;img");
		expect(html).not.toContain("preview");
	});

	it("does not call content ref service before the user loads content", () => {
		renderInteractive({
			id: "text-ref-idle-1",
			type: "text",
			state: "complete",
			createdAt: 1,
			updatedAt: 1,
			content: "INLINE_PAYLOAD_SHOULD_NOT_RENDER",
			contentRef: "blob://messages/text-ref-idle-1",
			byteLength: 128,
			truncated: true,
		});

		expect(container?.textContent).toContain("Load content");
		expect(container?.textContent).not.toContain(
			"INLINE_PAYLOAD_SHOULD_NOT_RENDER",
		);
		expect(readContentRefMock).not.toHaveBeenCalled();
	});

	it("loads and displays referenced text content on demand", async () => {
		const loadedText = "Loaded referenced text\nwith multiple lines.";
		readContentRefMock.mockResolvedValue({
			success: true,
			data: {
				contentRef: "blob://messages/text-ref-load-1",
				byteLength: 42,
				mediaType: "text/plain",
				source: "assistant",
				text: loadedText,
			},
		});
		renderInteractive({
			id: "text-ref-load-1",
			type: "text",
			state: "complete",
			createdAt: 1,
			updatedAt: 1,
			content: "INLINE_PAYLOAD_SHOULD_NOT_RENDER",
			contentRef: "blob://messages/text-ref-load-1",
			byteLength: 42,
			truncated: true,
		});

		await clickButton("Load content");

		expect(readContentRefMock).toHaveBeenCalledTimes(1);
		expect(readContentRefMock).toHaveBeenCalledWith(
			"session-1",
			"blob://messages/text-ref-load-1",
		);
		expect(container?.textContent).toContain("Loaded referenced text");
		expect(container?.textContent).toContain("text/plain");
		expect(container?.textContent).not.toContain(
			"INLINE_PAYLOAD_SHOULD_NOT_RENDER",
		);
	});

	it("caps loaded referenced previews and keeps the full byte length visible", async () => {
		const visiblePrefix = "VISIBLE_PREFIX_";
		const hiddenTail = "HIDDEN_TAIL_SHOULD_NOT_RENDER";
		readContentRefMock.mockResolvedValue({
			success: true,
			data: {
				contentRef: "blob://messages/tool-ref-long-1",
				byteLength: 65536,
				mediaType: "text/plain",
				source: "tool",
				text: `${visiblePrefix}${"x".repeat(20_000)}${hiddenTail}`,
			},
		});
		renderInteractive({
			id: "tool-ref-long-1",
			type: "tool",
			state: "complete",
			createdAt: 1,
			updatedAt: 1,
			toolUseId: "call-long",
			name: "bash",
			output: "INLINE_TOOL_PAYLOAD_SHOULD_NOT_RENDER",
			contentRef: "blob://messages/tool-ref-long-1",
			byteLength: 65536,
			truncated: true,
		});

		await clickButton("Load content");

		expect(container?.textContent).toContain(visiblePrefix);
		expect(container?.textContent).toContain("64 KB");
		expect(container?.textContent).toContain("Showing the first");
		expect(container?.textContent).not.toContain(hiddenTail);
		expect(container?.textContent).not.toContain(
			"INLINE_TOOL_PAYLOAD_SHOULD_NOT_RENDER",
		);
	});

	it("shows a lightweight unavailable notice for metadata-only binary content", async () => {
		readContentRefMock.mockResolvedValue({
			success: true,
			data: {
				contentRef: "blob://messages/data-ref-binary-1",
				byteLength: 4096,
				mediaType: "application/octet-stream",
				source: "tool",
			},
		});
		renderInteractive({
			id: "data-ref-binary-1",
			type: "data",
			state: "complete",
			createdAt: 1,
			updatedAt: 1,
			title: "Binary Data",
			format: "unknown",
			value: { hidden: "INLINE_DATA_PAYLOAD_SHOULD_NOT_RENDER" },
			contentRef: "blob://messages/data-ref-binary-1",
			byteLength: 4096,
			truncated: true,
		});

		await clickButton("Load content");

		expect(container?.textContent).toContain("Preview unavailable");
		expect(container?.textContent).toContain(
			"Binary or non-text content cannot be previewed here.",
		);
		expect(container?.textContent).toContain("application/octet-stream");
		expect(container?.textContent).toContain("4 KB");
		expect(container?.textContent).not.toContain(
			"INLINE_DATA_PAYLOAD_SHOULD_NOT_RENDER",
		);
	});

	it("routes subagent parts to the SubagentPartCard instead of the json fallback", () => {
		const html = render({
			id: "assistant-sub:subagent:run-1",
			type: "subagent",
			state: "complete",
			createdAt: 1,
			updatedAt: 2,
			run: {
				subagentRunId: "run-1",
				parentRunId: "parent-1",
				profileName: "Docs Explorer",
				taskGoal: "Investigate flaky tests",
				status: "running",
				startedAt: 1,
				toolCallCount: 4,
				tokenUsage: { input: 10, output: 5 },
			},
			collapsed: true,
		});

		expect(html).toContain('data-part-id="subagent-card-run-1"');
		expect(html).toContain("Docs Explorer");
		expect(html).toContain("Running");
		// Collapsed by default: expanded body must not be present in initial SSR markup.
		expect(html).not.toContain('data-testid="subagent-card-expanded"');
		// Ensure the JsonFallback path did not render the raw JSON blob.
		expect(html).not.toContain('"subagentRunId": "run-1"');
	});

	it("shows a structured fallback when loading referenced content fails", async () => {
		readContentRefMock.mockResolvedValue({
			success: false,
			error: "ENOENT: raw storage path should not render",
		});
		renderInteractive({
			id: "artifact-ref-error-1",
			type: "artifact",
			state: "complete",
			createdAt: 1,
			updatedAt: 1,
			artifactId: "artifact-error",
			artifactType: "file",
			title: "Report",
			preview: "INLINE_ARTIFACT_PAYLOAD_SHOULD_NOT_RENDER",
			contentRef: "blob://messages/artifact-ref-error-1",
			byteLength: 1024,
			truncated: true,
		});

		await clickButton("Load content");

		expect(container?.textContent).toContain("Content unavailable");
		expect(container?.textContent).toContain(
			"The referenced content could not be loaded.",
		);
		expect(container?.textContent).not.toContain("ENOENT");
		expect(container?.textContent).not.toContain(
			"INLINE_ARTIFACT_PAYLOAD_SHOULD_NOT_RENDER",
		);
	});
});
