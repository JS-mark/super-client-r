import type * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToolCallCard } from "../ToolCallCard";

vi.mock("@ant-design/icons", () => ({
	CheckCircleOutlined: () => <span aria-hidden="true" />,
	CheckOutlined: () => <span aria-hidden="true" />,
	ClockCircleOutlined: () => <span aria-hidden="true" />,
	CloseCircleOutlined: () => <span aria-hidden="true" />,
	CloseOutlined: () => <span aria-hidden="true" />,
	DownOutlined: () => <span aria-hidden="true" />,
	ExclamationCircleOutlined: () => <span aria-hidden="true" />,
	KeyOutlined: () => <span aria-hidden="true" />,
	LoadingOutlined: () => <span aria-hidden="true" />,
	RightOutlined: () => <span aria-hidden="true" />,
	ToolOutlined: () => <span aria-hidden="true" />,
}));

vi.mock("antd", () => {
	function PassThrough({ children }: { children?: React.ReactNode }) {
		return <>{children}</>;
	}

	return {
		App: {
			useApp: () => ({
				message: {
					error: vi.fn(),
					success: vi.fn(),
				},
			}),
		},
		Tooltip: PassThrough,
		theme: {
			useToken: () => ({
				token: {
					colorBgContainer: "#fff",
					colorBorderSecondary: "#eee",
					colorError: "#f00",
					colorErrorBg: "#fee",
					colorFillQuaternary: "#f7f7f7",
					colorFillTertiary: "#eee",
					colorSuccess: "#0a0",
					colorText: "#111",
					colorTextQuaternary: "#999",
					colorTextSecondary: "#555",
					colorTextTertiary: "#777",
					colorWarning: "#fa0",
				},
			}),
		},
	};
});

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, fallback?: string) => fallback ?? key,
	}),
}));

vi.mock("react18-json-view", () => ({
	default: () => <div data-testid="json-view">json-view-mounted</div>,
}));

vi.mock("../../../services/runtimeService", () => ({
	runtimeService: {
		addGrant: vi.fn(),
	},
}));

vi.mock("../../../stores/chatStore", () => ({
	useChatStore: (
		selector: (state: { currentConversationId: string }) => unknown,
	) => selector({ currentConversationId: "conversation-1" }),
}));

vi.mock("../../../stores/themeStore", () => ({
	useThemeStore: (selector: (state: { actualTheme: "light" }) => unknown) =>
		selector({ actualTheme: "light" }),
}));

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

describe("ToolCallCard", () => {
	it("keeps collapsed large tool results to a bounded preview", () => {
		const tail = "TAIL-SHOULD-NOT-MOUNT";
		const largeResult = `${"stdout ".repeat(1000)}${tail}`;

		render(
			<ToolCallCard
				toolCall={{
					id: "tool-1",
					name: "scp-bash__exec",
					input: { command: "printf lots" },
					status: "success",
					result: largeResult,
					duration: 10,
				}}
			/>,
		);

		expect(container?.textContent).toContain("toolCall.result");
		expect(container?.textContent).toContain("stdout");
		expect(container?.textContent).toContain("...");
		expect(container?.textContent).not.toContain(tail);
		expect(container?.textContent).not.toContain("json-view-mounted");
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
