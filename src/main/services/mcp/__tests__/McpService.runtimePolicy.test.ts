// @vitest-environment node

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getRuntimePolicyService } from "../../runtime/RuntimePolicyService";
import { initializeProjectStorage } from "../../storage/ProjectStorageService";
import { initializeSessionStorage } from "../../storage/SessionStorageService";
import { McpService } from "../McpService";

describe("McpService runtime policy gate", () => {
	let baseDir: string;
	let projects: ReturnType<typeof initializeProjectStorage>;
	let sessions: ReturnType<typeof initializeSessionStorage>;

	beforeAll(() => {
		baseDir = mkdtempSync(join(tmpdir(), "super-client-mcp-policy-"));
		projects = initializeProjectStorage(baseDir, "default");
		sessions = initializeSessionStorage(baseDir, "default", projects);
	});

	afterAll(() => {
		rmSync(baseDir, { recursive: true, force: true });
	});

	function createSessionWithPolicy(
		runtimePolicy: Parameters<typeof projects.saveSettings>[1]["runtimePolicy"],
	) {
		const project = projects.add(
			`/tmp/super-client-project-${Date.now()}-${Math.random().toString(36).slice(2)}`,
		);
		projects.saveSettings(project.id, {
			defaultModel: { providerId: "test", modelId: "test-model" },
			runtimePolicy,
		});
		return sessions.create({ projectId: project.id });
	}

	it("allows MCP tool execution without a session but records audit-only", () => {
		const runtimePolicy = getRuntimePolicyService();
		runtimePolicy.clearAuditLog();

		const service = new McpService();
		const result = (
			service as unknown as {
				evaluateRuntimePolicy: (
					conversationId: string | undefined,
					serverId: string,
					toolName: string,
					args: Record<string, unknown>,
				) => { allowed: boolean };
			}
		).evaluateRuntimePolicy(undefined, "@scp/file-system", "write_file", {
			path: "/tmp/a",
		});

		expect(result.allowed).toBe(true);
		expect(runtimePolicy.getAuditLog().at(-1)).toMatchObject({
			source: "mcp",
			operation: "@scp/file-system:write_file",
			kind: "file-write",
			target: "/tmp/a",
			decision: "audit-only",
			reason: "no-session",
		});
	});

	it("denies MCP file writes when session runtime policy is read-only", () => {
		const runtimePolicy = getRuntimePolicyService();
		runtimePolicy.clearAuditLog();
		const session = createSessionWithPolicy({
			sandboxMode: "read-only",
			approvalMode: "request",
		});

		const service = new McpService();
		const result = (
			service as unknown as {
				evaluateRuntimePolicy: (
					conversationId: string | undefined,
					serverId: string,
					toolName: string,
					args: Record<string, unknown>,
				) => { allowed: boolean; code?: string };
			}
		).evaluateRuntimePolicy(session.id, "@scp/file-system", "write_file", {
			path: "/tmp/super-client-project/a.txt",
		});

		expect(result).toMatchObject({
			allowed: false,
			code: "runtime.writeBlockedReadOnly",
		});
		expect(runtimePolicy.getAuditLog().at(-1)).toMatchObject({
			source: "mcp",
			operation: "@scp/file-system:write_file",
			kind: "file-write",
			target: "/tmp/super-client-project/a.txt",
			decision: "denied",
			reason: "workspace-policy:read-only-sandbox",
		});
	});

	it("denies MCP command execution when the session has no system-access sandbox", () => {
		const runtimePolicy = getRuntimePolicyService();
		runtimePolicy.clearAuditLog();
		const session = createSessionWithPolicy({
			sandboxMode: "workspace-write",
			approvalMode: "request",
		});

		const service = new McpService();
		const result = (
			service as unknown as {
				evaluateRuntimePolicy: (
					conversationId: string | undefined,
					serverId: string,
					toolName: string,
					args: Record<string, unknown>,
				) => { allowed: boolean; code?: string };
			}
		).evaluateRuntimePolicy(session.id, "@scp/bash", "execute_command", {
			command: "pwd",
		});

		expect(result).toMatchObject({
			allowed: false,
			code: "runtime.commandNeedsApproval",
		});
		expect(runtimePolicy.getAuditLog().at(-1)).toMatchObject({
			source: "mcp",
			operation: "@scp/bash:execute_command",
			kind: "command-exec",
			target: "pwd",
			decision: "denied",
			reason: "workspace-policy:command-approval-required",
		});
	});

	it("denies MCP network requests when project policy blocks network", () => {
		const runtimePolicy = getRuntimePolicyService();
		runtimePolicy.clearAuditLog();
		const session = createSessionWithPolicy({
			networkAccess: "blocked",
		});

		const service = new McpService();
		const result = (
			service as unknown as {
				evaluateRuntimePolicy: (
					conversationId: string | undefined,
					serverId: string,
					toolName: string,
					args: Record<string, unknown>,
				) => { allowed: boolean; code?: string };
			}
		).evaluateRuntimePolicy(session.id, "@scp/fetch", "fetch_url", {
			url: "https://example.com",
		});

		expect(result).toMatchObject({
			allowed: false,
			code: "runtime.networkBlocked",
		});
		expect(runtimePolicy.getAuditLog().at(-1)).toMatchObject({
			source: "mcp",
			operation: "@scp/fetch:fetch_url",
			kind: "network-request",
			target: "https://example.com",
			decision: "denied",
			reason: "workspace-policy:network-blocked",
		});
	});
});
