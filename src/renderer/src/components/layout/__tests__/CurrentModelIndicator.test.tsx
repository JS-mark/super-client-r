import type * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ModelProvider } from "../../../types/models";
import { CurrentModelIndicator } from "../CurrentModelIndicator";

// ─── Mock store state (mutated per-test) ─────────────────────────────────────
let mockProviders: ModelProvider[] = [];
let mockActiveSelection: { providerId: string; modelId: string } | null = null;

vi.mock("../../../stores/modelStore", () => ({
	useModelStore: (selector: (s: unknown) => unknown) =>
		selector({
			providers: mockProviders,
			activeSelection: mockActiveSelection,
		}),
}));

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, opts?: Record<string, unknown>) => {
			if (opts && typeof opts === "object" && "model" in opts) {
				return `current:${(opts as { model: string }).model}`;
			}
			return key;
		},
	}),
}));

vi.mock("antd", () => ({
	Tooltip: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
	theme: { useToken: () => ({ token: {} }) },
}));

function makeProvider(overrides: Partial<ModelProvider> = {}): ModelProvider {
	return {
		id: "p1",
		name: "DeepSeek",
		preset: "deepseek",
		baseUrl: "https://api.deepseek.com/v1",
		apiKey: "",
		enabled: true,
		tested: true,
		models: [
			{
				id: "deepseek-chat",
				name: "DeepSeek Chat",
				enabled: true,
				capabilities: [],
				category: "chat",
				supportsStreaming: true,
			},
		],
		createdAt: 0,
		updatedAt: 0,
		...overrides,
	};
}

describe("CurrentModelIndicator", () => {
	let container: HTMLDivElement;
	let root: Root;

	function render() {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		act(() => {
			root.render(<CurrentModelIndicator />);
		});
	}

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		mockProviders = [];
		mockActiveSelection = null;
	});

	it("renders nothing when no active selection", () => {
		mockProviders = [makeProvider()];
		mockActiveSelection = null;
		render();
		expect(container.textContent).toBe("");
	});

	it("renders nothing when selected provider was deleted", () => {
		mockProviders = [];
		mockActiveSelection = { providerId: "p1", modelId: "deepseek-chat" };
		render();
		expect(container.textContent).toBe("");
	});

	it("renders nothing when selected model no longer exists on the provider", () => {
		mockProviders = [makeProvider()];
		mockActiveSelection = { providerId: "p1", modelId: "gone" };
		render();
		expect(container.textContent).toBe("");
	});

	it("shows the model display name when selection resolves", () => {
		mockProviders = [makeProvider()];
		mockActiveSelection = { providerId: "p1", modelId: "deepseek-chat" };
		render();
		expect(container.textContent).toContain("DeepSeek Chat");
	});

	it("falls back to model id when name is empty", () => {
		mockProviders = [
			makeProvider({
				models: [
					{
						id: "raw-id",
						name: "",
						enabled: true,
						capabilities: [],
						category: "chat",
						supportsStreaming: true,
					},
				],
			}),
		];
		mockActiveSelection = { providerId: "p1", modelId: "raw-id" };
		render();
		expect(container.textContent).toContain("raw-id");
	});
});
