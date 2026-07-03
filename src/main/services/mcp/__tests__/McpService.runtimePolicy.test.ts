// @vitest-environment node

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { McpServerConfig } from "../../../ipc/types";

vi.mock("electron", () => ({
	app: {
		getPath: () => "/tmp/super-client-r-vitest-user-data",
	},
	BrowserWindow: {
		getAllWindows: () => [],
	},
}));

vi.mock("electron-store", () => ({
	default: class MockStore {
		private data: Record<string, unknown>;

		constructor(options: { defaults?: Record<string, unknown> } = {}) {
			this.data = { ...options.defaults };
		}

		get(key: string): unknown {
			return this.data[key];
		}

		set(key: string, value: unknown): void {
			this.data[key] = value;
		}

		delete(key: string): void {
			delete this.data[key];
		}
	},
}));

import { getRuntimePolicyService } from "../../runtime/RuntimePolicyService";
import { initializeProjectStorage } from "../../storage/ProjectStorageService";
import { initializeSessionStorage } from "../../storage/SessionStorageService";
import { McpService } from "../McpService";
import { thirdPartyMcpService } from "../ThirdPartyMcpService";

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

	afterEach(() => {
		vi.restoreAllMocks();
		thirdPartyMcpService.removeAllListeners();
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

	function registerServerInMemory(
		service: McpService,
		config: McpServerConfig,
	): void {
		(
			service as unknown as {
				servers: Map<string, McpServerConfig>;
			}
		).servers.set(config.id, config);
	}

	function builtinServer(id: string): McpServerConfig {
		return {
			id,
			name: id,
			type: "builtin",
			transport: "stdio",
			command: "mock-mcp",
		};
	}

	function thirdPartyServer(id: string): McpServerConfig {
		return {
			id,
			name: id,
			type: "third-party",
			transport: "http",
			url: "https://mcp.example.test",
		};
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

		// Needs-approval is normalised to the generic `runtime.needsApproval`
		// marker so `toolExecutorFactory` can route through the inline
		// approval UI without knowing the kind-specific code. The original
		// reason is still recorded in the audit log for debugging.
		expect(result).toMatchObject({
			allowed: false,
			code: "runtime.needsApproval",
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

	it("normalises file-write needs-approval to runtime.needsApproval (regression: file-write-approval-required surfaced as raw tool_error)", () => {
		// Regression: when a session has `approvalMode: "request"` and the
		// LLM calls a `file-write` tool, the runtime policy returns
		// `needs-approval` with the kind-specific code
		// `runtime.writeNeedsApproval`. `toolExecutorFactory` only knows the
		// generic `runtime.needsApproval` marker, so the kind-specific code
		// fell through and rendered as a raw `tool_error` with the message
		// `workspace-policy:file-write-approval-required`. Both `command-exec`
		// and `file-write` (and any other `*NeedsApproval`) must collapse
		// to the same marker.
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
		).evaluateRuntimePolicy(session.id, "@scp/file-system", "write_file", {
			path: "/tmp/super-client-project/a.txt",
		});

		expect(result).toMatchObject({
			allowed: false,
			code: "runtime.needsApproval",
		});
		expect(runtimePolicy.getAuditLog().at(-1)).toMatchObject({
			source: "mcp",
			operation: "@scp/file-system:write_file",
			kind: "file-write",
			decision: "denied",
			reason: "workspace-policy:file-write-approval-required",
		});
	});

	it("downgrades command needs-approval to allow when approvalGranted is passed", () => {
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
					gateOptions: { approvalGranted?: boolean },
				) => { allowed: boolean; code?: string };
			}
		).evaluateRuntimePolicy(
			session.id,
			"@scp/bash",
			"execute_command",
			{ command: "pwd" },
			{ approvalGranted: true },
		);

		expect(result.allowed).toBe(true);
		expect(runtimePolicy.getAuditLog().at(-1)).toMatchObject({
			operation: "@scp/bash:execute_command",
			decision: "allowed",
		});
		// The override note keeps the original policy reason for auditing.
		expect(runtimePolicy.getAuditLog().at(-1)?.reason).toMatch(
			/^approval-granted:/,
		);
	});

	it("still hard-denies read-only writes even when approvalGranted is set", () => {
		// `deny` outranks the approval override; only `needs-approval` is
		// downgraded. Guards against the override being interpreted as a
		// general bypass.
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
					gateOptions: { approvalGranted?: boolean },
				) => { allowed: boolean; code?: string };
			}
		).evaluateRuntimePolicy(
			session.id,
			"@scp/file-system",
			"write_file",
			{ path: "/tmp/super-client-project/a.txt" },
			{ approvalGranted: true },
		);

		expect(result).toMatchObject({
			allowed: false,
			code: "runtime.writeBlockedReadOnly",
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

	it("callTool allows an approved stdio command and records allowed", async () => {
		const runtimePolicy = getRuntimePolicyService();
		runtimePolicy.clearAuditLog();
		const session = createSessionWithPolicy({
			sandboxMode: "system-access",
			approvalMode: "full-access",
		});
		const service = new McpService();
		registerServerInMemory(service, builtinServer("@scp/bash"));
		const stdioCall = vi
			.spyOn(
				service as unknown as {
					callStdioTool: (
						serverId: string,
						toolName: string,
						args: Record<string, unknown>,
					) => Promise<unknown>;
				},
				"callStdioTool",
			)
			.mockResolvedValue({ content: [{ type: "text", text: "ok" }] });

		const result = await service.callTool(
			"@scp/bash",
			"execute_command",
			{ command: "pwd" },
			{ conversationId: session.id },
		);

		expect(result).toMatchObject({
			success: true,
			serverType: "builtin",
			data: { content: [{ type: "text", text: "ok" }] },
		});
		expect(stdioCall).toHaveBeenCalledWith("@scp/bash", "execute_command", {
			command: "pwd",
		});
		expect(runtimePolicy.getAuditLog().at(-1)).toMatchObject({
			source: "mcp",
			operation: "@scp/bash:execute_command",
			kind: "command-exec",
			target: "pwd",
			decision: "allowed",
		});
	});

	it("callTool allows audit-only stdio reads and does not skip auditing", async () => {
		const runtimePolicy = getRuntimePolicyService();
		runtimePolicy.clearAuditLog();
		const session = createSessionWithPolicy({
			sandboxMode: "read-only",
			approvalMode: "request",
		});
		const service = new McpService();
		registerServerInMemory(service, builtinServer("@scp/file-system"));
		const stdioCall = vi
			.spyOn(
				service as unknown as {
					callStdioTool: (
						serverId: string,
						toolName: string,
						args: Record<string, unknown>,
					) => Promise<unknown>;
				},
				"callStdioTool",
			)
			.mockResolvedValue({ content: [{ type: "text", text: "contents" }] });

		const result = await service.callTool(
			"@scp/file-system",
			"read_file",
			{ path: "/tmp/super-client-project/a.txt" },
			{ conversationId: session.id },
		);

		expect(result.success).toBe(true);
		expect(stdioCall).toHaveBeenCalledTimes(1);
		expect(runtimePolicy.getAuditLog().at(-1)).toMatchObject({
			source: "mcp",
			operation: "@scp/file-system:read_file",
			kind: "file-read",
			target: "/tmp/super-client-project/a.txt",
			decision: "audit-only",
			reason: "audit-only:not-enforced",
		});
	});

	it("callTool denies stdio writes before the server delegate is invoked", async () => {
		const runtimePolicy = getRuntimePolicyService();
		runtimePolicy.clearAuditLog();
		const session = createSessionWithPolicy({
			sandboxMode: "read-only",
			approvalMode: "request",
		});
		const service = new McpService();
		registerServerInMemory(service, builtinServer("@scp/file-system"));
		const stdioCall = vi.spyOn(
			service as unknown as {
				callStdioTool: (
					serverId: string,
					toolName: string,
					args: Record<string, unknown>,
				) => Promise<unknown>;
			},
			"callStdioTool",
		);

		const result = await service.callTool(
			"@scp/file-system",
			"write_file",
			{ path: "/tmp/super-client-project/a.txt" },
			{ conversationId: session.id },
		);

		expect(result).toMatchObject({
			success: false,
			errorCode: "runtime.writeBlockedReadOnly",
			serverType: "builtin",
			error: "workspace-policy:read-only-sandbox",
		});
		expect(stdioCall).not.toHaveBeenCalled();
		expect(runtimePolicy.getAuditLog().at(-1)).toMatchObject({
			operation: "@scp/file-system:write_file",
			decision: "denied",
			reason: "workspace-policy:read-only-sandbox",
		});
	});

	it("callTool denies third-party network requests before the third-party delegate is invoked", async () => {
		const runtimePolicy = getRuntimePolicyService();
		runtimePolicy.clearAuditLog();
		const session = createSessionWithPolicy({
			networkAccess: "blocked",
		});
		const service = new McpService();
		registerServerInMemory(service, thirdPartyServer("third-party-fetch"));
		const thirdPartyCall = vi.spyOn(thirdPartyMcpService, "callTool");

		const result = await service.callTool(
			"third-party-fetch",
			"fetch_url",
			{ url: "https://example.com" },
			{ conversationId: session.id },
		);

		expect(result).toMatchObject({
			success: false,
			errorCode: "runtime.networkBlocked",
			serverType: "third-party",
			error: "workspace-policy:network-blocked",
		});
		expect(thirdPartyCall).not.toHaveBeenCalled();
		expect(runtimePolicy.getAuditLog().at(-1)).toMatchObject({
			source: "mcp",
			operation: "third-party-fetch:fetch_url",
			kind: "network-request",
			target: "https://example.com",
			decision: "denied",
			reason: "workspace-policy:network-blocked",
		});
	});

	it("callTool blocks third-party needs-approval until approvalGranted is passed", async () => {
		const runtimePolicy = getRuntimePolicyService();
		runtimePolicy.clearAuditLog();
		const session = createSessionWithPolicy({
			networkAccess: "approval-required",
		});
		const service = new McpService();
		registerServerInMemory(service, thirdPartyServer("third-party-fetch"));
		const thirdPartyCall = vi
			.spyOn(thirdPartyMcpService, "callTool")
			.mockResolvedValue({
				success: true,
				data: { content: [{ type: "text", text: "fetched" }] },
				metadata: {
					serverId: "third-party-fetch",
					toolName: "fetch_url",
					timestamp: Date.now(),
					duration: 7,
				},
			});

		const blocked = await service.callTool(
			"third-party-fetch",
			"fetch_url",
			{ url: "https://example.com" },
			{ conversationId: session.id },
		);

		expect(blocked).toMatchObject({
			success: false,
			errorCode: "runtime.needsApproval",
			serverType: "third-party",
			error: "workspace-policy:network-approval-required",
		});
		expect(thirdPartyCall).not.toHaveBeenCalled();
		expect(runtimePolicy.getAuditLog().at(-1)).toMatchObject({
			operation: "third-party-fetch:fetch_url",
			decision: "denied",
			reason: "workspace-policy:network-approval-required",
		});

		const allowed = await service.callTool(
			"third-party-fetch",
			"fetch_url",
			{ url: "https://example.com" },
			{ conversationId: session.id, approvalGranted: true },
		);

		expect(allowed).toMatchObject({
			success: true,
			serverType: "third-party",
			data: { content: [{ type: "text", text: "fetched" }] },
		});
		expect(thirdPartyCall).toHaveBeenCalledWith(
			"third-party-fetch",
			"fetch_url",
			{ url: "https://example.com" },
		);
		expect(runtimePolicy.getAuditLog().at(-1)).toMatchObject({
			operation: "third-party-fetch:fetch_url",
			decision: "allowed",
		});
		expect(runtimePolicy.getAuditLog().at(-1)?.reason).toBe(
			"approval-granted:workspace-policy:network-approval-required",
		);
	});
});
