import type * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionMeta } from "@super-client/shared-types/project";
import { useChatStore } from "../../../stores/chatStore";
import { useProjectStore } from "../../../stores/projectStore";
import { useSessionListStore } from "../../../stores/sessionListStore";
import { RecoverySettings } from "../RecoverySettings";

const sessionArchiveMocks = vi.hoisted(() => ({
	exportArchive: vi.fn(),
}));

const messageMocks = vi.hoisted(() => ({
	error: vi.fn(),
	success: vi.fn(),
	warning: vi.fn(),
}));

const translateMock = vi.hoisted(() =>
	vi.fn(
		(
			key: string,
			fallbackOrOptions?: string | Record<string, unknown>,
			options?: Record<string, unknown>,
		) => {
			const template =
				typeof fallbackOrOptions === "string" ? fallbackOrOptions : key;
			const vars =
				typeof fallbackOrOptions === "object" ? fallbackOrOptions : options;
			return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
				String(vars?.[name] ?? ""),
			);
		},
	),
);

vi.mock("@ant-design/icons", () => ({
	DownloadOutlined: () => <span aria-hidden="true" />,
	ImportOutlined: () => <span aria-hidden="true" />,
	LinkOutlined: () => <span aria-hidden="true" />,
	ReloadOutlined: () => <span aria-hidden="true" />,
	UndoOutlined: () => <span aria-hidden="true" />,
}));

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: translateMock,
	}),
}));

vi.mock("antd", () => {
	type MockButtonProps = Omit<
		React.ButtonHTMLAttributes<HTMLButtonElement>,
		"type"
	> & {
		icon?: React.ReactNode;
		loading?: boolean;
		type?: string;
	};

	function Button({
		icon,
		children,
		disabled,
		loading,
		onClick,
		type: _type,
	}: MockButtonProps) {
		return (
			<button
				data-loading={loading ? "true" : undefined}
				disabled={disabled}
				onClick={onClick}
			>
				{icon}
				{children}
			</button>
		);
	}

	function Alert({
		message,
		description,
		type,
	}: {
		message?: React.ReactNode;
		description?: React.ReactNode;
		type?: string;
	}) {
		return (
			<div role="status" data-type={type}>
				<div>{message}</div>
				<div>{description}</div>
			</div>
		);
	}

	function Empty({
		description,
	}: {
		description?: React.ReactNode;
		image?: unknown;
		className?: string;
	}) {
		return <div>{description}</div>;
	}
	Empty.PRESENTED_IMAGE_SIMPLE = "simple";

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

	return {
		Alert,
		Button,
		Empty,
		Tag,
		Typography,
		message: messageMocks,
		theme: {
			useToken: () => ({
				token: {
					borderRadiusLG: 8,
					colorBgContainer: "#fff",
					colorBorder: "#ddd",
					colorBorderSecondary: "#eee",
					colorSplit: "#eee",
					colorText: "#111",
					colorTextDescription: "#666",
					colorTextHeading: "#111",
					colorTextSecondary: "#555",
					colorTextTertiary: "#777",
				},
			}),
		},
	};
});

vi.mock("../../../services/sessionArchiveService", () => ({
	sessionArchiveService: {
		exportArchive: sessionArchiveMocks.exportArchive,
	},
}));

vi.mock("../ProjectArchiveManager", () => ({
	ProjectArchiveManager: () => <div>Archived projects test double</div>,
}));

let root: Root | undefined;
let container: HTMLDivElement | undefined;

(
	globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockMeta = (overrides: Partial<SessionMeta>): SessionMeta => ({
	id: "session-1",
	projectId: null,
	chatMode: "agent",
	createdAt: 1,
	updatedAt: 1,
	messageCount: 0,
	...overrides,
});

async function renderRecoverySettings(): Promise<HTMLDivElement> {
	container = document.createElement("div");
	document.body.appendChild(container);
	await act(async () => {
		root = createRoot(container as HTMLDivElement);
		root.render(<RecoverySettings />);
		await Promise.resolve();
	});
	return container;
}

function getButtonsByText(text: string): HTMLButtonElement[] {
	return Array.from(container?.querySelectorAll("button") ?? []).filter((button) =>
		button.textContent?.includes(text),
	);
}

beforeEach(() => {
	sessionArchiveMocks.exportArchive.mockReset();
	messageMocks.error.mockReset();
	messageMocks.success.mockReset();
	messageMocks.warning.mockReset();
	sessionArchiveMocks.exportArchive.mockResolvedValue({
		success: true,
		data: {
			exportDir: "/Users/mark/Library/Application Support/Super Client/exports/session-1",
			manifestPath:
				"/Users/mark/Library/Application Support/Super Client/exports/session-1/manifest.json",
			manifest: {},
		},
	});
	Object.defineProperty(window, "electron", {
		value: {
			projects: {
				listOrphans: vi.fn().mockResolvedValue({ success: true, data: [] }),
				restoreOrphan: vi.fn(),
			},
			legacyData: {
				detect: vi.fn().mockResolvedValue({
					success: true,
					data: { count: 0, alreadyImported: false, legacyDir: "" },
				}),
				importAll: vi.fn(),
			},
		},
		configurable: true,
	});
	useProjectStore.setState({
		projects: [],
		currentProjectId: null,
		loaded: true,
		settingsByProject: {},
	});
	useSessionListStore.setState({
		casual: [],
		byProject: {},
		currentSessionId: null,
		loaded: true,
	});
	useChatStore.setState({
		conversations: [],
		currentConversationId: null,
		isLoadingConversations: false,
	});
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

describe("RecoverySettings session export", () => {
	it("exports the current visible session through sessionArchiveService", async () => {
		useChatStore.setState({
			conversations: [
				{
					id: "visible-session",
					name: "Visible task",
					createdAt: 1,
					updatedAt: 10,
					messageCount: 4,
					preview: "Preview",
					workspaceId: "default",
					chatMode: "agent",
				},
			],
			currentConversationId: "visible-session",
		});
		await renderRecoverySettings();

		await act(async () => {
			getButtonsByText("Export")[0]?.click();
			await Promise.resolve();
		});

		expect(sessionArchiveMocks.exportArchive).toHaveBeenCalledTimes(1);
		expect(sessionArchiveMocks.exportArchive).toHaveBeenCalledWith(
			"visible-session",
		);
		expect(container?.textContent).toContain("Session archive ready");
		expect(container?.textContent).toContain(
			"/Users/mark/Library/Application Support/Super Client/exports/session-1",
		);
	});

	it("renders deleted session rows and reports structured export failure", async () => {
		useSessionListStore.setState({
			casual: [
				mockMeta({
					id: "deleted-session",
					name: "Deleted task",
					deletedAt: 12,
					messageCount: 2,
				}),
			],
		});
		sessionArchiveMocks.exportArchive.mockRejectedValueOnce(
			new Error("raw secret path /Users/mark/private/session.jsonl"),
		);
		await renderRecoverySettings();

		await act(async () => {
			getButtonsByText("Export")[0]?.click();
			await Promise.resolve();
		});

		expect(sessionArchiveMocks.exportArchive).toHaveBeenCalledWith(
			"deleted-session",
		);
		expect(container?.textContent).toContain("Session export failed");
		expect(container?.textContent).toContain(
			"The archive service did not return a usable export directory.",
		);
		expect(container?.textContent).not.toContain("raw secret path");
		expect(messageMocks.error).toHaveBeenCalledWith(
			"Session export failed. No archive was created.",
		);
	});

	it("does not render an export button when no session id is available", async () => {
		await renderRecoverySettings();

		expect(container?.textContent).toContain(
			"No sessions are currently available to export",
		);
		expect(getButtonsByText("Export")).toHaveLength(0);
	});
});
