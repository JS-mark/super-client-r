import type * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProviderModel } from "../../../types/models";
import {
	coerceNumericField,
	ModelCapabilityEditor,
} from "../ModelCapabilityEditor";

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, opts?: Record<string, unknown>) => {
			if (opts && typeof opts === "object" && "value" in opts) {
				return `${key}:${(opts as { value: string }).value}`;
			}
			return key;
		},
	}),
}));

vi.mock("antd", () => {
	function Text({
		children,
		style,
	}: {
		children?: React.ReactNode;
		style?: React.CSSProperties;
		type?: string;
	}) {
		return <span style={style}>{children}</span>;
	}

	function Checkbox({
		checked,
		onChange,
		disabled,
		children,
	}: {
		checked?: boolean;
		disabled?: boolean;
		onChange?: (e: { target: { checked: boolean } }) => void;
		children?: React.ReactNode;
	}) {
		const label = typeof children === "string" ? children : String(children);
		return (
			<label>
				<input
					type="checkbox"
					aria-label={`cap:${label}`}
					checked={!!checked}
					disabled={disabled}
					onChange={(e) => onChange?.({ target: { checked: e.target.checked } })}
				/>
				<span>{children}</span>
			</label>
		);
	}

	function InputNumber({
		value,
		onChange,
		disabled,
		"aria-label": ariaLabel,
	}: {
		value?: number;
		disabled?: boolean;
		onChange?: (v: number | null) => void;
		"aria-label"?: string;
	}) {
		return (
			<input
				type="number"
				aria-label={ariaLabel}
				disabled={disabled}
				value={value ?? ""}
				onChange={(e) => {
					const raw = e.target.value;
					if (raw === "") {
						onChange?.(null);
					} else {
						onChange?.(Number(raw));
					}
				}}
			/>
		);
	}

	function Switch({
		checked,
		onChange,
		disabled,
		"aria-label": ariaLabel,
	}: {
		checked?: boolean;
		disabled?: boolean;
		onChange?: (v: boolean) => void;
		"aria-label"?: string;
	}) {
		return (
			<button
				type="button"
				role="switch"
				aria-label={ariaLabel}
				aria-checked={!!checked}
				disabled={disabled}
				onClick={() => onChange?.(!checked)}
			>
				{checked ? "on" : "off"}
			</button>
		);
	}

	function Select({
		value,
		onChange,
		options,
		disabled,
		"aria-label": ariaLabel,
	}: {
		value?: string;
		disabled?: boolean;
		onChange?: (v: string) => void;
		options?: Array<{ value: string; label: string }>;
		"aria-label"?: string;
	}) {
		return (
			<select
				aria-label={ariaLabel}
				value={value ?? ""}
				disabled={disabled}
				onChange={(e) => onChange?.(e.target.value)}
			>
				{(options ?? []).map((o) => (
					<option key={o.value} value={o.value}>
						{o.label}
					</option>
				))}
			</select>
		);
	}

	return {
		Checkbox,
		InputNumber,
		Select,
		Switch,
		Typography: { Text },
		theme: {
			useToken: () => ({
				token: {
					colorBgContainer: "#fff",
					colorBorder: "#ddd",
					colorText: "#111",
					borderRadius: 6,
				},
			}),
		},
	};
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

function makeModel(overrides: Partial<ProviderModel> = {}): ProviderModel {
	return {
		id: "gpt-4o",
		name: "GPT-4o",
		enabled: true,
		capabilities: ["vision"],
		category: "chat",
		supportsStreaming: true,
		contextWindow: 128000,
		maxTokens: 4096,
		...overrides,
	};
}

describe("ModelCapabilityEditor", () => {
	it("adds a capability to the merged array on check", () => {
		const model = makeModel({ capabilities: ["vision"] });
		const onChange = vi.fn();
		render(<ModelCapabilityEditor value={model} onChange={onChange} />);

		const toolCheckbox = container?.querySelector(
			'input[aria-label="cap:capabilities.tool_use"]',
		) as HTMLInputElement | null;
		expect(toolCheckbox).toBeTruthy();
		act(() => {
			toolCheckbox?.click();
		});

		expect(onChange).toHaveBeenCalledWith({
			capabilities: expect.arrayContaining(["vision", "tool_use"]),
		});
		const arg = onChange.mock.calls[0]?.[0] as { capabilities: string[] };
		expect(arg.capabilities).toHaveLength(2);
	});

	it("removes a capability on uncheck", () => {
		const model = makeModel({ capabilities: ["vision", "tool_use"] });
		const onChange = vi.fn();
		render(<ModelCapabilityEditor value={model} onChange={onChange} />);

		const visionCheckbox = container?.querySelector(
			'input[aria-label="cap:capabilities.vision"]',
		) as HTMLInputElement | null;
		expect(visionCheckbox?.checked).toBe(true);
		act(() => {
			visionCheckbox?.click();
		});

		expect(onChange).toHaveBeenCalledWith({ capabilities: ["tool_use"] });
	});

	it("renders the contextWindow input with the current value", () => {
		const model = makeModel({ contextWindow: 128000 });
		render(
			<ModelCapabilityEditor value={model} onChange={() => {}} />,
		);
		const contextInput = container?.querySelector(
			'input[aria-label="modelConfig.contextWindow"]',
		) as HTMLInputElement | null;
		expect(contextInput).toBeTruthy();
		expect(contextInput?.value).toBe("128000");
	});

	it("coerces empty / zero / negative numeric inputs into undefined", () => {
		expect(coerceNumericField(null)).toBeUndefined();
		expect(coerceNumericField(undefined)).toBeUndefined();
		expect(coerceNumericField("")).toBeUndefined();
		expect(coerceNumericField(0)).toBeUndefined();
		expect(coerceNumericField(-5)).toBeUndefined();
		expect(coerceNumericField("-42")).toBeUndefined();
		expect(coerceNumericField(Number.NaN)).toBeUndefined();
	});

	it("keeps positive numeric inputs untouched", () => {
		expect(coerceNumericField(4096)).toBe(4096);
		expect(coerceNumericField("128000")).toBe(128000);
	});

	it("toggles supportsStreaming to false when currently true", () => {
		const model = makeModel({ supportsStreaming: true });
		const onChange = vi.fn();
		render(<ModelCapabilityEditor value={model} onChange={onChange} />);

		const streamingSwitch = container?.querySelector(
			'button[aria-label="modelConfig.streaming"]',
		) as HTMLButtonElement | null;
		expect(streamingSwitch?.getAttribute("aria-checked")).toBe("true");
		act(() => {
			streamingSwitch?.click();
		});

		expect(onChange).toHaveBeenCalledWith({ supportsStreaming: false });
	});
});
