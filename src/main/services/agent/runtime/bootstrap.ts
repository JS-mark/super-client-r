/**
 * AgentRuntime 子系统启动接线
 *
 * 在 main app `ready` 后调用一次：
 *   1. 实例化 AgentTraceCollector（含可选 persister）
 *   2. 实例化 AgentRuntimeRegistry
 *   3. 注册 ClaudeCodeAgentRuntime（"llm-loop"，built on unified LLMService）
 *
 * Codex / OpenAIAgents 等其它 runtime 可在后续阶段注册。
 */

import { app } from "electron";
import { join } from "node:path";
import {
	AgentTraceCollector,
	setAgentTraceCollector,
} from "../trace/AgentTraceCollector";
import { AgentTracePersister } from "../trace/AgentTracePersister";
import {
	AgentRuntimeRegistry,
	setAgentRuntimeRegistry,
} from "./AgentRuntimeRegistry";
import { ClaudeCodeAgentRuntime } from "./ClaudeCodeAgentRuntime";

const IS_DEV = process.env.NODE_ENV === "development";

export interface AgentRuntimeBootstrapResult {
	registry: AgentRuntimeRegistry;
	collector: AgentTraceCollector;
}

let booted: AgentRuntimeBootstrapResult | null = null;

export function bootstrapAgentRuntime(): AgentRuntimeBootstrapResult {
	if (booted) return booted;

	// 1) Trace collector with optional jsonl persister.
	const userDataDir = app.getPath("userData");
	const baseDir = join(userDataDir, "agent-traces");
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
		redactionContext: {
			homeDir: app.getPath("home"),
			appUserDataDir: userDataDir,
		},
	});
	setAgentTraceCollector(collector);

	// 2) Registry
	const registry = new AgentRuntimeRegistry();
	registry.setLogger((msg) => console.warn("[AgentRuntimeRegistry]", msg));

	// 3) ClaudeCodeAgentRuntime ("llm-loop") — the sole production runtime.
	//    Built on the unified LLMService.chatCompletion path so any model
	//    with native function calling (Qwen / DeepSeek / GPT / Claude /
	//    Gemini / etc.) gets Claude-Code-style agent experience.
	registry.register(new ClaudeCodeAgentRuntime());

	setAgentRuntimeRegistry(registry);

	booted = { registry, collector };
	return booted;
}

export async function disposeAgentRuntime(): Promise<void> {
	if (!booted) return;
	await booted.registry.disposeAll();
	await booted.collector.dispose();
	booted = null;
	setAgentRuntimeRegistry(null);
	setAgentTraceCollector(null);
}
