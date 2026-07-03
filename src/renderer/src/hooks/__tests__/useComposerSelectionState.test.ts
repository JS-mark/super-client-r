/**
 * Minimal renderHook harness (the codebase does not depend on
 * @testing-library/react). We spin up a react-dom root, run the hook
 * inside a functional component, and expose the latest return value via
 * an outer ref. Wrap state mutations in `act` so React flushes.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createElement, type FC } from "react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
	// Signal to React that this jsdom environment supports act(...)
	(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
		.IS_REACT_ACT_ENVIRONMENT = true;
});
import {
	useComposerSelectionState,
	type ComposerSelectionState,
} from "../useComposerSelectionState";

interface Harness<T> {
	current: T | null;
	unmount: () => void;
}

function renderHook<T>(hook: () => T): Harness<T> {
	const container = document.createElement("div");
	document.body.appendChild(container);
	const root: Root = createRoot(container);
	const holder: Harness<T> = {
		current: null,
		unmount: () => {
			act(() => {
				root.unmount();
			});
			container.remove();
		},
	};
	const Comp: FC = () => {
		holder.current = hook();
		return null;
	};
	act(() => {
		root.render(createElement(Comp));
	});
	return holder;
}

describe("useComposerSelectionState", () => {
	const harnesses: Array<Harness<ComposerSelectionState>> = [];
	afterEach(() => {
		for (const h of harnesses.splice(0)) h.unmount();
	});

	it("initialises all selection fields to null", () => {
		const h = renderHook(() => useComposerSelectionState());
		harnesses.push(h);
		expect(h.current!.selectedAgentId).toBeNull();
		expect(h.current!.selectedSkillId).toBeNull();
		expect(h.current!.selectedCommandName).toBeNull();
		expect(h.current!.messageModelOverride).toBeNull();
		expect(h.current!.editingMessageIdRef.current).toBeNull();
	});

	it("setSelectedSkillId does not auto-clear selectedCommandName (one-shot clear lives in sendMessage)", () => {
		const h = renderHook(() => useComposerSelectionState());
		harnesses.push(h);
		act(() => {
			h.current!.setSelectedSkillId("sk-1");
			h.current!.setSelectedCommandName("run");
		});
		expect(h.current!.selectedSkillId).toBe("sk-1");
		expect(h.current!.selectedCommandName).toBe("run");

		// Change the skill id — command name is deliberately preserved so
		// the slash panel can set skill + command in one interaction.
		act(() => {
			h.current!.setSelectedSkillId("sk-2");
		});
		expect(h.current!.selectedSkillId).toBe("sk-2");
		expect(h.current!.selectedCommandName).toBe("run");
	});

	it("editingMessageIdRef persists across renders via the ref identity", () => {
		const h = renderHook(() => useComposerSelectionState());
		harnesses.push(h);
		const ref1 = h.current!.editingMessageIdRef;
		ref1.current = "msg-42";

		// Force a re-render by mutating unrelated state.
		act(() => {
			h.current!.setSelectedAgentId("agent-x");
		});
		expect(h.current!.editingMessageIdRef).toBe(ref1);
		expect(h.current!.editingMessageIdRef.current).toBe("msg-42");
	});

	it("setMessageModelOverride round-trips a selection value", () => {
		const h = renderHook(() => useComposerSelectionState());
		harnesses.push(h);
		act(() => {
			h.current!.setMessageModelOverride({
				providerId: "prov",
				modelId: "mid",
			});
		});
		expect(h.current!.messageModelOverride).toEqual({
			providerId: "prov",
			modelId: "mid",
		});
	});
});
