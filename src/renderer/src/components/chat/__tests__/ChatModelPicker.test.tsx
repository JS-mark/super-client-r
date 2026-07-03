import type * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CapabilityChips, formatContextChipValue } from "../ChatModelPicker";

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, opts?: Record<string, unknown> | string) => {
			if (
				opts &&
				typeof opts === "object" &&
				"value" in opts &&
				typeof (opts as { value: unknown }).value === "string"
			) {
				return `Ctx: ${(opts as { value: string }).value}`;
			}
			// Chip labels: map i18n keys to a readable, testable label.
			switch (key) {
				case "modelPicker.chipVision":
					return "Vision";
				case "modelPicker.chipReasoning":
					return "Reasoning";
				case "modelPicker.chipToolUse":
					return "Tool";
				case "modelPicker.chipWebSearch":
					return "Web";
				default:
					return key;
			}
		},
	}),
}));

vi.mock("@ant-design/icons", () => ({
	BulbOutlined: () => <span aria-hidden="true">reasoning-icon</span>,
	CheckOutlined: () => <span aria-hidden="true" />,
	EyeOutlined: () => <span aria-hidden="true">vision-icon</span>,
	GlobalOutlined: () => <span aria-hidden="true">web-icon</span>,
	SearchOutlined: () => <span aria-hidden="true" />,
	ToolOutlined: () => <span aria-hidden="true">tool-icon</span>,
}));

vi.mock("antd", () => {
	function Tag({
		children,
		icon,
	}: {
		children?: React.ReactNode;
		icon?: React.ReactNode;
		bordered?: boolean;
		style?: React.CSSProperties;
	}) {
		return (
			<span data-testid="chip">
				{icon}
				<span>{children}</span>
			</span>
		);
	}

	function PassThrough({ children }: { children?: React.ReactNode }) {
		return <>{children}</>;
	}

	return {
		Badge: PassThrough,
		Button: PassThrough,
		Collapse: PassThrough,
		Empty: PassThrough,
		Input: PassThrough,
		Modal: PassThrough,
		Tabs: PassThrough,
		Tag,
		Typography: { Text: PassThrough },
		theme: {
			useToken: () => ({
				token: {
					colorPrimary: "#1677ff",
					colorPrimaryBg: "#e6f4ff",
					colorText: "#111",
					colorTextSecondary: "#555",
					colorFillTertiary: "#f5f5f5",
					borderRadius: 6,
				},
			}),
		},
	};
});

vi.mock("../../../stores/modelStore", () => ({
	useModelStore: () => [],
}));

vi.mock("../../models/ProviderIcon", () => ({
	ProviderIcon: () => <span aria-hidden="true" />,
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

function render(element: React.ReactElement): void {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	act(() => {
		root?.render(element);
	});
}

describe("formatContextChipValue", () => {
	it("formats 128000 as 128K", () => {
		expect(formatContextChipValue(128000)).toBe("128K");
	});
	it("formats 4500 as 4.5K", () => {
		expect(formatContextChipValue(4500)).toBe("4.5K");
	});
	it("formats 1000000 as 1M", () => {
		expect(formatContextChipValue(1_000_000)).toBe("1M");
	});
	it("returns null for undefined / zero / negatives", () => {
		expect(formatContextChipValue(undefined)).toBeNull();
		expect(formatContextChipValue(0)).toBeNull();
		expect(formatContextChipValue(-100)).toBeNull();
	});
	it("keeps small counts as raw digits", () => {
		expect(formatContextChipValue(512)).toBe("512");
	});
});

describe("CapabilityChips", () => {
	it("renders Vision and Tool chips when the model supports both", () => {
		render(<CapabilityChips capabilities={["vision", "tool_use"]} />);
		const text = container?.textContent ?? "";
		expect(text).toContain("Vision");
		expect(text).toContain("Tool");
		expect(text).not.toContain("Reasoning");
		expect(text).not.toContain("Web");
	});

	it("renders a Ctx: 128K chip when contextWindow is 128000", () => {
		render(<CapabilityChips capabilities={[]} contextWindow={128000} />);
		expect(container?.textContent ?? "").toContain("Ctx: 128K");
	});

	it("skips embedding / reranking (not in the picker chip whitelist)", () => {
		render(
			<CapabilityChips capabilities={["embedding", "reranking"]} />,
		);
		expect(container).toBeTruthy();
		// Should render nothing (no chips + no ctx).
		expect(container?.textContent ?? "").toBe("");
	});

	it("renders nothing when neither capabilities nor contextWindow is set", () => {
		render(<CapabilityChips capabilities={[]} />);
		expect(container?.textContent ?? "").toBe("");
	});
});
