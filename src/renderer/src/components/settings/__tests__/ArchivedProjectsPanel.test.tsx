import type * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useProjectStore } from "../../../stores/projectStore";
import { ArchivedProjectsPanel } from "../ArchivedProjectsPanel";

const fileActionMocks = vi.hoisted(() => ({
	copyPath: vi.fn(),
}));

const messageMocks = vi.hoisted(() => ({
	error: vi.fn(),
	success: vi.fn(),
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
		type?: string;
	};

	function Button({ icon, children, onClick }: MockButtonProps) {
		return (
			<button onClick={onClick}>
				{icon}
				{children}
			</button>
		);
	}

	function Empty({ description }: { description?: React.ReactNode }) {
		return <div>{description}</div>;
	}
	Empty.PRESENTED_IMAGE_SIMPLE = "simple";

	function Tag({ children }: { children?: React.ReactNode }) {
		return <span>{children}</span>;
	}

	const Typography = {
		Text({ children }: { children?: React.ReactNode }) {
			return <span>{children}</span>;
		},
	};

	return {
		Button,
		Empty,
		Tag,
		Typography,
		message: messageMocks,
	};
});

vi.mock("../../../services/fileActionService", () => ({
	fileActionService: {
		copyPath: fileActionMocks.copyPath,
	},
}));

vi.mock("@/components/ui/LiteList", () => ({
	LiteList: Object.assign(
		({
			dataSource,
			renderItem,
		}: {
			dataSource: unknown[];
			renderItem: (item: unknown) => React.ReactNode;
		}) => <div>{dataSource.map((item) => renderItem(item))}</div>,
		{
			Item: Object.assign(
				({
					children,
					actions,
				}: {
					children?: React.ReactNode;
					actions?: React.ReactNode[];
				}) => (
					<div>
						<div>{children}</div>
						<div>{actions}</div>
					</div>
				),
				{
					Meta({
						title,
						description,
					}: {
						title?: React.ReactNode;
						description?: React.ReactNode;
					}) {
						return (
							<div>
								<div>{title}</div>
								<div>{description}</div>
							</div>
						);
					},
				},
			),
		},
	),
}));

let root: Root | undefined;
let container: HTMLDivElement | undefined;

(
	globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

async function renderPanel(): Promise<HTMLDivElement> {
	container = document.createElement("div");
	document.body.appendChild(container);
	await act(async () => {
		root = createRoot(container as HTMLDivElement);
		root.render(<ArchivedProjectsPanel />);
		await Promise.resolve();
	});
	return container;
}

function getButton(text: string): HTMLButtonElement {
	const button = Array.from(container?.querySelectorAll("button") ?? []).find(
		(item) => item.textContent?.includes(text),
	);
	if (!button) throw new Error(`button not found: ${text}`);
	return button;
}

beforeEach(() => {
	fileActionMocks.copyPath.mockReset();
	messageMocks.error.mockReset();
	messageMocks.success.mockReset();
	fileActionMocks.copyPath.mockResolvedValue({ success: true, data: { ok: true } });
	useProjectStore.setState({
		projects: [
			{
				id: "project-1",
				name: "Archived Project",
				cwd: "/Users/mark/private/archived-project",
				pinned: false,
				archived: true,
				createdAt: 1,
				updatedAt: 2,
				lastSeenAt: 2,
			},
		],
		currentProjectId: null,
		loaded: true,
		settingsByProject: {},
		archive: vi.fn().mockResolvedValue(undefined),
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

describe("ArchivedProjectsPanel", () => {
	it("redacts cwd by default and copies the full path only on explicit action", async () => {
		await renderPanel();

		expect(container?.textContent).toContain("~/.../private/archived-project");
		expect(container?.textContent).not.toContain(
			"/Users/mark/private/archived-project",
		);

		await act(async () => {
			getButton("Copy full path").click();
			await Promise.resolve();
		});

		expect(fileActionMocks.copyPath).toHaveBeenCalledWith(
			"/Users/mark/private/archived-project",
		);
	});

	it("restores archived projects through the project store", async () => {
		await renderPanel();

		await act(async () => {
			getButton("Restore").click();
			await Promise.resolve();
		});

		expect(useProjectStore.getState().archive).toHaveBeenCalledWith(
			"project-1",
			false,
		);
	});
});
