import type * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Navigate, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

// Mock i18next before importing components that call useTranslation.
vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (
			key: string,
			fallbackOrOptions?: string | Record<string, unknown>,
		) => {
			return typeof fallbackOrOptions === "string" ? fallbackOrOptions : key;
		},
	}),
	initReactI18next: { type: "3rdParty", init: () => undefined },
}));

// Mock heavy child components so we can assert routing without pulling in the world.
vi.mock("../../../components/settings/GeneralSettings", () => ({
	GeneralSettings: () => <div data-testid="general-content">General!</div>,
}));

vi.mock("../../../components/models/ModelList", () => ({
	ModelList: () => <div data-testid="models-content">Models!</div>,
}));

vi.mock("../../../components/settings/ApiKeysConfig", () => ({
	ApiKeysConfig: () => <div />,
}));

// Provide a minimal MainLayout that just renders children (avoid full app shell).
vi.mock("../../../components/layout/MainLayout", () => ({
	MainLayout: ({ children }: { children: React.ReactNode }) => (
		<div data-testid="main-layout">{children}</div>
	),
}));

// Stub useTitle so we don't touch TitleBar state.
vi.mock("../../../hooks/useTitle", () => ({
	useTitle: () => undefined,
}));

// Stub AboutModal (Antd Modal + portals are noisy in jsdom).
vi.mock("../../../components/AboutModal", () => ({
	AboutModal: () => null,
}));

// Stub appService to avoid IPC calls.
vi.mock("../../../services/appService", () => ({
	appService: {
		getInfo: () => Promise.resolve(null),
	},
}));

// Stub antd token hook + heavy components to keep jsdom happy.
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
			colorBgContainer: "#fff",
		},
	});
	const Passthrough = ({ children }: { children?: React.ReactNode }) => (
		<div>{children}</div>
	);
	return {
		theme: { useToken },
		Divider: ({ children }: { children?: React.ReactNode }) => (
			<hr>{children}</hr>
		),
		Tag: ({ children }: { children?: React.ReactNode }) => (
			<span>{children}</span>
		),
		Card: Passthrough,
		message: {
			info: () => undefined,
			error: () => undefined,
			success: () => undefined,
		},
	};
});

vi.mock("@ant-design/icons", () => ({
	ApiOutlined: () => <span aria-hidden />,
	BellOutlined: () => <span aria-hidden />,
	BugOutlined: () => <span aria-hidden />,
	CloudOutlined: () => <span aria-hidden />,
	FolderOutlined: () => <span aria-hidden />,
	HistoryOutlined: () => <span aria-hidden />,
	InfoCircleOutlined: () => <span aria-hidden />,
	KeyOutlined: () => <span aria-hidden />,
	LeftOutlined: () => <span aria-hidden />,
	RobotOutlined: () => <span aria-hidden />,
	RocketOutlined: () => <span aria-hidden />,
	SettingOutlined: () => <span aria-hidden />,
	ToolOutlined: () => <span aria-hidden />,
}));

vi.mock("../../../stores/userStore", () => ({
	useUserStore: () => ({ user: null, isLoggedIn: false }),
	getUserInitials: (name: string) => (name ? name[0].toUpperCase() : "?"),
	getAvatarColor: () => "bg-slate-500",
}));

// Import AFTER mocks.
import Settings from "../../Settings";
import GeneralPage from "../GeneralPage";
import ModelsPage from "../ModelsPage";

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function mount(initialPath: string) {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	act(() => {
		root!.render(
			<MemoryRouter initialEntries={[initialPath]}>
				<Routes>
					<Route path="/settings" element={<Settings />}>
						<Route index element={<Navigate to="general" replace />} />
						<Route path="general" element={<GeneralPage />} />
						<Route path="models" element={<ModelsPage />} />
					</Route>
				</Routes>
			</MemoryRouter>,
		);
	});
}

afterEach(() => {
	act(() => {
		root?.unmount();
	});
	container?.remove();
	container = null;
	root = null;
});

describe("Settings shell", () => {
	it("renders General content at /settings/general", () => {
		mount("/settings/general");
		expect(container!.querySelector('[data-testid="general-content"]')).not.toBeNull();
	});

	it("renders Models content at /settings/models", () => {
		mount("/settings/models");
		expect(container!.querySelector('[data-testid="models-content"]')).not.toBeNull();
	});

	it("redirects /settings (index) to /settings/general", () => {
		mount("/settings");
		expect(container!.querySelector('[data-testid="general-content"]')).not.toBeNull();
	});
});
