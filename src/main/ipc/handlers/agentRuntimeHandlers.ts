/**
 * AgentRuntime IPC Handlers
 *
 * 新 `agent:*` 通道——由 `AgentRuntimeIpcBroker` 统一处理。详见 spec §6。
 *
 * 包含：
 *   - agent:create-query         → broker.createQuery
 *   - agent:resolve-permission   → broker.resolvePermission
 *   - agent:interrupt            → broker.interrupt
 *   - agent:list-native-sessions → registry.get(...).listNativeSessions
 *   - agent:fork-native-session  → registry.get(...).forkNativeSession
 *   - agent:list-runtimes        → registry.list()
 *
 * 旧 `agent-sdk:*` 通道目前保留在 streamingHandlers.ts 不动；Phase 1.6 之后
 * renderer 灰度切到新通道，旧通道在 Phase 3 删除。
 */

import type { IpcMainInvokeEvent } from "electron";
import { ipcMain } from "electron";
import type {
	AgentQueryRequestPayload,
	AgentRuntimeId,
	CustomAgentRuntimeId,
	PermissionDecision,
} from "@super-client/shared-types/agent-runtime";

import {
	AgentRuntimeIpcBroker,
	wrapWebContents,
	type SessionContextResolver,
} from "../../services/agent/runtime/AgentRuntimeIpcBroker";
import { getAgentRuntimeRegistry } from "../../services/agent/runtime/AgentRuntimeRegistry";
import { listBuiltinTools } from "../../services/agent/runtime/tools/BuiltinToolRegistry";
import { getAgentTraceCollector } from "../../services/agent/trace/AgentTraceCollector";
import { getSessionRuntimeResolver } from "../../services/runtime/SessionRuntimeResolver";
import { getSessionStorage } from "../../services/storage/SessionStorageService";

// ─────────────────────────────────────────────────────────────────────
// Channels（按 spec §6.1 定义；新增到 channels.ts 之外，因为它们是 streaming
// 性质需要 ipcMain.handle / sender.send，与 typed proxy 不同）
// ─────────────────────────────────────────────────────────────────────

/**
 * 与 createBridge 在 preload 端生成的 channel 名一致：
 * camelCase 方法 → kebab-case channel，namespace = `agent-runtime`。
 *
 * 用 `agent-runtime:` 命名空间是为了避开 legacy `agent:` 桥接（`AgentService`
 * 已经占用 `agent:stream-event` 等 channel）。
 */
export const AGENT_RUNTIME_CHANNELS = {
	CREATE_QUERY: "agent-runtime:create-query",
	STREAM_EVENT: "agent-runtime:stream-event",
	RESOLVE_PERMISSION: "agent-runtime:resolve-permission",
	INTERRUPT: "agent-runtime:interrupt",
	LIST_NATIVE_SESSIONS: "agent-runtime:list-native-sessions",
	FORK_NATIVE_SESSION: "agent-runtime:fork-native-session",
	LIST_RUNTIMES: "agent-runtime:list-runtimes",
	LIST_BUILTIN_TOOLS: "agent-runtime:list-builtin-tools",
} as const;

// ─────────────────────────────────────────────────────────────────────
// SessionContextResolver 桥接：把 main 既有的 SessionRuntimeResolver +
// SessionStorageService 包成 broker 需要的形态。
// ─────────────────────────────────────────────────────────────────────

class MainSessionContextResolver implements SessionContextResolver {
	async resolve(conversationId: string) {
		const meta = getSessionStorage().getMeta(conversationId);
		const effective = getSessionRuntimeResolver().resolve({
			sessionId: conversationId,
		});
		return {
			sessionMeta: {
				runtimeId: meta?.runtimeId,
				interactionProfileOverride: meta?.interactionProfileOverride,
			},
			effective,
		};
	}
}

// ─────────────────────────────────────────────────────────────────────
// Singleton broker (lazy)
// ─────────────────────────────────────────────────────────────────────

let brokerSingleton: AgentRuntimeIpcBroker | null = null;

function getBroker(): AgentRuntimeIpcBroker {
	if (!brokerSingleton) {
		brokerSingleton = new AgentRuntimeIpcBroker({
			registry: getAgentRuntimeRegistry(),
			trace: getAgentTraceCollector(),
			resolver: new MainSessionContextResolver(),
			onError: (err, ctx) => {
				console.error(
					`[AgentRuntimeIpcBroker] error for request ${ctx.requestId}:`,
					err,
				);
			},
		});
	}
	return brokerSingleton;
}

/** 测试 / app quit 用。 */
export function disposeAgentRuntimeBroker(): Promise<void> {
	const b = brokerSingleton;
	brokerSingleton = null;
	return b ? b.dispose() : Promise.resolve();
}

// ─────────────────────────────────────────────────────────────────────
// Handler 注册
// ─────────────────────────────────────────────────────────────────────

export function registerAgentRuntimeHandlers(): void {
	// agent:create-query —— 异步启动；事件通过 sender.send 推送。
	ipcMain.handle(
		AGENT_RUNTIME_CHANNELS.CREATE_QUERY,
		async (event: IpcMainInvokeEvent, payload: AgentQueryRequestPayload) => {
			try {
				const r = await getBroker().createQuery(
					payload,
					wrapWebContents(event.sender),
				);
				return { success: true, data: r };
			} catch (err) {
				const message =
					err instanceof Error ? err.message : "createQuery failed";
				return { success: false, error: message };
			}
		},
	);

	// agent:resolve-permission
	ipcMain.handle(
		AGENT_RUNTIME_CHANNELS.RESOLVE_PERMISSION,
		async (
			_event: IpcMainInvokeEvent,
			args: { id: string; decision: PermissionDecision },
		) => {
			try {
				await getBroker().resolvePermission(args.id, args.decision);
				return { success: true };
			} catch (err) {
				return {
					success: false,
					error:
						err instanceof Error ? err.message : "resolvePermission failed",
				};
			}
		},
	);

	// agent:interrupt
	ipcMain.handle(
		AGENT_RUNTIME_CHANNELS.INTERRUPT,
		async (_event: IpcMainInvokeEvent, args: { requestId: string }) => {
			try {
				const r = await getBroker().interrupt(args.requestId);
				return { success: true, data: r };
			} catch (err) {
				return {
					success: false,
					error: err instanceof Error ? err.message : "interrupt failed",
				};
			}
		},
	);

	// agent:list-runtimes
	ipcMain.handle(AGENT_RUNTIME_CHANNELS.LIST_RUNTIMES, async () => ({
		success: true,
		data: getAgentRuntimeRegistry().list(),
	}));

	// agent-runtime:list-builtin-tools — static metadata for the 8 facade tools
	// (Read/Write/Edit/Bash/Grep/Glob/WebFetch/Task). Used by the renderer to
	// list them in the conversation-settings "预授权工具" panel so they can be
	// pre-authorized just like MCP tools.
	ipcMain.handle(AGENT_RUNTIME_CHANNELS.LIST_BUILTIN_TOOLS, async () => ({
		success: true,
		data: listBuiltinTools(),
	}));

	// agent:list-native-sessions
	ipcMain.handle(
		AGENT_RUNTIME_CHANNELS.LIST_NATIVE_SESSIONS,
		async (
			_event: IpcMainInvokeEvent,
			args: { runtimeId: AgentRuntimeId | CustomAgentRuntimeId },
		) => {
			try {
				const rt = getAgentRuntimeRegistry().tryGet(args.runtimeId);
				if (!rt || !rt.listNativeSessions) {
					return {
						success: false,
						error: "runtime does not support native sessions",
					};
				}
				const list = await rt.listNativeSessions();
				return { success: true, data: list };
			} catch (err) {
				return {
					success: false,
					error:
						err instanceof Error ? err.message : "listNativeSessions failed",
				};
			}
		},
	);

	// agent:fork-native-session
	ipcMain.handle(
		AGENT_RUNTIME_CHANNELS.FORK_NATIVE_SESSION,
		async (
			_event: IpcMainInvokeEvent,
			args: {
				runtimeId: AgentRuntimeId | CustomAgentRuntimeId;
				sessionId: string;
				atMessageId?: string;
			},
		) => {
			try {
				const rt = getAgentRuntimeRegistry().tryGet(args.runtimeId);
				if (!rt || !rt.forkNativeSession) {
					return {
						success: false,
						error: "runtime does not support fork",
					};
				}
				const newId = await rt.forkNativeSession(
					args.sessionId,
					args.atMessageId,
				);
				return { success: true, data: { sessionId: newId } };
			} catch (err) {
				return {
					success: false,
					error:
						err instanceof Error ? err.message : "forkNativeSession failed",
				};
			}
		},
	);
}
