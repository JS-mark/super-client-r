/**
 * Remote Session Lifecycle State Machine (pure module).
 *
 * Formalizes the classification of an IM ↔ conversation binding into a small
 * closed set of states, and resolves inbound / outbound transitions per state.
 *
 * This module is intentionally free of I/O and side effects: callers construct
 * a `RemoteLifecycleInput` snapshot from whatever storage / registry facts they
 * have and use `computeRemoteLifecycle` + `resolveTransition` to decide what to
 * do. Existing event codes are preserved so no renderer/IPC surface changes.
 *
 * See docs/remote-session-lifecycle.md and docs/refactor-plan.md §5.
 */

/** Closed set of lifecycle states a remote binding may occupy. */
export type RemoteLifecycleState =
	| "unbound"
	| "bound-idle"
	| "bound-active"
	| "bot-offline"
	| "archived"
	| "tombstoned"
	| "error-recoverable"
	| "error-fatal";

/**
 * Snapshot of every fact required to derive a lifecycle state.
 * Callers should compute this from their storage / bot registry lookups.
 */
export interface RemoteLifecycleInput {
	hasBinding: boolean;
	sessionExists: boolean;
	sessionTombstoned: boolean;
	sessionArchived: boolean;
	botConfigured: boolean;
	botRunning: boolean;
	/** Optional last-known error code carried through from a previous attempt. */
	lastErrorCode?: string;
}

/**
 * Fatal error codes that promote the binding to `error-fatal`. Anything else
 * present in `lastErrorCode` degrades to `error-recoverable`. The list is
 * intentionally small so state precedence stays predictable.
 */
const FATAL_ERROR_CODES: ReadonlySet<string> = new Set([
	"remote.fatal",
	"remote.tombstoned",
]);

/**
 * Classify an input snapshot into a single lifecycle state.
 *
 * Precedence (top wins):
 *   1. unbound          – nothing on the app side points at an IM chat.
 *   2. tombstoned       – session missing / soft-deleted / has tombstone.
 *   3. archived         – session archived (still exists, read-only).
 *   4. error-fatal      – previous fatal error we won't recover from.
 *   5. error-recoverable– previous transient error, retryable.
 *   6. bot-offline      – binding exists but bot is not configured or running.
 *   7. bound-idle       – healthy default.
 *
 * `bound-active` is not derived from this input shape (there is no traffic
 * signal in `RemoteLifecycleInput`); it is a valid return that state-machine
 * consumers may substitute when they know traffic is in flight. Transition
 * rules treat `bound-active` identically to `bound-idle`.
 */
export function computeRemoteLifecycle(
	input: RemoteLifecycleInput,
): RemoteLifecycleState {
	if (!input.hasBinding) return "unbound";
	if (input.sessionTombstoned || !input.sessionExists) return "tombstoned";
	if (input.sessionArchived) return "archived";
	if (input.lastErrorCode) {
		if (FATAL_ERROR_CODES.has(input.lastErrorCode)) return "error-fatal";
		return "error-recoverable";
	}
	if (!input.botConfigured || !input.botRunning) return "bot-offline";
	return "bound-idle";
}

/** Direction of the message being classified relative to the app. */
export type RemoteLifecycleDirection = "inbound" | "outbound";

/** Actions the caller must take for the current (state, direction) pair. */
export type RemoteLifecycleAction =
	| "allow-inbound"
	| "drop-inbound"
	| "drop-inbound-with-log"
	| "reject-outbound"
	| "allow-outbound";

export interface RemoteLifecycleTransitionResult {
	action: RemoteLifecycleAction;
	/** Short machine reason (state-shape identifier). */
	reason?: string;
	/** Public error code — the same string surfaced through IPC / events. */
	code?: string;
}

/**
 * Resolve what action to take given a state and message direction.
 *
 * Codes returned here mirror the existing event codes used by
 * `RemoteChatBridge` so downstream consumers keep working:
 *   - `remote.botOffline`         (already used by RemoteBotOfflineError)
 *   - `remote.inactive-received`  (already emitted for archived/tombstoned inbound)
 *   - `remote.archived`, `remote.tombstoned`, `remote.fatal` – newly classified
 *     outbound / fatal rejections.
 */
export function resolveTransition(
	current: RemoteLifecycleState,
	direction: RemoteLifecycleDirection,
): RemoteLifecycleTransitionResult {
	switch (current) {
		case "unbound":
			return direction === "inbound"
				? { action: "drop-inbound", reason: "unbound", code: "unbound" }
				: { action: "reject-outbound", reason: "unbound", code: "unbound" };
		case "bound-idle":
		case "bound-active":
			return direction === "inbound"
				? { action: "allow-inbound" }
				: { action: "allow-outbound" };
		case "bot-offline":
			return direction === "inbound"
				? { action: "allow-inbound" }
				: {
						action: "reject-outbound",
						reason: "bot-offline",
						code: "remote.botOffline",
					};
		case "archived":
			return direction === "inbound"
				? {
						action: "drop-inbound-with-log",
						reason: "archived",
						code: "remote.inactive-received",
					}
				: {
						action: "reject-outbound",
						reason: "archived",
						code: "remote.archived",
					};
		case "tombstoned":
			return direction === "inbound"
				? {
						action: "drop-inbound-with-log",
						reason: "tombstoned",
						code: "remote.inactive-received",
					}
				: {
						action: "reject-outbound",
						reason: "tombstoned",
						code: "remote.tombstoned",
					};
		case "error-recoverable":
			return direction === "inbound"
				? {
						action: "allow-inbound",
						reason: "error-recoverable",
						code: "remote.error.recoverable",
					}
				: {
						action: "allow-outbound",
						reason: "error-recoverable",
						code: "remote.error.recoverable",
					};
		case "error-fatal":
			return direction === "inbound"
				? {
						action: "drop-inbound",
						reason: "error-fatal",
						code: "remote.fatal",
					}
				: {
						action: "reject-outbound",
						reason: "error-fatal",
						code: "remote.fatal",
					};
	}
}
