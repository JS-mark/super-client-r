// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
	computeRemoteLifecycle,
	resolveTransition,
	type RemoteLifecycleInput,
	type RemoteLifecycleState,
} from "../RemoteSessionLifecycle";

function healthyInput(
	overrides: Partial<RemoteLifecycleInput> = {},
): RemoteLifecycleInput {
	return {
		hasBinding: true,
		sessionExists: true,
		sessionTombstoned: false,
		sessionArchived: false,
		botConfigured: true,
		botRunning: true,
		...overrides,
	};
}

describe("computeRemoteLifecycle", () => {
	it("returns unbound when no binding exists (even if bot is running)", () => {
		expect(
			computeRemoteLifecycle(healthyInput({ hasBinding: false })),
		).toBe("unbound");
	});

	it("returns tombstoned when session is soft-deleted", () => {
		expect(
			computeRemoteLifecycle(healthyInput({ sessionTombstoned: true })),
		).toBe("tombstoned");
	});

	it("returns tombstoned when the session no longer exists", () => {
		expect(
			computeRemoteLifecycle(healthyInput({ sessionExists: false })),
		).toBe("tombstoned");
	});

	it("returns archived when session is archived and not tombstoned", () => {
		expect(
			computeRemoteLifecycle(healthyInput({ sessionArchived: true })),
		).toBe("archived");
	});

	it("tombstoned wins over archived", () => {
		expect(
			computeRemoteLifecycle(
				healthyInput({ sessionTombstoned: true, sessionArchived: true }),
			),
		).toBe("tombstoned");
	});

	it("returns error-fatal for known fatal codes", () => {
		expect(
			computeRemoteLifecycle(healthyInput({ lastErrorCode: "remote.fatal" })),
		).toBe("error-fatal");
	});

	it("returns error-recoverable for any other error code", () => {
		expect(
			computeRemoteLifecycle(
				healthyInput({ lastErrorCode: "remote.transient" }),
			),
		).toBe("error-recoverable");
	});

	it("returns bot-offline when the bot is not configured", () => {
		expect(
			computeRemoteLifecycle(healthyInput({ botConfigured: false })),
		).toBe("bot-offline");
	});

	it("returns bot-offline when the bot is not running", () => {
		expect(
			computeRemoteLifecycle(healthyInput({ botRunning: false })),
		).toBe("bot-offline");
	});

	it("returns bound-idle for a healthy binding", () => {
		expect(computeRemoteLifecycle(healthyInput())).toBe("bound-idle");
	});

	it("session-level facts take precedence over bot facts", () => {
		expect(
			computeRemoteLifecycle(
				healthyInput({ sessionArchived: true, botRunning: false }),
			),
		).toBe("archived");
		expect(
			computeRemoteLifecycle(
				healthyInput({ sessionTombstoned: true, botRunning: false }),
			),
		).toBe("tombstoned");
	});
});

describe("resolveTransition covers every state × direction", () => {
	const cases: Array<{
		state: RemoteLifecycleState;
		direction: "inbound" | "outbound";
		action: string;
		reason?: string;
		code?: string;
	}> = [
		{
			state: "unbound",
			direction: "inbound",
			action: "drop-inbound",
			reason: "unbound",
			code: "unbound",
		},
		{
			state: "unbound",
			direction: "outbound",
			action: "reject-outbound",
			reason: "unbound",
			code: "unbound",
		},
		{ state: "bound-idle", direction: "inbound", action: "allow-inbound" },
		{ state: "bound-idle", direction: "outbound", action: "allow-outbound" },
		{ state: "bound-active", direction: "inbound", action: "allow-inbound" },
		{
			state: "bound-active",
			direction: "outbound",
			action: "allow-outbound",
		},
		{ state: "bot-offline", direction: "inbound", action: "allow-inbound" },
		{
			state: "bot-offline",
			direction: "outbound",
			action: "reject-outbound",
			reason: "bot-offline",
			code: "remote.botOffline",
		},
		{
			state: "archived",
			direction: "inbound",
			action: "drop-inbound-with-log",
			reason: "archived",
			code: "remote.inactive-received",
		},
		{
			state: "archived",
			direction: "outbound",
			action: "reject-outbound",
			reason: "archived",
			code: "remote.archived",
		},
		{
			state: "tombstoned",
			direction: "inbound",
			action: "drop-inbound-with-log",
			reason: "tombstoned",
			code: "remote.inactive-received",
		},
		{
			state: "tombstoned",
			direction: "outbound",
			action: "reject-outbound",
			reason: "tombstoned",
			code: "remote.tombstoned",
		},
		{
			state: "error-recoverable",
			direction: "inbound",
			action: "allow-inbound",
			reason: "error-recoverable",
			code: "remote.error.recoverable",
		},
		{
			state: "error-recoverable",
			direction: "outbound",
			action: "allow-outbound",
			reason: "error-recoverable",
			code: "remote.error.recoverable",
		},
		{
			state: "error-fatal",
			direction: "inbound",
			action: "drop-inbound",
			reason: "error-fatal",
			code: "remote.fatal",
		},
		{
			state: "error-fatal",
			direction: "outbound",
			action: "reject-outbound",
			reason: "error-fatal",
			code: "remote.fatal",
		},
	];

	for (const c of cases) {
		it(`${c.state} + ${c.direction} → ${c.action}`, () => {
			const result = resolveTransition(c.state, c.direction);
			expect(result.action).toBe(c.action);
			if (c.reason === undefined) {
				expect(result.reason).toBeUndefined();
			} else {
				expect(result.reason).toBe(c.reason);
			}
			if (c.code === undefined) {
				expect(result.code).toBeUndefined();
			} else {
				expect(result.code).toBe(c.code);
			}
		});
	}
});

describe("resolveTransition does not depend on duplicate-replay classification", () => {
	// Duplicate replay is handled inside RemoteChatBridge (persisted-id set
	// lookup). The state machine intentionally makes no decision about
	// duplicates, so its inbound verdict for a healthy binding is unchanged
	// regardless of external replay state.
	it("keeps allow-inbound for bound-idle regardless of how many times we ask", () => {
		expect(resolveTransition("bound-idle", "inbound").action).toBe(
			"allow-inbound",
		);
		expect(resolveTransition("bound-idle", "inbound").action).toBe(
			"allow-inbound",
		);
		expect(resolveTransition("bound-active", "inbound").action).toBe(
			"allow-inbound",
		);
	});
});
