// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	_resetSubagentControlRegistryForTest,
	cancelSubagentControl,
	hasSubagentControl,
	registerSubagentControl,
	unregisterSubagentControl,
} from "../subagentControlRegistry";

afterEach(() => {
	_resetSubagentControlRegistryForTest();
});

describe("subagentControlRegistry", () => {
	it("register + cancel invokes the handle's cancel() once and unregisters", () => {
		const cancel = vi.fn();
		registerSubagentControl({ subagentRunId: "sub-1", cancel });
		expect(hasSubagentControl("sub-1")).toBe(true);

		expect(cancelSubagentControl("sub-1")).toBe(true);
		expect(cancel).toHaveBeenCalledTimes(1);
		expect(hasSubagentControl("sub-1")).toBe(false);

		// Second cancel is a no-op (already unregistered) — no double-abort.
		expect(cancelSubagentControl("sub-1")).toBe(false);
		expect(cancel).toHaveBeenCalledTimes(1);
	});

	it("cancel on an unknown run returns false", () => {
		expect(cancelSubagentControl("ghost")).toBe(false);
	});

	it("unregister prevents a later cancel from firing", () => {
		const cancel = vi.fn();
		registerSubagentControl({ subagentRunId: "sub-2", cancel });
		unregisterSubagentControl("sub-2");
		expect(cancelSubagentControl("sub-2")).toBe(false);
		expect(cancel).not.toHaveBeenCalled();
	});

	it("a throwing cancel() callback is swallowed and still unregisters", () => {
		registerSubagentControl({
			subagentRunId: "sub-3",
			cancel: () => {
				throw new Error("boom");
			},
		});
		expect(() => cancelSubagentControl("sub-3")).not.toThrow();
		expect(hasSubagentControl("sub-3")).toBe(false);
	});

	it("re-registering the same id overwrites the prior handle", () => {
		const first = vi.fn();
		const second = vi.fn();
		registerSubagentControl({ subagentRunId: "sub-4", cancel: first });
		registerSubagentControl({ subagentRunId: "sub-4", cancel: second });
		cancelSubagentControl("sub-4");
		expect(first).not.toHaveBeenCalled();
		expect(second).toHaveBeenCalledTimes(1);
	});
});
