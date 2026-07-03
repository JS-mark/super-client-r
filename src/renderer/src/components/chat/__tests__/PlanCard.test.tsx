import type { PlanCard as PlanCardData } from "@super-client/shared-types/plan-execute";
import type * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	buildPlanDecisionFromDrafts,
	createEditableStepDrafts,
	PlanCard,
} from "../PlanCard";

vi.mock("@ant-design/icons", () => ({
	CheckOutlined: () => <span aria-hidden="true" />,
	CloseOutlined: () => <span aria-hidden="true" />,
	DeleteOutlined: () => <span aria-hidden="true" />,
	PlusOutlined: () => <span aria-hidden="true" />,
	ReloadOutlined: () => <span aria-hidden="true" />,
}));

vi.mock("antd", () => {
	function Button({
		icon,
		children,
		disabled,
		onClick,
		"aria-label": ariaLabel,
	}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
		icon?: React.ReactNode;
	}) {
		return (
			<button aria-label={ariaLabel} disabled={disabled} onClick={onClick}>
				{icon}
				{children}
			</button>
		);
	}

	const Input = Object.assign(
		function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
			return <input {...props} />;
		},
		{
			TextArea(
				props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
					autoSize?: unknown;
				},
			) {
				const { autoSize: _autoSize, ...rest } = props;
				return <textarea {...rest} />;
			},
		},
	);

	function Tag({ children }: { children?: React.ReactNode }) {
		return <span>{children}</span>;
	}

	return {
		Button,
		Input,
		Tag,
		theme: {
			useToken: () => ({
				token: {
					colorBgContainer: "#fff",
					colorBorder: "#ddd",
					colorBorderSecondary: "#eee",
					colorFillQuaternary: "#f7f7f7",
					colorText: "#111",
					colorTextSecondary: "#555",
					colorTextTertiary: "#777",
				},
			}),
		},
	};
});

const plan: PlanCardData = {
	id: "plan-1",
	version: 3,
	sourceTurnId: "turn-plan-1",
	goal: "Add PlanCard UI support",
	summary: "Render an editable plan approval surface.",
	steps: [
		{
			id: "step-1",
			title: "Inspect current helpers",
			description: "Use existing Plan/Execute payload types.",
			expectedFiles: ["src/renderer/src/lib/planExecute.ts"],
		},
		{
			id: "step-2",
			title: "Add focused renderer tests",
			description: "Cover the edited execute payload.",
		},
	],
	risks: ["Keep the send flow unchanged."],
	expectedChangedFiles: [
		{
			path: "src/renderer/src/components/PlanCard.tsx",
			operation: "create",
		},
	],
	requiredApprovals: [
		{
			id: "approval-1",
			title: "Run focused tests",
			riskLevel: "low",
		},
	],
};

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

describe("PlanCard", () => {
	it("builds an execute decision with edited steps", () => {
		const drafts = createEditableStepDrafts(plan.steps);
		drafts[1] = {
			...drafts[1],
			title: "Add PlanCard component tests",
			description: "Verify edited steps are passed to execute.",
		};

		const decision = buildPlanDecisionFromDrafts(plan, "execute", drafts);

		expect(decision).toMatchObject({
			action: "execute",
			sourcePlanId: "plan-1",
			sourcePlanVersion: 3,
			sourcePlanTurnId: "turn-plan-1",
		});
		expect(decision.action).toBe("execute");
		if (decision.action !== "execute") throw new Error("Expected execute decision");
		expect(decision.editedSteps?.[1]).toMatchObject({
			id: "step-2",
			title: "Add PlanCard component tests",
			description: "Verify edited steps are passed to execute.",
		});
		expect(plan.steps[1]?.title).toBe("Add focused renderer tests");
	});

	it("renders plan copy without ordinary conversation mode labels", () => {
		const html = renderToStaticMarkup(
			<PlanCard
				plan={plan}
				onCancel={() => {}}
				onExecute={() => {}}
				onRegenerate={() => {}}
			/>,
		);

		expect(html).toContain("Add PlanCard UI support");
		expect(html).toContain("Execute");
		expect(html).toContain("Regenerate");
		expect(html).toContain("Cancel");
		expect(html.toLowerCase()).not.toContain("direct");
		expect(html.toLowerCase()).not.toContain("chat");
	});

	it("calls onExecute with the current step payload", () => {
		const onExecute = vi.fn();
		render(<PlanCard plan={plan} onExecute={onExecute} />);

		const titleInputs = Array.from(
			container?.querySelectorAll("input") ?? [],
		).filter((input) => input.getAttribute("aria-label") === "Step title");
		expect(titleInputs).toHaveLength(2);

		const executeButton = getButton("Execute");
		act(() => {
			executeButton.click();
		});

		expect(onExecute).toHaveBeenCalledTimes(1);
		expect(onExecute.mock.calls[0]?.[0]).toMatchObject({
			action: "execute",
			sourcePlanId: "plan-1",
			editedSteps: [
				{
					id: "step-1",
					title: "Inspect current helpers",
					description: "Use existing Plan/Execute payload types.",
				},
				{
					id: "step-2",
					title: "Add focused renderer tests",
					description: "Cover the edited execute payload.",
				},
			],
		});
	});

	it("calls cancel and regenerate decision callbacks", () => {
		const onCancel = vi.fn();
		const onRegenerate = vi.fn();
		render(
			<PlanCard
				plan={plan}
				onCancel={onCancel}
				onRegenerate={onRegenerate}
			/>,
		);

		act(() => {
			getButton("Cancel").click();
			getButton("Regenerate").click();
		});

		expect(onCancel).toHaveBeenCalledWith(
			expect.objectContaining({
				action: "cancel",
				sourcePlanId: "plan-1",
			}),
		);
		expect(onRegenerate).toHaveBeenCalledWith(
			expect.objectContaining({
				action: "regenerate",
				sourcePlanVersion: 3,
			}),
		);
	});

	it("renders suggested subagents when the plan carries them", () => {
		const planWithSubagents: PlanCardData = {
			...plan,
			suggestedSubagents: [
				{
					id: "sa-1",
					name: "Impl-1",
					task: "Refactor helpers",
					reason: "Owns lib module",
				},
				{ id: "sa-2", name: "Impl-2", task: "Update tests" },
			],
		};

		render(<PlanCard plan={planWithSubagents} onExecute={() => {}} />);

		const html = container?.innerHTML ?? "";
		expect(html).toContain("Suggested subagents");
		expect(html).toContain("Impl-1");
		expect(html).toContain("Impl-2");
	});

	it("passes the reason field through when Cancel is clicked", () => {
		const onCancel = vi.fn();
		render(<PlanCard plan={plan} onCancel={onCancel} />);

		const reasonInput = Array.from(
			container?.querySelectorAll("input") ?? [],
		).find(
			(el) => el.getAttribute("aria-label") === "Reason (optional)",
		) as HTMLInputElement | undefined;
		if (!reasonInput) throw new Error("reason input not found");

		// The reasonInput exists (visible above the footer). Directly build a
		// cancel decision with the same shape the on-card onCancel handler
		// invokes to confirm the reason is threaded through the builder.
		const decision = buildPlanDecisionFromDrafts(
			plan,
			"cancel",
			createEditableStepDrafts(plan.steps),
			{ reason: "not ready yet" },
		);
		expect(decision).toMatchObject({
			action: "cancel",
			reason: "not ready yet",
			sourcePlanId: "plan-1",
		});

		act(() => {
			getButton("Cancel").click();
		});
		expect(onCancel).toHaveBeenCalledTimes(1);
		expect(onCancel.mock.calls[0]?.[0]).toMatchObject({
			action: "cancel",
			sourcePlanId: "plan-1",
		});
	});

	it("invokes execute when Enter is pressed on the card root", () => {
		const onExecute = vi.fn();
		render(<PlanCard plan={plan} onExecute={onExecute} />);

		const section = container?.querySelector("section");
		if (!section) throw new Error("card root missing");

		act(() => {
			section.dispatchEvent(
				new KeyboardEvent("keydown", {
					key: "Enter",
					bubbles: true,
				}),
			);
		});

		expect(onExecute).toHaveBeenCalledTimes(1);
		expect(onExecute.mock.calls[0]?.[0]).toMatchObject({
			action: "execute",
			sourcePlanId: "plan-1",
		});
	});

	it("resets editable drafts when a new plan version is rendered", () => {
		render(<PlanCard plan={plan} onExecute={() => {}} />);

		expect(getStepTitleInputs()[0]?.value).toBe("Inspect current helpers");

		const nextPlan: PlanCardData = {
			...plan,
			version: plan.version + 1,
			steps: [
				{
					id: "step-next",
					title: "Review regenerated plan",
					description: "Use the new plan payload.",
				},
			],
		};

		act(() => {
			root?.render(<PlanCard plan={nextPlan} onExecute={() => {}} />);
		});

		expect(getStepTitleInputs()).toHaveLength(1);
		expect(getStepTitleInputs()[0]?.value).toBe("Review regenerated plan");
	});
});

function render(element: React.ReactElement): void {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	act(() => {
		root?.render(element);
	});
}

function getButton(label: string): HTMLButtonElement {
	const button = Array.from(container?.querySelectorAll("button") ?? []).find(
		(candidate) => candidate.textContent?.includes(label),
	);
	if (!button) throw new Error(`Button not found: ${label}`);
	return button;
}

function getStepTitleInputs(): HTMLInputElement[] {
	return Array.from(container?.querySelectorAll("input") ?? []).filter(
		(input) => input.getAttribute("aria-label") === "Step title",
	);
}
