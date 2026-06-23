import { describe, expect, it } from "vitest";
import type { ResolvedAttachmentBlock } from "@super-client/shared-types";
import {
	formatAttachmentContext,
	formatSearchContext,
} from "../agentPromptContext";
import type { SearchResult } from "../../types/search";

describe("agentPromptContext", () => {
	it("formats text and reference attachments for agent prompt context", () => {
		const blocks: ResolvedAttachmentBlock[] = [
			{
				attachmentId: "att-1",
				fileName: "notes.md",
				mimeType: "text/markdown",
				size: 42,
				resolution: "text",
				text: "# Notes",
			},
			{
				attachmentId: "att-2",
				fileName: "image.png",
				mimeType: "image/png",
				size: 1024,
				resolution: "reference",
			},
		];

		const result = formatAttachmentContext(blocks);

		expect(result).toContain("--- Attached Files ---");
		expect(result).toContain("notes.md");
		expect(result).toContain("```text\n# Notes\n```");
		expect(result).toContain(
			'<attachment-ref id="att-2" name="image.png" />',
		);
	});

	it("formats search results as prompt context", () => {
		const results: SearchResult[] = [
			{
				title: "Result A",
				url: "https://example.com/a",
				snippet: "Summary A",
			},
			{
				title: "Result B",
				url: "https://example.com/b",
				snippet: "Summary B",
			},
		];

		const result = formatSearchContext("query text", "tavily", results);

		expect(result).toContain("--- Web Search Results ---");
		expect(result).toContain("Search provider: tavily");
		expect(result).toContain("Search query: query text");
		expect(result).toContain("- url: https://example.com/a");
		expect(result).toContain("- snippet: Summary B");
	});
});
