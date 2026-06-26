// @vitest-environment node

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getRuntimePolicyService } from "../../runtime/RuntimePolicyService";
import { initializeProjectStorage } from "../../storage/ProjectStorageService";
import { initializeSessionStorage } from "../../storage/SessionStorageService";
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

	describe("with a session bound to a runtime policy", () => {
		let baseDir: string;
		let projects: ReturnType<typeof initializeProjectStorage>;
		let sessions: ReturnType<typeof initializeSessionStorage>;

		beforeAll(() => {
			baseDir = mkdtempSync(join(tmpdir(), "super-client-llm-policy-"));
			projects = initializeProjectStorage(baseDir, "default");
			sessions = initializeSessionStorage(baseDir, "default", projects);
		});

		afterAll(() => {
			rmSync(baseDir, { recursive: true, force: true });
		});

		function createSessionWithPolicy(
			runtimePolicy: Parameters<
				typeof projects.saveSettings
			>[1]["runtimePolicy"],
		) {
			const project = projects.add(
				`/tmp/super-client-llm-${Date.now()}-${Math.random()
					.toString(36)
					.slice(2)}`,
			);
			projects.saveSettings(project.id, {
				defaultModel: { providerId: "test", modelId: "test-model" },
				runtimePolicy,
			});
			return sessions.create({ projectId: project.id });
		}

		it("normalises file-write needs-approval to runtime.needsApproval (regression: kind-specific code surfaced as raw tool_error)", () => {
			// Regression: the pre-flight check in `toolAdapter` keys off
			// `policy.code === "runtime.needsApproval"` to route through the
			// inline approval UI. Returning the kind-specific
			// `runtime.writeNeedsApproval` instead made the adapter take the
			// hard-deny branch and render the policy reason verbatim
			// (`workspace-policy:file-write-approval-required`) as a tool
			// error.
			const runtimePolicy = getRuntimePolicyService();
			runtimePolicy.clearAuditLog();
			const session = createSessionWithPolicy({
				sandboxMode: "workspace-write",
				approvalMode: "request",
			});

			const service = new LLMService();
			const result = (
				service as unknown as {
					evaluateToolRuntimePolicy: (
						conversationId: string | undefined,
						toolName: string,
						args: Record<string, unknown>,
					) => { allowed: boolean; code?: string; message?: string };
				}
			).evaluateToolRuntimePolicy(session.id, "write_file", {
				path: "/tmp/a.txt",
			});

			expect(result).toMatchObject({
				allowed: false,
				code: "runtime.needsApproval",
			});
			// Original kind-specific reason is preserved in the message so
			// audit / debugging tooling keeps the detail.
			expect(result.message).toBe(
				"workspace-policy:file-write-approval-required",
			);
		});
	});
});
