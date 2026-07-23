import type * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SETTINGS_NAVIGATION_GROUPS } from "../../../lib/settingsNavigation";

const navigateMock = vi.hoisted(() => vi.fn());

vi.mock("react-router-dom", async () => {
	const actual =
		await vi.importActual<typeof import("react-router-dom")>(
			"react-router-dom",
		);
	return {
		...actual,
		useNavigate: () => navigateMock,
	};
});

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (
			key: string,
			fallbackOrOptions?: string | Record<string, unknown>,
		) => {
			return typeof fallbackOrOptions === "string" ? fallbackOrOptions : key;
		},
	}),
}));

vi.mock("@ant-design/icons", () => ({
	ApiOutlined: () => <span aria-hidden />,
	BellOutlined: () => <span aria-hidden />,
	BugOutlined: () => <span aria-hidden />,
	CloudOutlined: () => <span aria-hidden />,
	CloudServerOutlined: () => <span aria-hidden />,
	FolderOutlined: () => <span aria-hidden />,
	HistoryOutlined: () => <span aria-hidden />,
	InfoCircleOutlined: () => <span aria-hidden />,
	KeyOutlined: () => <span aria-hidden />,
	LeftOutlined: () => <span aria-hidden />,
	RocketOutlined: () => <span aria-hidden />,
	SettingOutlined: () => <span aria-hidden />,
	ToolOutlined: () => <span aria-hidden />,
}));

vi.mock("antd", () => {
	const useToken = () => ({
		token: {
			colorText: "#000",
			colorTextSecondary: "#333",
			colorTextTertiary: "#666",
			colorPrimary: "#1677ff",
			colorPrimaryBg: "#e6f4ff",
			colorBorder: "#ddd",
			colorBorderSecondary: "#eee",
			colorFillTertiary: "#f5f5f5",
			colorBgLayout: "#fafafa",
		},
	});
	return {
		theme: { useToken },
		Divider: ({ children }: { children?: React.ReactNode }) => (
			<hr>{children}</hr>
		),
		Tag: ({ children }: { children?: React.ReactNode }) => (
			<span>{children}</span>
		),
		Tooltip: ({ children }: { children?: React.ReactNode }) => (
			<>{children}</>
		),
		message: {
			info: () => undefined,
			error: () => undefined,
			success: () => undefined,
		},
	};
});

// Stub the userStore so we don't rely on persist middleware side-effects.
vi.mock("../../../stores/userStore", () => ({
	useUserStore: () => ({
		user: null,
		isLoggedIn: false,
	}),
	getUserInitials: (name: string) => (name ? name[0].toUpperCase() : "?"),
	getAvatarColor: () => "bg-slate-500",
}));

// Import AFTER mocks so hooks resolve to the mocked module.
import { SettingsRail } from "../SettingsRail";

let container: HTMLDivElement | null = null;
let root: Root | null = null;

(
	globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function installWindowEventTargetShim(): void {
	const target = new EventTarget();
	Object.assign(window, {
		addEventListener: target.addEventListener.bind(target),
		removeEventListener: target.removeEventListener.bind(target),
		dispatchEvent: target.dispatchEvent.bind(target),
	});
}

function renderAt(initialPath: string) {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	act(() => {
		root!.render(
			<MemoryRouter initialEntries={[initialPath]}>
				<Routes>
					<Route path="/settings/*" element={<SettingsRail />} />
				</Routes>
			</MemoryRouter>,
		);
	});
}

beforeEach(() => {
	navigateMock.mockReset();
	installWindowEventTargetShim();
});

afterEach(() => {
	act(() => {
		root?.unmount();
	});
	container?.remove();
	container = null;
	root = null;
});

describe("SettingsRail", () => {
	it("renders one button per SETTINGS_NAVIGATION_GROUPS entry, in order", () => {
		renderAt("/settings/general");
		const nav = container!.querySelector("nav");
		const items = nav
			? Array.from(nav.querySelectorAll<HTMLButtonElement>("button"))
			: [];
		expect(items.length).toBe(SETTINGS_NAVIGATION_GROUPS.length);
		expect(items.length).toBe(11);

		const labels = items.map((el) => el.getAttribute("aria-label"));
		expect(labels).toEqual(
			SETTINGS_NAVIGATION_GROUPS.map((g) => g.fallback),
		);
	});

	it("marks the item matching the current pathname as active", () => {
		renderAt("/settings/models");
		const modelsButton = container!.querySelector<HTMLButtonElement>(
			'button[aria-label="Models"]',
		);
		expect(modelsButton?.getAttribute("data-active")).toBe("true");
		expect(modelsButton?.getAttribute("aria-current")).toBe("page");

		const generalButton = container!.querySelector<HTMLButtonElement>(
			'button[aria-label="General"]',
		);
		expect(generalButton?.getAttribute("data-active")).toBe("false");
	});

	it("navigates to /settings/<key> when an item is clicked", () => {
		renderAt("/settings/general");
		const modelsButton = container!.querySelector<HTMLButtonElement>(
			'button[aria-label="Models"]',
		);
		act(() => {
			modelsButton?.click();
		});
		expect(navigateMock).toHaveBeenCalledWith("/settings/models");
	});

	it("Back to workspace always navigates to /chat (not history.back)", () => {
		renderAt("/settings/general");
		const backBtn = container!.querySelector<HTMLButtonElement>(
			'button[aria-label="返回工作区"]',
		);
		expect(backBtn).not.toBeNull();
		act(() => {
			backBtn?.click();
		});
		// "返回工作区" 语义 = 回到工作区，不使用 history.back()：Settings 内部跳转
		// 会污染 history，navigate(-1) 会把用户带回上一个 Settings tab 而不是工作区。
		expect(navigateMock).toHaveBeenCalledWith("/chat");
	});
});
