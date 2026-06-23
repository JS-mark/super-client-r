// @vitest-environment node

import { describe, expect, it } from "vitest";
import { getRuntimePolicyService } from "../../runtime/RuntimePolicyService";
import { LLMService } from "../LLMService";

describe("LLMService runtime policy gate", () => {
	it("allows legacy tool execution without a session but records audit-only", () => {
		const runtimePolicy = getRuntimePolicyService();
		runtimePolicy.clearAuditLog();

		const service = new LLMService();
		const result = (
			service as unknown as {
				evaluateToolRuntimePolicy: (
					conversationId: string | undefined,
					toolName: string,
					args: Record<string, unknown>,
				) => { allowed: boolean };
			}
		).evaluateToolRuntimePolicy(undefined, "write_file", { path: "/tmp/a" });

		expect(result.allowed).toBe(true);
		expect(runtimePolicy.getAuditLog().at(-1)).toMatchObject({
			source: "llm",
			operation: "write_file",
			kind: "file-write",
			decision: "audit-only",
			reason: "no-session",
		});
	});
});
