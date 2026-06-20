import { describe, expect, it } from "vitest";
import { approvalModeLabel, approvalModeColor } from "../ApprovalModePill";

describe("approvalModeLabel", () => {
  it("maps each ApprovalMode to its Chinese label", () => {
    expect(approvalModeLabel("request")).toBe("按需审批");
    expect(approvalModeLabel("auto-safe")).toBe("替我审批");
    expect(approvalModeLabel("full-access")).toBe("完全放行");
  });
});

describe("approvalModeColor", () => {
  it("maps each ApprovalMode to its Tag color", () => {
    expect(approvalModeColor("request")).toBe("default");
    expect(approvalModeColor("auto-safe")).toBe("blue");
    expect(approvalModeColor("full-access")).toBe("orange");
  });
});
