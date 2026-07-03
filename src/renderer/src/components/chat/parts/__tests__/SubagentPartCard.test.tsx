import type * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SubagentMessagePart } from "@super-client/shared-types/chat";
import type {
	SubagentRunSummary,
	SubagentTaskStatus,
} from "@super-client/shared-types/subagent";

vi.mock("antd", () => ({
	Tag: ({
		children,
		color,
		className,
		style,
		bordered: _bordered,
		...rest
	}: {
		children?: React.ReactNode;
		color?: string;
		className?: string;
		style?: React.CSSProperties;
		bordered?: boolean;
		[key: string]: unknown;
	}) => (
		<span
			{...(rest as Record<string, unknown>)}
			className={`ant-tag ant-tag-${color ?? "default"} ${className ?? ""}`.trim()}
			style={style}
		>
			{children}
		</span>
	),
}));

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (
			key: string,
			defaultOrOptions?:
				| string
				| { defaultValue?: string; [key: string]: unknown },
			maybeOptions?: { [key: string]: unknown },
		) => {
			const defaultValue =
				typeof defaultOrOptions === "string"
					? defaultOrOptions
					: typeof defaultOrOptions?.defaultValue === "string"
						? defaultOrOptions.defaultValue
						: key;
			const options: Record<string, unknown> =
				typeof defaultOrOptions === "object" && defaultOrOptions !== null
					? (defaultOrOptions as Record<string, unknown>)
					: typeof maybeOptions === "object" && maybeOptions !== null
						? (maybeOptions as Record<string, unknown>)
						: {};
			return defaultValue.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
				name in options ? String(options[name]) : `{{${name}}}`,
			);
		},
	}),
}));

import { SubagentPartCard } from "../SubagentPartCard";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let container: HTMLDivElement | undefined;
let root: Root | undefined;

function makeRun(overrides: Partial<SubagentRunSummary> = {}): SubagentRunSummary {
	return {
		subagentRunId: "sub-1",
		parentRunId: "parent-1",
		taskGoal: "Investigate flaky tests",
		status: "running",
		startedAt: 1_000,
		...overrides,
	};
}

function makePart(
	overrides: Partial<SubagentMessagePart> = {},
	runOverrides: Partial<SubagentRunSummary> = {},
): SubagentMessagePart {
	return {
		id: "assistant-1:subagent:sub-1",
		type: "subagent",
		state: "complete",
		createdAt: 100,
		updatedAt: 200,
		run: makeRun(runOverrides),
		...overrides,
	};
}

function mount(part: SubagentMessagePart): HTMLElement {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	act(() => {
		root?.render(<SubagentPartCard part={part} />);
	});
	const root_el = container.querySelector(
		`[data-part-id="subagent-card-${part.run.subagentRunId}"]`,
	) as HTMLElement | null;
	if (!root_el) throw new Error("card root not found");
	return root_el;
}

function keyDown(target: HTMLElement, key: string) {
	act(() => {
		const event = new KeyboardEvent("keydown", {
			key,
			bubbles: true,
			cancelable: true,
		});
		target.dispatchEvent(event);
	});
}

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

describe("SubagentPartCard", () => {
	it("renders collapsed by default with profile name and status chip", () => {
		const part = makePart({}, {
			profileName: "Docs Explorer",
			status: "running",
			toolCallCount: 3,
		});
		const el = mount(part);

		expect(el.getAttribute("data-expanded")).toBe("false");
		expect(el.textContent).toContain("Docs Explorer");
		expect(el.textContent).toContain("Running");
		expect(el.querySelector('[data-testid="subagent-card-expanded"]')).toBeNull();
		expect(el.querySelector('[data-testid="subagent-card-triangle"]')?.textContent).toBe("▶");
	});

	it("falls back to taskGoal when profileName is absent", () => {
		const part = makePart({}, {
			profileName: undefined,
			taskGoal: "Trace memory leak",
		});
		const el = mount(part);

		expect(el.textContent).toContain("Trace memory leak");
	});

	it("falls back to fallbackName when profileName and taskGoal are absent", () => {
		const part = makePart({}, {
			profileName: undefined,
			taskGoal: "",
		});
		const el = mount(part);

		// Header label falls back to the fallbackName default ("Subagent").
		expect(el.textContent).toContain("Subagent");
	});

	it("status chip text and color differ per status", () => {
		const statuses: SubagentTaskStatus[] = [
			"spawned",
			"running",
			"completed",
			"failed",
			"cancelled",
		];
		const seenColors = new Set<string>();
		for (const status of statuses) {
			const part = makePart(
				{ id: `part-${status}` },
				{ subagentRunId: `sub-${status}`, status },
			);
			const el = mount(part);
			const chip = el.querySelector(
				'[data-testid="subagent-card-status"]',
			) as HTMLElement | null;
			expect(chip).not.toBeNull();
			expect(chip?.getAttribute("data-status")).toBe(status);
			const className = chip?.className ?? "";
			// AntD Tag applies a color-specific class like `ant-tag-blue`, `ant-tag-red`, etc.
			seenColors.add(className);
			// Reset root between iterations.
			if (root) {
				act(() => {
					root?.unmount();
				});
			}
			root = undefined;
			container?.remove();
			container = undefined;
		}
		// Distinct statuses should render distinguishable chip class names
		// (colors: blue, blue, green, red, default -> at least 4 unique).
		expect(seenColors.size).toBeGreaterThanOrEqual(4);
	});

	it("clicking the row expands and shows summary text", () => {
		const part = makePart({}, {
			profileName: "Search Agent",
			summary: "Located target modules and verified imports.",
			status: "completed",
		});
		const el = mount(part);

		expect(el.getAttribute("data-expanded")).toBe("false");
		act(() => {
			el.click();
		});
		expect(el.getAttribute("data-expanded")).toBe("true");
		const expanded = el.querySelector(
			'[data-testid="subagent-card-expanded"]',
		);
		expect(expanded).not.toBeNull();
		expect(expanded?.textContent).toContain(
			"Located target modules and verified imports.",
		);
		expect(el.querySelector('[data-testid="subagent-card-triangle"]')?.textContent).toBe("▼");
	});

	it("Enter and Space keydown toggle expansion", () => {
		const part = makePart({}, { summary: "Some summary" });
		const el = mount(part);

		expect(el.getAttribute("data-expanded")).toBe("false");
		keyDown(el, "Enter");
		expect(el.getAttribute("data-expanded")).toBe("true");
		keyDown(el, " ");
		expect(el.getAttribute("data-expanded")).toBe("false");
	});

	it("failed status shows errorMessage but other statuses do not", () => {
		const failedPart = makePart(
			{ id: "part-failed" },
			{
				subagentRunId: "sub-failed",
				status: "failed",
				errorMessage: "boom: task exploded",
				summary: "N/A",
			},
		);
		const el = mount(failedPart);
		act(() => {
			el.click();
		});
		expect(el.textContent).toContain("boom: task exploded");
		expect(el.textContent).toContain("Error");

		// Reset and check a completed run does NOT show error section.
		act(() => {
			root?.unmount();
		});
		root = undefined;
		container?.remove();
		container = undefined;

		const completedPart = makePart(
			{ id: "part-completed" },
			{
				subagentRunId: "sub-completed",
				status: "completed",
				errorMessage: "leftover error should not render",
				summary: "All good",
			},
		);
		const el2 = mount(completedPart);
		act(() => {
			el2.click();
		});
		expect(el2.textContent).not.toContain("leftover error should not render");
	});

	it("hides token chip when tokenUsage is undefined and shows it otherwise", () => {
		const noUsage = makePart({}, { tokenUsage: undefined });
		const el1 = mount(noUsage);
		expect(el1.querySelector('[data-testid="subagent-card-tokens"]')).toBeNull();

		act(() => {
			root?.unmount();
		});
		root = undefined;
		container?.remove();
		container = undefined;

		const withUsage = makePart(
			{ id: "part-with-tokens" },
			{
				subagentRunId: "sub-with-tokens",
				tokenUsage: { input: 120, output: 45 },
			},
		);
		const el2 = mount(withUsage);
		const chip = el2.querySelector(
			'[data-testid="subagent-card-tokens"]',
		) as HTMLElement | null;
		expect(chip).not.toBeNull();
		expect(chip?.textContent).toContain("165");
	});

	it("tool count chip shows toolCallCount value", () => {
		const part = makePart({}, { toolCallCount: 7 });
		const el = mount(part);
		const chip = el.querySelector(
			'[data-testid="subagent-card-tools"]',
		) as HTMLElement | null;
		expect(chip).not.toBeNull();
		expect(chip?.textContent).toContain("7");
	});
});
