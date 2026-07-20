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
	exportProjectArchive: vi.fn(),
}));

const diagnosticExportMocks = vi.hoisted(() => ({
	export: vi.fn(),
}));

const fileActionMocks = vi.hoisted(() => ({
	copyPath: vi.fn(),
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
	CopyOutlined: () => <span aria-hidden="true" />,
	DeleteOutlined: () => <span aria-hidden="true" />,
	DownloadOutlined: () => <span aria-hidden="true" />,
	ExclamationCircleFilled: () => <span aria-hidden="true" />,
	ImportOutlined: () => <span aria-hidden="true" />,
	LeftOutlined: () => <span aria-hidden="true" />,
	LinkOutlined: () => <span aria-hidden="true" />,
	ReloadOutlined: () => <span aria-hidden="true" />,
	RightOutlined: () => <span aria-hidden="true" />,
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

	// modal.confirm needs to synchronously invoke `onOk` so tests can assert
	// IPC calls without spinning the event loop through an actual antd modal
	// mount. `App.useApp()` returns this stub; production code goes through
	// the real antd modal at runtime.
	const modalMock = {
		confirm: (opts: { onOk?: () => unknown | Promise<unknown> }) => {
			void opts.onOk?.();
			return { destroy: () => {}, update: () => {} };
		},
	};
	function App({ children }: { children?: React.ReactNode }) {
		return <>{children}</>;
	}
	App.useApp = () => ({
		modal: modalMock,
		message: messageMocks,
		notification: {
			open: vi.fn(),
			success: vi.fn(),
			error: vi.fn(),
			info: vi.fn(),
			warning: vi.fn(),
		},
	});

	return {
		Alert,
		App,
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
		exportProjectArchive: sessionArchiveMocks.exportProjectArchive,
	},
}));

vi.mock("../../../services/diagnosticExportService", () => ({
	diagnosticExportService: {
		export: diagnosticExportMocks.export,
	},
}));

vi.mock("../../../services/fileActionService", () => ({
	fileActionService: {
		copyPath: fileActionMocks.copyPath,
	},
}));

vi.mock("../ArchivedProjectsPanel", () => ({
	ArchivedProjectsPanel: () => <div>Archived projects test double</div>,
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

function getButtonsByExactText(text: string): HTMLButtonElement[] {
	return Array.from(container?.querySelectorAll("button") ?? []).filter(
		(button) => button.textContent?.trim() === text,
	);
}

beforeEach(() => {
	sessionArchiveMocks.exportArchive.mockReset();
	sessionArchiveMocks.exportProjectArchive.mockReset();
	diagnosticExportMocks.export.mockReset();
	fileActionMocks.copyPath.mockReset();
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
	sessionArchiveMocks.exportProjectArchive.mockResolvedValue({
		success: true,
		data: {
			exportDir:
				"/Users/mark/Library/Application Support/Super Client/exports/project-1",
			manifestPath:
				"/Users/mark/Library/Application Support/Super Client/exports/project-1/manifest.json",
			manifest: {},
		},
	});
	diagnosticExportMocks.export.mockResolvedValue({
		success: true,
		data: {
			exportDir:
				"/Users/mark/Library/Application Support/Super Client/exports/diagnostics/diag-1",
			manifestPath:
				"/Users/mark/Library/Application Support/Super Client/exports/diagnostics/diag-1/manifest.json",
			diagnosticPath:
				"/Users/mark/Library/Application Support/Super Client/exports/diagnostics/diag-1/diagnostic.json",
		},
	});
	fileActionMocks.copyPath.mockResolvedValue({ success: true, data: { ok: true } });
	Object.defineProperty(window, "electron", {
		value: {
			projects: {
				listOrphans: vi.fn().mockResolvedValue({ success: true, data: [] }),
				restoreOrphan: vi.fn(),
				deleteOrphan: vi.fn().mockResolvedValue({
					success: true,
					data: { removed: true },
				}),
				relinkOrphan: vi.fn().mockResolvedValue({
					success: true,
					data: { id: "new", cwd: "/new", name: "new" },
				}),
			},
			sessions: {
				purgeTombstone: vi.fn().mockResolvedValue({
					success: true,
					data: { purged: true, removedPaths: [] },
				}),
			},
			legacyData: {
				detect: vi.fn().mockResolvedValue({
					success: true,
					data: { count: 0, alreadyImported: false, legacyDir: "" },
				}),
				importAll: vi.fn(),
				purge: vi.fn().mockResolvedValue({
					success: true,
					data: { purged: true, previousCount: 0, legacyDir: "" },
				}),
			},
			recovery: {
				exportBundle: vi.fn().mockResolvedValue({
					success: true,
					data: {
						bundleDir: "/redacted/bundle",
						manifestPath: "/redacted/bundle/bundle-manifest.json",
						manifest: {
							schemaVersion: 1,
							createdAt: "2026-07-20T00:00:00Z",
							includeChatContent: false,
							entries: [],
						},
					},
				}),
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
	it("renders a recovery wizard with counts and a recommended action", async () => {
		(
			window.electron.projects.listOrphans as unknown as ReturnType<typeof vi.fn>
		).mockResolvedValueOnce({
			success: true,
			data: [
				{
					projectId: "orphan-1",
					cwd: "/Users/mark/private/orphan-project",
					sessionCount: 3,
				},
			],
		});
		(
			window.electron.legacyData.detect as unknown as ReturnType<typeof vi.fn>
		).mockResolvedValueOnce({
			success: true,
			data: {
				count: 2,
				alreadyImported: false,
				legacyDir: "/Users/mark/private/legacy",
			},
		});
		await renderRecoverySettings();

		const wizard = container?.querySelector(
			"[data-testid='recovery-wizard-panel']",
		);
		expect(wizard).toBeTruthy();
		expect(container?.textContent).toContain("Recovery checklist");
		// The wizard now shows ONE step at a time (recommended = orphans here,
		// count 1) plus a Recommended tag and Prev/Next navigation.
		expect(container?.textContent).toContain("Restore orphan projects (1)");
		expect(container?.textContent).toContain("Recommended");
		// The legacy step's count is visible only after navigating to it.
		expect(container?.textContent).not.toContain("Import legacy chats (2)");
		await act(async () => {
			getButtonsByText("Next")[0]?.click();
			await Promise.resolve();
		});
		// After Next we land on the legacy step, whose count (2) now shows.
		expect(container?.textContent).toContain("Import legacy chats (2)");
		expect(container?.textContent).not.toContain("/Users/mark/private");
	});

	it("wizard legacy action calls the existing legacy import flow", async () => {
		(
			window.electron.legacyData.detect as unknown as ReturnType<typeof vi.fn>
		).mockResolvedValueOnce({
			success: true,
			data: {
				count: 2,
				alreadyImported: false,
				legacyDir: "/Users/mark/private/legacy",
			},
		});
		(
			window.electron.legacyData.importAll as unknown as ReturnType<typeof vi.fn>
		).mockResolvedValueOnce({
			success: true,
			data: { imported: 2, skipped: 0, failures: [] },
		});
		await renderRecoverySettings();

		await act(async () => {
			getButtonsByText("Import legacy chats")[0]?.click();
			await Promise.resolve();
		});

		expect(window.electron.legacyData.importAll).toHaveBeenCalledTimes(1);
		expect(messageMocks.success).toHaveBeenCalledWith(
			"Imported 2 legacy chats",
		);
	});

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
			getButtonsByExactText("Export")[0]?.click();
			await Promise.resolve();
		});

		expect(sessionArchiveMocks.exportArchive).toHaveBeenCalledTimes(1);
		expect(sessionArchiveMocks.exportArchive).toHaveBeenCalledWith(
			"visible-session",
		);
		expect(container?.textContent).toContain("Session archive ready");
		expect(container?.textContent).toContain(
			"<app-data>/exports/session-1",
		);
		expect(container?.textContent).not.toContain(
			"/Users/mark/Library/Application Support/Super Client/exports/session-1",
		);
	});

	it("exports a project archive through sessionArchiveService", async () => {
		useProjectStore.setState({
			projects: [
				{
					id: "project-1",
					name: "Project One",
					cwd: "/Users/mark/private/project-one",
					pinned: false,
					archived: false,
					createdAt: 1,
					updatedAt: 2,
					lastSeenAt: 2,
				},
			],
			currentProjectId: "project-1",
			loaded: true,
			settingsByProject: {},
		});
		await renderRecoverySettings();

		await act(async () => {
			getButtonsByText("Export project")[0]?.click();
			await Promise.resolve();
		});

		expect(sessionArchiveMocks.exportProjectArchive).toHaveBeenCalledWith(
			"project-1",
		);
		expect(container?.textContent).toContain("Project archive ready");
		expect(container?.textContent).toContain("<app-data>/exports/project-1");
		expect(container?.textContent).not.toContain(
			"/Users/mark/Library/Application Support/Super Client/exports/project-1",
		);
		expect(container?.textContent).toContain("~/.../private/project-one");
		expect(container?.textContent).not.toContain("/Users/mark/private/project-one");
	});

	it("exports diagnostics through diagnosticExportService", async () => {
		await renderRecoverySettings();

		await act(async () => {
			getButtonsByText("Export diagnostics")[0]?.click();
			await Promise.resolve();
		});

		expect(diagnosticExportMocks.export).toHaveBeenCalledTimes(1);
		expect(container?.textContent).toContain("Diagnostic export ready");
		expect(container?.textContent).toContain(
			"<app-data>/exports/diagnostics/diag-1",
		);
		expect(container?.textContent).not.toContain(
			"/Users/mark/Library/Application Support/Super Client/exports/diagnostics/diag-1",
		);
	});

	it("redacts orphan and legacy paths while copy actions use raw paths", async () => {
		const orphanCwd = "/Users/mark/private/orphan-project";
		const legacyDir = "/Users/mark/Library/Application Support/Super Client/old";
		(
			window.electron.projects.listOrphans as unknown as ReturnType<typeof vi.fn>
		).mockResolvedValueOnce({
			success: true,
			data: [{ projectId: "orphan-1", cwd: orphanCwd, sessionCount: 3 }],
		});
		(
			window.electron.legacyData.detect as unknown as ReturnType<typeof vi.fn>
		).mockResolvedValueOnce({
			success: true,
			data: { count: 2, alreadyImported: false, legacyDir },
		});

		await renderRecoverySettings();

		expect(container?.textContent).toContain("~/.../private/orphan-project");
		expect(container?.textContent).toContain("<app-data>/.../old");
		expect(container?.textContent).not.toContain(orphanCwd);
		expect(container?.textContent).not.toContain(legacyDir);

		await act(async () => {
			getButtonsByText("Copy full path")[0]?.click();
			await Promise.resolve();
		});

		expect(fileActionMocks.copyPath).toHaveBeenCalledWith(orphanCwd);

		await act(async () => {
			getButtonsByText("Copy full path")[1]?.click();
			await Promise.resolve();
		});

		expect(fileActionMocks.copyPath).toHaveBeenCalledWith(legacyDir);
	});

	it("does not surface raw orphan restore errors", async () => {
		const orphanCwd = "/Users/mark/private/orphan-project";
		(
			window.electron.projects.listOrphans as unknown as ReturnType<typeof vi.fn>
		).mockResolvedValueOnce({
			success: true,
			data: [{ projectId: "orphan-1", cwd: orphanCwd, sessionCount: 3 }],
		});
		(
			window.electron.projects.restoreOrphan as unknown as ReturnType<typeof vi.fn>
		).mockResolvedValueOnce({
			success: false,
			error: "hash mismatch for /Users/mark/private/orphan-project",
		});

		await renderRecoverySettings();

		await act(async () => {
			getButtonsByText("Restore")[0]?.click();
			await Promise.resolve();
		});

		expect(messageMocks.error).toHaveBeenCalledWith("Restore failed");
		expect(messageMocks.error).not.toHaveBeenCalledWith(
			expect.stringContaining("/Users/mark/private/orphan-project"),
		);
		expect(container?.textContent).not.toContain("hash mismatch");
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
			getButtonsByExactText("Export")[0]?.click();
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
		expect(sessionArchiveMocks.exportArchive).not.toHaveBeenCalled();
	});
});
