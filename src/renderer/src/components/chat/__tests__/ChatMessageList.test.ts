import { describe, expect, it } from "vitest";
import { shouldVirtualizeMessageList } from "../chatMessageListVirtualization";

describe("shouldVirtualizeMessageList", () => {
	it("keeps small conversations on Bubble.List", () => {
		expect(shouldVirtualizeMessageList(80)).toBe(false);
	});

	it("uses virtualization for long conversations", () => {
		expect(shouldVirtualizeMessageList(81)).toBe(true);
		expect(shouldVirtualizeMessageList(500)).toBe(true);
	});
});
