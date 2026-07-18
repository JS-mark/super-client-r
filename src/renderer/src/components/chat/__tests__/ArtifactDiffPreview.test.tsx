import type * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArtifactDiffPreview } from "../ArtifactDiffPreview";

// ---------- react-i18next mock ----------
// Mirrors CompactedSummaryCard.test.tsx: returns the fallback string (whatever
// the component passes) so we can assert the zh fallback labels
// ("展开"/"折叠"/"无差异内容") directly.
vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (_key: string, fallback?: string) => fallback ?? "",
	}),
}));

// ---------- antd mock ----------
// Mirrors PlanCard.test.tsx: Button forwards onClick so we can simulate toggling.
vi.mock("antd", () => {
	function Button({
		children,
		onClick,
		disabled,
		"aria-expanded": ariaExpanded,
	}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
		children?: React.ReactNode;
	}) {
		return (
			<button
				type="button"
				disabled={disabled}
				onClick={onClick}
				aria-expanded={ariaExpanded}
			>
				{children}
			</button>
		);
	}

	return {
		Button,
		theme: {
			useToken: () => ({
				token: {
					colorText: "#111",
					colorTextTertiary: "#777",
					colorFillQuaternary: "#f7f7f7",
					colorBorderSecondary: "#eee",
					borderRadiusSM: 4,
				},
			}),
		},
	};
});

let root: Root | undefined;
let container: HTMLDivElement | undefined;

(
	globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
	if (root) {
		act(() => {
			root?.unmount();
		});
	}
	root = undefined;
	container?.remove();
	container = undefined;
});

function render(element: React.ReactElement): void {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	act(() => {
		root?.render(element);
	});
}

function getToggleButton(): HTMLButtonElement {
	const button = Array.from(container?.querySelectorAll("button") ?? []).find(
		(candidate) => candidate.textContent?.trim().length,
	);
	if (!button) throw new Error("toggle button not found");
	return button;
}

describe("ArtifactDiffPreview", () => {
	it("renders the expand toggle, then switches to collapse and shows the diff text on click", () => {
		const diff = "--- a/foo.ts\n+++ b/foo.ts\n@@ -1 +1 @@\n-old\n+new\n";
		render(<ArtifactDiffPreview diffPreview={diff} />);

		const root_ = container?.querySelector(
			"[data-testid='artifact-diff-preview']",
		);
		expect(root_).not.toBeNull();
		expect(root_?.getAttribute("data-expanded")).toBe("false");

		// Collapsed → no diff body, button label is the expand fallback.
		expect(container?.textContent ?? "").not.toContain("-old");
		const toggle = getToggleButton();
		expect(toggle.textContent).toContain("展开");

		act(() => {
			toggle.click();
		});

		// Expanded → diff body visible, button label switches to the collapse fallback.
		expect(root_?.getAttribute("data-expanded")).toBe("true");
		expect(container?.textContent ?? "").toContain("-old");
		expect(container?.textContent ?? "").toContain("+new");
		expect(getToggleButton().textContent).toContain("折叠");
	});

	it("renders the empty placeholder when diffPreview is whitespace-only", () => {
		render(<ArtifactDiffPreview diffPreview={"   \n\t "} />);

		expect(container?.textContent ?? "").toContain("无差异内容");
		// No toggle button rendered.
		expect(container?.querySelectorAll("button").length).toBe(0);
		// data-expanded stays "false" (no interactive state).
		const root_ = container?.querySelector(
			"[data-testid='artifact-diff-preview']",
		);
		expect(root_?.getAttribute("data-expanded")).toBe("false");
	});

	it("renders the full diff text for a long preview after expanding", () => {
		const lines: string[] = ["--- a/long.txt", "+++ b/long.txt"];
		for (let i = 0; i < 50; i++) {
			lines.push(`+line ${i + 1}: added content`);
		}
		const diff = lines.join("\n");

		render(<ArtifactDiffPreview diffPreview={diff} />);

		// Collapsed → no diff body in DOM.
		expect(container?.textContent ?? "").not.toContain("line 50:");

		act(() => {
			getToggleButton().click();
		});

		// Expanded → every line is rendered (long diffs scroll inside the <pre>,
		// but the full text is present in the DOM).
		const text = container?.textContent ?? "";
		expect(text).toContain("line 1: added content");
		expect(text).toContain("line 50: added content");
		// The scroll container is a <pre> with the diff content.
		const pre = container?.querySelector("pre");
		expect(pre).not.toBeNull();
		expect(pre?.textContent ?? "").toContain("line 25: added content");
	});
});
