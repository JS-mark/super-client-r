// @vitest-environment node

import { describe, expect, it } from "vitest";
import type {
	RuntimeOperationContext,
	WorkspaceRuntimePolicy,
} from "@super-client/shared-types/chat";
import { RuntimePolicyService } from "../RuntimePolicyService";

const basePolicy: WorkspaceRuntimePolicy = {
	approvalMode: "auto-safe",
	sandboxMode: "workspace-write",
	writableRoots: [],
	networkAccess: "allowed",
	externalAppAccess: "allowed",
};

function op(kind: RuntimeOperationContext["kind"]): RuntimeOperationContext {
	return {
		workspaceId: "project-1",
		source: "user",
		operation: `test.${kind}`,
		kind,
		target: "/tmp/x",
	};
}

describe("RuntimePolicyService.evaluate", () => {
	it("denies blocked external apps", () => {
		const svc = new RuntimePolicyService();
		const result = svc.evaluate(op("external-app"), {
			...basePolicy,
			externalAppAccess: "blocked",
		});
		expect(result.decision).toBe("deny");
		expect(result.code).toBe("runtime.externalAppBlocked");
	});

	it("requires approval for approval-required network", () => {
		const svc = new RuntimePolicyService();
		const result = svc.evaluate(op("network-request"), {
			...basePolicy,
			networkAccess: "approval-required",
		});
		expect(result.decision).toBe("needs-approval");
		expect(result.code).toBe("runtime.networkNeedsApproval");
	});

	it("denies file writes in read-only sandbox", () => {
		const svc = new RuntimePolicyService();
		const result = svc.evaluate(op("file-write"), {
			...basePolicy,
			sandboxMode: "read-only",
		});
		expect(result.decision).toBe("deny");
		expect(result.code).toBe("runtime.writeBlockedReadOnly");
	});

	it("requires approval for command exec outside system-access", () => {
		const svc = new RuntimePolicyService();
		const result = svc.evaluate(op("command-exec"), basePolicy);
		expect(result.decision).toBe("needs-approval");
		expect(result.code).toBe("runtime.commandNeedsApproval");
	});

	it("keeps unsupported tool execution explicitly audit-only", () => {
		const svc = new RuntimePolicyService();
		const result = svc.evaluate(op("tool-execute"), basePolicy);
		expect(result.decision).toBe("allow");
		expect(result.reason).toBe("audit-only:not-enforced");
	});
});
