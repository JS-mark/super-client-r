import type * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SubagentInspectorEntry } from "../../../../hooks/useSubagentsInspectorData";

// ---------- i18n mock ----------
vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, fallbackOrOpts?: unknown, maybeOpts?: unknown) => {
			// Support t(key, fallback, opts) and t(key, opts).
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
		"data-testid": testId,
	}: {
		children?: React.ReactNode;
		color?: string;
		"data-testid"?: string;
	}) {
		return (
			<span data-testid={testId} data-color={color}>
				{children}
			</span>
		);
	}
	function Button({
		children,
		onClick,
		"data-testid": testId,
		"aria-label": ariaLabel,
		icon,
	}: {
		children?: React.ReactNode;
		onClick?: (e: React.MouseEvent) => void;
		"data-testid"?: string;
		"aria-label"?: string;
		icon?: React.ReactNode;
	}) {
		return (
			<button type="button" data-testid={testId} aria-label={ariaLabel} onClick={onClick}>
				{icon}
				{children}
			</button>
		);
	}
	return {
		Button,
		Tag,
		theme: {
			useToken: () => ({
				token: {
					colorText: "#111",
					colorTextSecondary: "#555",
					colorTextTertiary: "#999",
				},
			}),
		},
	};
});

vi.mock("@ant-design/icons", () => ({
	RobotOutlined: () => <span aria-hidden="true" data-icon="robot" />,
	StopOutlined: () => <span aria-hidden="true" data-icon="stop" />,
}));

// ---------- hook mock ----------
const entriesMock: { current: SubagentInspectorEntry[] } = { current: [] };
vi.mock("../../../../hooks/useSubagentsInspectorData", () => ({
	useSubagentsInspectorData: () => entriesMock.current,
}));

import { SubagentsInspectorSection } from "../SubagentsInspectorSection";

let root: Root | undefined;
let container: HTMLDivElement | undefined;

(
	globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
	entriesMock.current = [];
});

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

describe("SubagentsInspectorSection", () => {
	it("renders an empty hint when no subagents ran", () => {
		render(<SubagentsInspectorSection />);
		expect(
			container?.querySelector("[data-testid='subagents-inspector-empty']"),
		).toBeTruthy();
		expect(container?.textContent ?? "").toContain(
			"No subagents have run in this conversation.",
		);
	});

	it("renders two entries in the order provided by the hook (already desc-sorted)", () => {
		entriesMock.current = [
			{
				subagentRunId: "sr-new",
				profileName: "planner",
				taskGoal: "plan things",
				status: "running",
				startedAt: 500,
				hasError: false,
			},
			{
				subagentRunId: "sr-old",
				profileName: "researcher",
				taskGoal: "look up",
				status: "completed",
				startedAt: 100,
				endedAt: 200,
				hasError: false,
			},
		];
		render(<SubagentsInspectorSection />);
		const rows = Array.from(
			container?.querySelectorAll(
				"[data-testid='subagents-inspector-row']",
			) ?? [],
		);
		expect(rows).toHaveLength(2);
		expect(rows[0].textContent).toContain("planner");
		expect(rows[1].textContent).toContain("researcher");
	});

	it("shows a status chip whose label + color match the status", () => {
		entriesMock.current = [
			{
				subagentRunId: "sr-fail",
				taskGoal: "boom",
				status: "failed",
				startedAt: 1,
				hasError: true,
			},
		];
		render(<SubagentsInspectorSection />);
		const chip = container?.querySelector(
			"[data-testid='subagents-inspector-status']",
		);
		expect(chip).toBeTruthy();
		expect(chip?.getAttribute("data-color")).toBe("error");
		expect(chip?.textContent).toBe("failed");
	});

	it("renders duration when endedAt is set", () => {
		entriesMock.current = [
			{
				subagentRunId: "sr-done",
				profileName: "worker",
				taskGoal: "task",
				status: "completed",
				startedAt: 1000,
				endedAt: 3500, // 2.5s
				hasError: false,
			},
		];
		render(<SubagentsInspectorSection />);
		const duration = container?.querySelector(
			"[data-testid='subagents-inspector-duration']",
		);
		expect(duration).toBeTruthy();
		expect(duration?.textContent).toContain("2.5");
	});

	it("falls back to the fallback name label when profileName + taskGoal are empty", () => {
		entriesMock.current = [
			{
				subagentRunId: "sr-fallback",
				taskGoal: "",
				status: "spawned",
				startedAt: 1,
				hasError: false,
			},
		];
		render(<SubagentsInspectorSection />);
		expect(container?.textContent ?? "").toContain("Subagent");
	});

	it("shows a stop button only for live rows when onStop is provided", () => {
		entriesMock.current = [
			{
				subagentRunId: "sr-running",
				taskGoal: "busy",
				status: "running",
				startedAt: 10,
				hasError: false,
			},
			{
				subagentRunId: "sr-done",
				taskGoal: "done",
				status: "completed",
				startedAt: 5,
				endedAt: 20,
				hasError: false,
			},
		];
		render(<SubagentsInspectorSection onStop={() => {}} />);
		const stops = container?.querySelectorAll(
			"[data-testid='subagents-inspector-stop']",
		);
		// Only the running row is stoppable.
		expect(stops?.length).toBe(1);
	});

	it("does not render stop buttons when onStop is omitted", () => {
		entriesMock.current = [
			{
				subagentRunId: "sr-running",
				taskGoal: "busy",
				status: "running",
				startedAt: 10,
				hasError: false,
			},
		];
		render(<SubagentsInspectorSection />);
		const stops = container?.querySelectorAll(
			"[data-testid='subagents-inspector-stop']",
		);
		expect(stops?.length).toBe(0);
	});

	it("stop click fires onStop with the entry and does NOT trigger onSelect", () => {
		const onStop = vi.fn();
		const onSelect = vi.fn();
		entriesMock.current = [
			{
				subagentRunId: "sr-running",
				taskGoal: "busy",
				status: "running",
				startedAt: 10,
				hasError: false,
			},
		];
		render(<SubagentsInspectorSection onStop={onStop} onSelect={onSelect} />);
		const stopBtn = container?.querySelector<HTMLButtonElement>(
			"[data-testid='subagents-inspector-stop']",
		);
		expect(stopBtn).toBeTruthy();
		act(() => {
			stopBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(onStop).toHaveBeenCalledTimes(1);
		expect(onStop.mock.calls[0][0].subagentRunId).toBe("sr-running");
		expect(onSelect).not.toHaveBeenCalled();
	});

	it("row click (not on stop) fires onSelect with the entry", () => {
		const onSelect = vi.fn();
		entriesMock.current = [
			{
				subagentRunId: "sr-1",
				taskGoal: "goal",
				status: "completed",
				startedAt: 10,
				endedAt: 20,
				hasError: false,
			},
		];
		render(<SubagentsInspectorSection onSelect={onSelect} />);
		const row = container?.querySelector<HTMLDivElement>(
			"[data-testid='subagents-inspector-row']",
		);
		act(() => {
			row?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(onSelect).toHaveBeenCalledTimes(1);
		expect(onSelect.mock.calls[0][0].subagentRunId).toBe("sr-1");
	});
});
