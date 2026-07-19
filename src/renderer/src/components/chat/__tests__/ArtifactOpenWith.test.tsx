import type * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArtifactOpenWith } from "../ArtifactOpenWith";
import type { FileOpenTarget } from "../../../types/electron";

// ---------- react-i18next mock ----------
// Mirrors ArtifactDiffPreview.test.tsx: returns the fallback string (whatever
// the component passes) so we can assert the zh fallback label ("打开方式")
// directly.
vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (_key: string, fallback?: string) => fallback ?? "",
	}),
}));

// ---------- antd mock ----------
// Minimal Dropdown + Button. The Dropdown mock renders its trigger children
// AND exposes the captured `menu` prop on a data attribute holder so the
// test can invoke `menu.onClick({ key })` directly (jsdom cannot fully
// expand the real antd overlay). Mirrors the PlanCard/ArtifactDiffPreview
// mock approach.
type MenuItem = {
	key: string;
	label: React.ReactNode;
	disabled?: boolean;
};
type MenuProps = {
	items?: MenuItem[];
	onClick?: (info: { key: string }) => void;
};

vi.mock("antd", () => {
	function Button({
		children,
		onClick,
		...rest
	}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
		children?: React.ReactNode;
	}) {
		return (
			<button type="button" onClick={onClick} {...rest}>
				{children}
			</button>
		);
	}

	function Dropdown({
		children,
		menu,
	}: {
		children?: React.ReactNode;
		menu?: MenuProps;
	}) {
		return (
			<div
				data-testid="artifact-open-with"
				data-has-menu={menu ? "true" : "false"}
				ref={(node: HTMLDivElement | null) => {
					// Stash the menu on the DOM node so tests can invoke onClick
					// directly without relying on antd overlay behavior.
					if (node) {
						(
							node as HTMLDivElement & { __menu?: MenuProps }
						).__menu = menu;
					}
				}}
			>
				{children}
			</div>
		);
	}

	return { Button, Dropdown };
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

function getWrapper(): HTMLDivElement {
	const node = container?.querySelector("[data-testid='artifact-open-with']");
	if (!node || !(node instanceof HTMLDivElement)) {
		throw new Error("Dropdown wrapper not found");
	}
	return node;
}

function getTriggerButton(): HTMLButtonElement {
	const button = container?.querySelector(
		"[data-testid='artifact-open-with-trigger']",
	);
	if (!button || !(button instanceof HTMLButtonElement)) {
		throw new Error("trigger button not found");
	}
	return button;
}

function getMenu(): MenuProps {
	const menu = (getWrapper() as HTMLDivElement & { __menu?: MenuProps }).__menu;
	if (!menu) throw new Error("menu prop not captured");
	return menu;
}

const targets: FileOpenTarget[] = [
	{ id: "vscode", label: "Visual Studio Code", kind: "editor", available: true },
	{ id: "vim", label: "Vim", kind: "editor", available: false },
	{ id: "finder", label: "Finder", kind: "finder", available: true },
];

describe("ArtifactOpenWith", () => {
	it("renders the trigger button with the openWith label and exposes target labels via the menu", () => {
		render(
			<ArtifactOpenWith
				openTargets={targets}
				onOpenWith={() => {
					/* noop */
				}}
			/>,
		);

		// Trigger label uses zh fallback ("打开方式").
		const trigger = getTriggerButton();
		expect(trigger.textContent).toContain("打开方式");

		// Wrapper carries the captured menu.
		const wrapper = getWrapper();
		expect(wrapper.getAttribute("data-has-menu")).toBe("true");

		// Menu items mirror the openTargets list (key + label + disabled).
		const menu = getMenu();
		expect(menu.items).toEqual([
			{ key: "vscode", label: "Visual Studio Code", disabled: false },
			{ key: "vim", label: "Vim", disabled: true },
			{ key: "finder", label: "Finder", disabled: false },
		]);
	});

	it("invokes onOpenWith with the correct target id when a menu item is clicked", () => {
		const handleOpenWith = vi.fn();
		render(
			<ArtifactOpenWith
				openTargets={targets}
				onOpenWith={handleOpenWith}
			/>,
		);

		const menu = getMenu();
		if (!menu.onClick) throw new Error("menu.onClick missing");

		act(() => {
			menu.onClick!({ key: "finder" });
		});
		act(() => {
			menu.onClick!({ key: "vscode" });
		});

		expect(handleOpenWith).toHaveBeenCalledTimes(2);
		expect(handleOpenWith).toHaveBeenNthCalledWith(1, "finder");
		expect(handleOpenWith).toHaveBeenNthCalledWith(2, "vscode");
	});

	it("renders nothing in the menu when openTargets is empty but still renders the trigger", () => {
		const handleOpenWith = vi.fn();
		render(
			<ArtifactOpenWith openTargets={[]} onOpenWith={handleOpenWith} />,
		);

		// Trigger still rendered (parent decides whether to mount the control).
		expect(getTriggerButton().textContent).toContain("打开方式");
		// Empty items list.
		expect(getMenu().items).toEqual([]);
	});
});
