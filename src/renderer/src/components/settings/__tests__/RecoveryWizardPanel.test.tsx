import type * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildRecoveryWizardModel } from "@/lib/recoveryWizard";
import { RecoveryWizardPanel } from "../RecoveryWizardPanel";

// Mock antd to its smallest usable surface. The real antd Button mounts a
// click-wave effect that crashes under jsdom (reads window.Node.ELEMENT_NODE
// off an undefined ref); the existing RecoverySettings.test.tsx mocks antd
// the same way. Only the components this panel uses are stubbed.
	vi.mock("antd", () => {
	type MockButtonProps = Omit<
		React.ButtonHTMLAttributes<HTMLButtonElement>,
		"type"
	> & { icon?: React.ReactNode; loading?: boolean; type?: string };
	function Button({
		icon,
		children,
		disabled,
		loading,
		onClick,
		type: _type,
		...rest
	}: MockButtonProps) {
		return (
			<button
				data-loading={loading ? "true" : undefined}
				disabled={disabled}
				onClick={onClick}
				{...rest}
			>
				{icon}
				{children}
			</button>
		);
	}
	function Tag({ children }: { children?: React.ReactNode; color?: string }) {
		return <span>{children}</span>;
	}
	const Typography = {
		Text({
			children,
			className,
		}: {
			children?: React.ReactNode;
			className?: string;
			type?: string;
		}) {
			return <span className={className}>{children}</span>;
		},
	};
	// The panel reads `theme.useToken()` for border colors; return a stable token.
	const theme = {
		useToken: () => ({
			token: {
				colorBorderSecondary: "#eee",
				colorBgContainer: "#fff",
				colorTextSecondary: "#666",
			},
		}),
	};
	return { Button, Tag, Typography, theme };
});

// The panel is a dumb view; we feed it a model + callbacks directly.

function makeModel(overrides?: Partial<{
	archivedCount: number;
	orphanCount: number;
	legacyCount: number;
	legacyAlreadyImported: boolean;
	exportableProjectCount: number;
	exportableSessionCount: number;
}>) {
	return buildRecoveryWizardModel({
		archivedCount: 1,
		orphanCount: 1,
		legacyCount: 1,
		legacyAlreadyImported: false,
		exportableProjectCount: 1,
		exportableSessionCount: 1,
		...overrides,
	});
}

interface Harness {
	root: Root;
	container: HTMLDivElement;
}

async function renderPanel(element: React.ReactElement): Promise<Harness> {
	const container = document.createElement("div");
	document.body.appendChild(container);
	const root = createRoot(container);
	// Async act + a microtask tick lets antd's passive effects (button wave
	// etc.) settle; rendering synchronously throws inside antd's wave effect.
	await act(async () => {
		root.render(element);
		await Promise.resolve();
	});
	return { root, container };
}

function click(container: HTMLElement, testId: string): void {
	const el = container.querySelector(`[data-testid='${testId}']`);
	if (!el) throw new Error(`element ${testId} not found`);
	act(() => {
		(el as HTMLElement).click();
	});
}

function currentStepId(container: HTMLElement): string | null {
	return (
		container
			.querySelector("[data-testid='recovery-wizard-current-step']")
			?.getAttribute("data-step") ?? null
	);
}

describe("RecoveryWizardPanel", () => {
	let harness: Harness | undefined;

	beforeEach(() => {
		harness = undefined;
	});
	afterEach(() => {
		const h = harness;
		if (h) {
			act(() => {
				h.root.unmount();
			});
			h.container.remove();
		}
	});

	it("renders the recommended step first; Prev is disabled only on the very first step", async () => {
		const model = makeModel({ archivedCount: 1 });
		harness = await renderPanel(
			<RecoveryWizardPanel
				model={model}
				onRefresh={vi.fn()}
				onImportLegacy={vi.fn()}
				onExportDiagnostics={vi.fn()}
			/>,
		);
		// Recommended step is `archived` (index 1) — Prev is enabled (can go back to refresh).
		expect(currentStepId(harness.container)).toBe("archived");
		let prev = harness.container.querySelector(
			"[data-testid='recovery-wizard-prev']",
		) as HTMLButtonElement;
		expect(prev.disabled).toBe(false);
		// Navigate back to `refresh` (index 0) — now Prev should disable.
		click(harness.container, "recovery-wizard-prev");
		expect(currentStepId(harness.container)).toBe("refresh");
		prev = harness.container.querySelector(
			"[data-testid='recovery-wizard-prev']",
		) as HTMLButtonElement;
		expect(prev.disabled).toBe(true);
	});

	it("advances through steps via Next and back via Previous", async () => {
		const model = makeModel();
		harness = await renderPanel(
			<RecoveryWizardPanel
				model={model}
				onRefresh={vi.fn()}
				onImportLegacy={vi.fn()}
				onExportDiagnostics={vi.fn()}
			/>,
		);
		// archived → orphans
		click(harness.container, "recovery-wizard-next");
		expect(currentStepId(harness.container)).toBe("orphans");
		// back to archived
		click(harness.container, "recovery-wizard-prev");
		expect(currentStepId(harness.container)).toBe("archived");
	});

	it("disables Next on the last step", async () => {
		const model = makeModel();
		harness = await renderPanel(
			<RecoveryWizardPanel
				model={model}
				onRefresh={vi.fn()}
				onImportLegacy={vi.fn()}
				onExportDiagnostics={vi.fn()}
			/>,
		);
		// Walk to the last step (exports).
		for (let i = 0; i < model.steps.length - 1; i++) {
			click(harness.container, "recovery-wizard-next");
		}
		expect(currentStepId(harness.container)).toBe("exports");
		const next = harness.container.querySelector(
			"[data-testid='recovery-wizard-next']",
		) as HTMLButtonElement;
		expect(next.disabled).toBe(true);
	});

	it("renders a per-step action button that calls the archived-restore handler", async () => {
		const model = makeModel({ archivedCount: 1 });
		const onRestoreArchived = vi.fn();
		harness = await renderPanel(
			<RecoveryWizardPanel
				model={model}
				onRefresh={vi.fn()}
				onImportLegacy={vi.fn()}
				onExportDiagnostics={vi.fn()}
				onRestoreArchived={onRestoreArchived}
			/>,
		);
		// Recommended step is archived → its action button should fire the handler.
		click(harness.container, "recovery-wizard-step-action");
		expect(onRestoreArchived).toHaveBeenCalledOnce();
	});

	it("renders the orphan-restore action button on the orphans step", async () => {
		const model = makeModel({ archivedCount: 0, orphanCount: 1 });
		const onRestoreOrphan = vi.fn();
		harness = await renderPanel(
			<RecoveryWizardPanel
				model={model}
				onRefresh={vi.fn()}
				onImportLegacy={vi.fn()}
				onExportDiagnostics={vi.fn()}
				onRestoreOrphan={onRestoreOrphan}
			/>,
		);
		// Recommended step is orphans (archived count is 0).
		expect(currentStepId(harness.container)).toBe("orphans");
		click(harness.container, "recovery-wizard-step-action");
		expect(onRestoreOrphan).toHaveBeenCalledOnce();
	});

	it("hides the step action button when the step's handler is not provided", async () => {
		// No onRestoreArchived passed → archived step should show NO action button
		// (actionDescriptor returns null when the handler is absent).
		const model = makeModel({ archivedCount: 1 });
		harness = await renderPanel(
			<RecoveryWizardPanel
				model={model}
				onRefresh={vi.fn()}
				onImportLegacy={vi.fn()}
				onExportDiagnostics={vi.fn()}
				// onRestoreArchived intentionally omitted
			/>,
		);
		expect(currentStepId(harness.container)).toBe("archived");
		const action = harness.container.querySelector(
			"[data-testid='recovery-wizard-step-action']",
		);
		expect(action).toBeNull();
	});

	it("re-seeds to the recommended step when the recommendation changes", async () => {
		const model = makeModel({ archivedCount: 1 });
		harness = await renderPanel(
			<RecoveryWizardPanel
				model={model}
				onRefresh={vi.fn()}
				onImportLegacy={vi.fn()}
				onExportDiagnostics={vi.fn()}
			/>,
		);
		expect(currentStepId(harness.container)).toBe("archived");
		// Advance away from the recommended step.
		click(harness.container, "recovery-wizard-next");
		expect(currentStepId(harness.container)).toBe("orphans");
		// Re-render with a model whose recommendation moved to `legacy`.
		const nextModel = makeModel({
			archivedCount: 0,
			orphanCount: 0,
			legacyCount: 1,
		});
		await act(async () => {
			harness!.root.render(
				<RecoveryWizardPanel
					model={nextModel}
					onRefresh={vi.fn()}
					onImportLegacy={vi.fn()}
					onExportDiagnostics={vi.fn()}
				/>,
			);
			await Promise.resolve();
		});
		expect(currentStepId(harness.container)).toBe("legacy");
	});
});
