import type * as React from "react";
import { createElement, Fragment } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

// ---------- react-i18next mock ----------
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
	function PassThrough({ children }: { children?: React.ReactNode }) {
		return createElement(Fragment, null, children);
	}
	function Button({
		children,
		onClick,
	}: {
		children?: React.ReactNode;
		onClick?: () => void;
	}) {
		return createElement("button", { type: "button", onClick }, children);
	}
	function Tag({
		children,
		color,
	}: {
		children?: React.ReactNode;
		color?: string;
	}) {
		return createElement("span", { "data-color": color }, children);
	}
	function Radio({ children }: { children?: React.ReactNode }) {
		return createElement("span", null, children);
	}
	Radio.Group = PassThrough;
	return {
		Button,
		Radio,
		Tag,
		Tooltip: PassThrough,
		theme: {
			useToken: () => ({
				token: {
					colorBgContainer: "#fff",
					colorBorder: "#ddd",
					colorBorderSecondary: "#eee",
					colorError: "#f00",
					colorErrorBg: "#fee",
					colorFillQuaternary: "#f7f7f7",
					colorFillSecondary: "#eee",
					colorFillTertiary: "#eee",
					colorPrimary: "#1677ff",
					colorSuccess: "#0a0",
					colorSuccessBg: "#efe",
					colorSuccessBorder: "#cdc",
					colorText: "#111",
					colorTextQuaternary: "#999",
					colorTextSecondary: "#555",
					colorTextTertiary: "#777",
					colorWarning: "#fa0",
					colorWarningBg: "#fef",
					colorWarningBorder: "#fdc",
				},
			}),
		},
	};
});

import { ApprovalDecisionCard } from "../ApprovalDecisionCard";

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

describe("ApprovalDecisionCard subagent-source badge", () => {
	it("renders the subagent-source badge when subagentSource is set", () => {
		render(
			createElement(ApprovalDecisionCard, {
				title: "Test approval",
				subagentSource: {
					subagentRunId: "sr-1",
					profileName: "researcher",
				},
			}),
		);
		const badge = container?.querySelector(
			"[data-testid='approval-subagent-source']",
		);
		expect(badge).toBeTruthy();
		expect(badge?.textContent ?? "").toContain("researcher");
	});

	it("omits the subagent-source badge when subagentSource is not set", () => {
		render(
			createElement(ApprovalDecisionCard, {
				title: "Test approval",
			}),
		);
		const badge = container?.querySelector(
			"[data-testid='approval-subagent-source']",
		);
		expect(badge).toBeFalsy();
	});
});
