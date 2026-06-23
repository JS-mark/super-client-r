import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { MessagePart } from "@super-client/shared-types/chat";
import { StreamPartRenderer } from "../parts/StreamPartRenderer";

function render(part: MessagePart): string {
	return renderToStaticMarkup(<StreamPartRenderer part={part} />);
}

describe("StreamPartRenderer", () => {
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
});
