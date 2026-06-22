import { describe, expect, it } from "vitest";
import { deriveLocalRemoteLabel } from "../ChatComposerInfoBar";

describe("deriveLocalRemoteLabel", () => {
	it("returns 本地模式 when conversation has no remote binding", () => {
		expect(deriveLocalRemoteLabel(undefined)).toBe("本地模式");
		expect(deriveLocalRemoteLabel(null)).toBe("本地模式");
	});

	it("returns 已绑定 IM when conversation.remote is set", () => {
		expect(deriveLocalRemoteLabel({ platform: "wechat" } as never)).toBe(
			"已绑定 IM",
		);
	});
});
