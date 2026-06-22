/**
 * AgentRuntime 子系统启动接线
 *
 * 在 main app `ready` 后调用一次：
 *   1. 实例化 AgentTraceCollector（含可选 persister）
 *   2. 实例化 AgentRuntimeRegistry
 *   3. 把 ClaudeSdkRuntime 包装现 `agentSDKService` 并注册
 *
 * Phase 1.5b 起：
 *   - 接入 HostToolDispatcher（dispatcher: new HostToolDispatcher({...})）
 *
 * Phase 4：
 *   - 注册 CodexRuntime / OpenAIAgentsRuntime
 */

import { app } from "electron";
import { join } from "node:path";
import { agentSDKService } from "../AgentSDKService";
import {
	AgentTraceCollector,
	setAgentTraceCollector,
} from "../trace/AgentTraceCollector";
import { AgentTracePersister } from "../trace/AgentTracePersister";
import {
	AgentRuntimeRegistry,
	setAgentRuntimeRegistry,
} from "./AgentRuntimeRegistry";
import { AgentSdkTraceSniffer } from "./AgentSdkTraceSniffer";
import { ClaudeSdkRuntime } from "./ClaudeSdkRuntime";

const IS_DEV = process.env.NODE_ENV === "development";

export interface AgentRuntimeBootstrapResult {
	registry: AgentRuntimeRegistry;
	collector: AgentTraceCollector;
	sniffer: AgentSdkTraceSniffer;
}

let booted: AgentRuntimeBootstrapResult | null = null;

export function bootstrapAgentRuntime(): AgentRuntimeBootstrapResult {
	if (booted) return booted;

	// 1) Trace collector with optional jsonl persister.
	//    spec §17.7: dev 默认 persist=true；prod 默认 persist=false（仅 ring buffer）
	const baseDir = join(app.getPath("userData"), "agent-traces");
	const persister = new AgentTracePersister({
		baseDir,
		retentionDays: 7,
	});
	void persister.init().catch((err) => {
		console.warn("[AgentTracePersister] init failed:", err);
	});
	const collector = new AgentTraceCollector({
		config: {
			persist: IS_DEV,
			redactionMode: "loose",
		},
		persister,
	});
	setAgentTraceCollector(collector);

	// 2) Registry
	const registry = new AgentRuntimeRegistry();
	registry.setLogger((msg) => console.warn("[AgentRuntimeRegistry]", msg));

	// 3) ClaudeSdkRuntime —— Phase 1.5a 不传 dispatcher
	registry.register(
		new ClaudeSdkRuntime({
			inner: agentSDKService,
			// dispatcher: undefined  → Phase 1.5b 接入
		}),
	);

	setAgentRuntimeRegistry(registry);

	// 4) Sniffer: 旁路 agent-sdk:* 旧路径让 trace 页能立刻看到流量。
	//    Phase 1.8 之后 useChat 切到 broker，sniffer 可下线。
	const sniffer = new AgentSdkTraceSniffer(agentSDKService, collector);
	sniffer.start();

	booted = { registry, collector, sniffer };
	return booted;
}

export async function disposeAgentRuntime(): Promise<void> {
	if (!booted) return;
	booted.sniffer.stop();
	await booted.registry.disposeAll();
	await booted.collector.dispose();
	booted = null;
	setAgentRuntimeRegistry(null);
	setAgentTraceCollector(null);
}
