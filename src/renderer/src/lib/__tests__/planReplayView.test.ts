import { describe, expect, it } from "vitest";
import { describePlanDecisionSummary } from "../planReplayView";

describe("describePlanDecisionSummary", () => {
	it("formats an execute decision with the linked user turn id", () => {
		expect(
			describePlanDecisionSummary({
				action: "execute",
				sourcePlanId: "plan-123",
				sourcePlanVersion: 2,
				executeTurnUserMessageId: "user-execute-1",
			}),
		).toEqual({
			label: "Plan executed",
			detail: "plan plan-123#2 · turn user-execute-1",
		});
	});

	it("formats a cancel decision without user turn detail", () => {
		expect(
			describePlanDecisionSummary({
				action: "cancel",
				sourcePlanId: "plan-abc",
				sourcePlanVersion: 1,
			}),
		).toEqual({
			label: "Plan cancelled",
			detail: "plan plan-abc#1",
		});
	});

	it("formats a regenerate decision with the version in the label", () => {
		expect(
			describePlanDecisionSummary({
				action: "regenerate",
				sourcePlanId: "plan-xyz",
				sourcePlanVersion: 3,
			}),
		).toEqual({
			label: "Plan regenerated (v3)",
			detail: "plan plan-xyz#3",
		});
	});
});
