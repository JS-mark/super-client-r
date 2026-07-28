import type * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Message } from "../../../stores/chatMessageStore";
import { CompactedSummaryCard } from "../CompactedSummaryCard";

// ---------- react-i18next mock ----------
// Mirrors ApprovalDecisionCard.test.ts:8 — interpolates {{key}} placeholders
// in the fallback string so `count` shows up in the rendered label.
vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, fallbackOrOpts?: unknown, maybeOpts?: unknown) => {
			let fallback: string | undefined;
			let opts: Record<string, unknown> | undefined;
			if (typeof fallbackOrOpts === "string") {
				fallback = fallbackOrOpts;
				opts = maybeOpts as Record<string, unknown> | undefined;
			} else if (fallbackOrOpts && typeof fallbackOrOpts === "object") {
				opts = fallbackOrOpts as Record<string, unknown>;
			}
			let out = fallback ?? key;
			if (opts) {
				for (const [k, v] of Object.entries(opts)) {
					out = out.replace(`{{${k}}}`, String(v));
				}
			}
			return out;
		},
	}),
}));

// ---------- antd mock ----------
vi.mock("antd", () => {
	function Tag({
		children,
		color,
	}: {
		children?: React.ReactNode;
		color?: string;
	}) {
		return <span data-color={color}>{children}</span>;
	}
	return {
		Tag,
		theme: {
			useToken: () => ({
				token: {
					borderRadiusLG: 8,
					colorText: "#111",
				},
			}),
		},
	};
});

vi.mock("@ant-design/icons", () => ({
	CompressOutlined: () => <span aria-hidden="true" />,
}));

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

function buildMessage(overrides: Partial<Message> = {}): Message {
	return {
		id: "m-1",
		role: "assistant",
		content: "",
		timestamp: 0,
		...overrides,
	} as Message;
}

function render(element: React.ReactElement): void {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	act(() => {
		root?.render(element);
	});
}

describe("CompactedSummaryCard", () => {
	it("renders the count label and summary text", () => {
		const message = buildMessage({
			metadata: {
				contextCompacted: {
					compacted: true,
					summary: "Earlier turns discussed the API design.",
					originalCount: 5,
					compactedAt: 1_700_000_000_000,
				},
			},
		});

		render(<CompactedSummaryCard message={message} />);

		const card = container?.querySelector(
			"[data-testid='compacted-summary-card']",
		);
		expect(card).not.toBeNull();

		const html = container?.innerHTML ?? "";
		// The count is interpolated into the label fallback.
		expect(html).toContain("5 messages compacted");
		// The summary body renders as plain text.
		expect(html).toContain("Earlier turns discussed the API design.");
	});

	it("renders nothing when metadata.contextCompacted is absent", () => {
		const message = buildMessage();

		render(<CompactedSummaryCard message={message} />);

		expect(
			container?.querySelector("[data-testid='compacted-summary-card']"),
		).toBeNull();
	});

	it("renders the card shell for a large count and empty summary", () => {
		const message = buildMessage({
			metadata: {
				contextCompacted: {
					compacted: true,
					summary: "",
					originalCount: 12345,
					compactedAt: 1_700_000_000_000,
				},
			},
		});

		render(<CompactedSummaryCard message={message} />);

		const card = container?.querySelector(
			"[data-testid='compacted-summary-card']",
		);
		expect(card).not.toBeNull();

		const html = container?.innerHTML ?? "";
		// Large count interpolates cleanly.
		expect(html).toContain("12345 messages compacted");
		// The gold/amber tag color is applied (mirrors the inspector's compaction tag).
		expect(container?.querySelector("[data-color='gold']")).not.toBeNull();
	});
});
