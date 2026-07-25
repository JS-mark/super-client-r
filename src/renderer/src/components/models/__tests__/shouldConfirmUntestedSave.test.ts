import { describe, expect, it } from "vitest";
import { shouldConfirmUntestedSave } from "../ModelList";

// 产品决策：未测试连接允许保存但需二次提示；已测通则直接保存。
describe("shouldConfirmUntestedSave", () => {
	it("requires confirm when never tested (null)", () => {
		expect(shouldConfirmUntestedSave(null)).toBe(true);
	});

	it("requires confirm when tested result is undefined", () => {
		expect(shouldConfirmUntestedSave(undefined)).toBe(true);
	});

	it("requires confirm when the last test failed", () => {
		expect(shouldConfirmUntestedSave({ success: false })).toBe(true);
	});

	it("skips confirm when the last test succeeded", () => {
		expect(shouldConfirmUntestedSave({ success: true })).toBe(false);
	});
});
