import type * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ContextUsage } from "../../../../hooks/contextUsageMath";
import type { ContextInspectorData } from "../../../../hooks/useContextInspectorData";

// ---------- i18n mock ----------
vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (
			_key: string,
			fallback?: string,
			options?: Record<string, string | number>,
		) => {
			let text = fallback ?? _key;
			if (options) {
				for (const [key, value] of Object.entries(options)) {
					text = text.replaceAll(`{{${key}}}`, String(value));
				}
			}
			return text;
		},
	}),
}));

// ---------- antd mock (light-weight) ----------
vi.mock("antd", () => {
	function PassThrough({ children }: { children?: React.ReactNode }) {
		return <>{children}</>;
	}
	function Tooltip({ children }: { children?: React.ReactNode }) {
		return <>{children}</>;
	}
	function Progress({
		percent,
	}: {
		percent?: number;
	}) {
		return (
			<div
				data-testid="context-budget-bar"
				data-percent={percent}
				role="progressbar"
			/>
		);
	}
	function Tag({ children }: { children?: React.ReactNode }) {
		return <span>{children}</span>;
	}
	return {
		Progress,
		Tag,
		Tooltip,
		theme: {
			useToken: () => ({
				token: {
					colorText: "#111",
					colorTextSecondary: "#555",
					colorTextTertiary: "#999",
					colorBgContainer: "#fff",
					colorBorderSecondary: "#eee",
					colorPrimary: "#1677ff",
					colorFillSecondary: "#f0f0f0",
					colorSuccess: "#0a0",
					colorError: "#c00",
				},
			}),
			default: {},
		},
		default: {
			Progress,
			Tag,
			Tooltip,
			theme: {
				useToken: () => ({ token: {} }),
			},
		},
		Empty: PassThrough,
	};
});

vi.mock("@ant-design/icons", () => ({
	FileTextOutlined: () => <span aria-hidden="true" data-icon="file-text" />,
	FolderOpenOutlined: () => <span aria-hidden="true" data-icon="folder-open" />,
	PaperClipOutlined: () => <span aria-hidden="true" data-icon="paperclip" />,
	CompressOutlined: () => <span aria-hidden="true" data-icon="compress" />,
	SearchOutlined: () => <span aria-hidden="true" data-icon="search" />,
	HistoryOutlined: () => <span aria-hidden="true" data-icon="history" />,
	ToolOutlined: () => <span aria-hidden="true" data-icon="tool" />,
	PushpinFilled: () => <span aria-hidden="true" data-icon="pushpin-filled" />,
	PushpinOutlined: () => <span aria-hidden="true" data-icon="pushpin" />,
}));

// ---------- hook mocks ----------
const usageMock: { current: ContextUsage } = {
	current: {
		usedTokens: 0,
		contextWindow: null,
		percent: null,
		breakdown: [],
		cacheHitRate: null,
		isEstimated: true,
	},
};

const dataMock: { current: ContextInspectorData } = {
	current: {
		sources: [
			{ id: "system-prompt", kind: "systemPrompt", label: "System prompt" },
		],
		compactEvents: [],
		hasProject: false,
	},
};

vi.mock("../../../../hooks/useContextUsage", () => ({
	useContextUsage: () => usageMock.current,
}));

vi.mock("../../../../hooks/useContextInspectorData", () => ({
	useContextInspectorData: () => dataMock.current,
	toggleContextSourcePinned: (
		sources: ContextInspectorData["sources"],
		sourceId: string,
		pinned: boolean,
	) =>
		sources.map((source) =>
			source.id === sourceId ? { ...source, pinned } : source,
		),
}));

const chatMessageStoreMock = vi.hoisted(() => ({
	current: {
		messages: [] as Array<{
			id: string;
			role: string;
			content: string;
			timestamp: number;
			metadata?: {
				contextSources?: ContextInspectorData["sources"];
			};
		}>,
		updateMessageMetadata: vi.fn(),
	},
}));

vi.mock("../../../../stores/chatMessageStore", () => {
	const useChatMessageStore = Object.assign(
		(selector: (state: typeof chatMessageStoreMock.current) => unknown) =>
			selector(chatMessageStoreMock.current),
		{
			getState: () => chatMessageStoreMock.current,
		},
	);
	return { useChatMessageStore };
});

import { ContextInspectorSection } from "../ContextInspectorSection";

let root: Root | undefined;
let container: HTMLDivElement | undefined;

(
	globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
	usageMock.current = {
		usedTokens: 0,
		contextWindow: null,
		percent: null,
		breakdown: [],
		cacheHitRate: null,
		isEstimated: true,
	};
	dataMock.current = {
		sources: [
			{ id: "system-prompt", kind: "systemPrompt", label: "System prompt" },
		],
		compactEvents: [],
		hasProject: false,
	};
	chatMessageStoreMock.current.messages = [];
	chatMessageStoreMock.current.updateMessageMetadata.mockReset();
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

describe("ContextInspectorSection", () => {
	it("renders empty state hint when only the system-prompt chip is present", () => {
		render(<ContextInspectorSection />);
		const empty = container?.querySelector(
			"[data-testid='context-empty-hint']",
		);
		expect(empty).toBeTruthy();
		expect(container?.textContent ?? "").toContain("System prompt");
	});

	it("renders attachment chip rows with byte suffix", () => {
		dataMock.current = {
			sources: [
				{ id: "system-prompt", kind: "systemPrompt", label: "System prompt" },
				{
					id: "attachment:a1",
					kind: "attachment",
					label: "hello.md",
					detail: "document",
					bytes: 2048,
				},
			],
			compactEvents: [],
			hasProject: false,
		};
		render(<ContextInspectorSection />);
		const rows = container?.querySelectorAll(
			"[data-testid='context-source-row']",
		);
		expect(rows?.length).toBe(2);
		expect(container?.textContent ?? "").toContain("hello.md");
		expect(container?.textContent ?? "").toContain("2KB");
		// Empty hint should be gone as soon as at least one non-system source exists.
		expect(
			container?.querySelector("[data-testid='context-empty-hint']"),
		).toBeFalsy();
	});

	it("shows the project-rules chip when the session has a project cwd", () => {
		dataMock.current = {
			sources: [
				{ id: "system-prompt", kind: "systemPrompt", label: "System prompt" },
				{
					id: "project-rules",
					kind: "projectRules",
					label: "Project rules: AGENTS.md",
					detail: "AGENTS.md / CLAUDE.md",
				},
			],
			compactEvents: [],
			hasProject: true,
		};
		render(<ContextInspectorSection />);
		const rows = Array.from(
			container?.querySelectorAll(
				"[data-testid='context-source-row']",
			) ?? [],
		);
		const kinds = rows.map((r) => r.getAttribute("data-kind"));
		expect(kinds).toContain("projectRules");
		expect(container?.textContent ?? "").toContain(
			"Project rules: AGENTS.md",
		);
	});

	it("hides the token budget bar when the model context window is unknown", () => {
		usageMock.current = {
			usedTokens: 4321,
			contextWindow: null,
			percent: null,
			breakdown: [],
			cacheHitRate: null,
			isEstimated: true,
		};
		render(<ContextInspectorSection />);
		expect(
			container?.querySelector("[data-testid='context-budget-bar']"),
		).toBeFalsy();
		expect(
			container?.querySelector("[data-testid='context-budget-unknown']"),
		).toBeTruthy();
		// Usage text remains visible with just the used-tokens value.
		expect(container?.textContent ?? "").toContain("4,321");
	});

	it("renders the budget bar when the model context window is known", () => {
		usageMock.current = {
			usedTokens: 30_000,
			contextWindow: 100_000,
			percent: 0.3,
			breakdown: [],
			cacheHitRate: null,
			isEstimated: false,
		};
		render(<ContextInspectorSection />);
		const bar = container?.querySelector(
			"[data-testid='context-budget-bar']",
		);
		expect(bar).toBeTruthy();
		expect(bar?.getAttribute("data-percent")).toBe("30");
	});

	it("renders compact event entries when markers exist", () => {
		dataMock.current = {
			sources: [
				{ id: "system-prompt", kind: "systemPrompt", label: "System prompt" },
			],
			compactEvents: [{ id: "c1", timestamp: 0, summary: "trimmed" }],
			hasProject: false,
		};
		render(<ContextInspectorSection />);
		const events = container?.querySelectorAll(
			"[data-testid='context-compact-event']",
		);
		expect(events?.length).toBe(1);
		expect(container?.textContent ?? "").toContain("trimmed");
		// Compact events themselves don't trigger the empty state hint.
		expect(
			container?.querySelector("[data-testid='context-empty-hint']"),
		).toBeFalsy();
	});

	it("renders latest context strategy metadata", () => {
		dataMock.current = {
			sources: [
				{ id: "system-prompt", kind: "systemPrompt", label: "System prompt" },
				{
					id: "conversation-history",
					kind: "history",
					label: "2 history messages",
					detail: "1 omitted",
				},
			],
			strategy: {
				mode: "auto",
				strategy: "summarized",
				historyCount: 2,
				omittedCount: 1,
				estimatedTokens: 120,
				availableForMessages: 100,
				compacted: true,
			},
			compactEvents: [],
			hasProject: false,
		};
		render(<ContextInspectorSection />);
		const strategy = container?.querySelector(
			"[data-testid='context-strategy']",
		);
		expect(strategy).toBeTruthy();
		expect(container?.textContent ?? "").toContain("summarized");
		expect(container?.textContent ?? "").toContain("2 sent");
		expect(container?.textContent ?? "").toContain("1 omitted");
	});

	it("pins a source by updating the latest context message metadata", () => {
		const sources = [
			{ id: "system-prompt", kind: "systemPrompt", label: "System prompt" },
			{
				id: "project-rules",
				kind: "projectRules",
				label: "Project rules",
				pinned: false,
			},
		] satisfies ContextInspectorData["sources"];
		dataMock.current = {
			sources,
			latestContextMessageId: "a1",
			compactEvents: [],
			hasProject: true,
		};
		chatMessageStoreMock.current.messages = [
			{
				id: "a1",
				role: "assistant",
				content: "hello",
				timestamp: 1,
				metadata: { contextSources: sources },
			},
		];
		render(<ContextInspectorSection />);
		const buttons = container?.querySelectorAll(
			"[data-testid='context-source-pin-toggle']",
		);
		expect(buttons?.length).toBe(2);
		const projectButton = buttons?.[1] as HTMLButtonElement;
		expect(projectButton.getAttribute("data-pinned")).toBe("false");
		expect(projectButton.getAttribute("aria-label")).toBe("Pin source");
		act(() => {
			projectButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(chatMessageStoreMock.current.updateMessageMetadata).toHaveBeenCalledWith(
			"a1",
			{
				contextSources: [
					sources[0],
					{ ...sources[1], pinned: true },
				],
			},
		);
	});
});
