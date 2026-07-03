/**
 * subagentBridgeRegistry — module-level dependency injection seam for the
 * built-in `Task` tool → subagent lifecycle bridge.
 *
 * The Task tool implementation lives in `mcp/internal/servers/agentBuiltinsServer.ts`
 * and is initialised WITHOUT direct access to the AgentRuntimeIpcBroker
 * (the internal MCP server is registered at boot; the broker is
 * constructed later per-window). Instead of threading the bridge through
 * every layer (mcpService → tool handler args → recursion) we expose a
 * tiny registry: the broker/boot code calls `setSubagentEventBridge()`
 * once at startup, and the Task tool handler pulls it lazily on each
 * spawn.
 *
 * The registry intentionally allows a `null` value so tests + prod code
 * with subagent tracking disabled can bypass the bridge without changing
 * the Task tool's public shape.
 */

import type { SubagentEventBridge } from "./SubagentEventBridge";

let bridge: SubagentEventBridge | null = null;

export function setSubagentEventBridge(next: SubagentEventBridge | null): void {
	bridge = next;
}

export function getSubagentEventBridge(): SubagentEventBridge | null {
	return bridge;
}
