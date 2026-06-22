/**
 * ExtensionDescriptorService（§20）
 *
 * 聚合 MCP / Skills / App Plugins，向 UI 暴露统一的只读 ExtensionDescriptor 列表。
 * 描述符仅作为 UI 投影；实际管理仍由原服务负责。
 */

import type {
	ExtensionDescriptor,
	ExtensionHealth,
	ExtensionSource,
} from "@super-client/shared-types/extensions";
import { mcpService } from "../mcp/McpService";
import type {
	McpServerConfig,
	McpServerStatus,
	SkillManifest,
} from "../../ipc/types";
import { getPluginManager } from "../plugin/PluginManager";
import type { PluginInfo, PluginState } from "../plugin/types";
import { getSkillService } from "../skill/SkillService";
import { logger } from "../../utils/logger";

const log = logger.withContext("ExtensionDescriptors");

function mapMcpHealth(status: McpServerStatus | undefined): ExtensionHealth {
	switch (status?.status) {
		case "connected":
			return "active";
		case "connecting":
			return "unknown";
		case "disconnected":
			return "inactive";
		case "error":
			return "error";
		default:
			return "unknown";
	}
}

function mcpDescriptor(
	config: McpServerConfig,
	status: McpServerStatus | undefined,
): ExtensionDescriptor {
	const source: ExtensionSource =
		config.type === "internal" ? "internal" : "third-party";
	const tools = status?.tools ?? [];
	const contributionPoints: string[] = [];
	if (tools.length > 0) contributionPoints.push("agent-tools");
	const enabled = config.enabled ?? status?.status === "connected";

	return {
		id: `mcp:${config.id}`,
		type: "mcp",
		source,
		scope: "global",
		name: config.name || config.id,
		description: config.description ?? "",
		enabled,
		health: mapMcpHealth(status),
		permissions: [],
		contributionPoints,
		backingRef: { service: "mcp", id: config.id },
	};
}

function skillDescriptor(manifest: SkillManifest): ExtensionDescriptor {
	const contributionPoints: string[] = [];
	if (manifest.tools && manifest.tools.length > 0) {
		contributionPoints.push("skill-tools");
	}
	if (manifest.commands && manifest.commands.length > 0) {
		contributionPoints.push("slash-commands");
	}
	// SkillService.listSkills() 仅返回 enabled 的清单，且未暴露安装路径，
	// 因此这里默认 "market"。如果未来扩展了来源识别，可在此区分 builtin。
	const source: ExtensionSource = "market";

	return {
		id: `skill:${manifest.id}`,
		type: "skill",
		source,
		scope: "global",
		name: manifest.name || manifest.id,
		description: manifest.description ?? "",
		enabled: true,
		health: "active",
		permissions: manifest.permissions ?? [],
		contributionPoints,
		backingRef: { service: "skill", id: manifest.id },
	};
}

function mapPluginHealth(state: PluginState): ExtensionHealth {
	switch (state) {
		case "active":
			return "active";
		case "installed":
		case "inactive":
			return "inactive";
		case "error":
			return "error";
		default:
			return "unknown";
	}
}

function pluginDescriptor(plugin: PluginInfo): ExtensionDescriptor {
	const manifest = plugin.manifest;
	const contributes = manifest.contributes ?? {};
	const contributionPoints: string[] = [];
	if (contributes.commands && contributes.commands.length > 0) {
		contributionPoints.push("commands");
	}
	if (contributes.themes && contributes.themes.length > 0) {
		contributionPoints.push("themes");
	}
	if (contributes.keybindings && contributes.keybindings.length > 0) {
		contributionPoints.push("keybindings");
	}
	if (contributes.views && Object.keys(contributes.views).length > 0) {
		contributionPoints.push("views");
	}
	if (
		contributes.viewsContainers &&
		Object.keys(contributes.viewsContainers).length > 0
	) {
		contributionPoints.push("views-containers");
	}
	// 表示插件向 Agent 注入工具的能力（基于权限声明，§14）
	if (manifest.permissions?.includes("mcp.tools")) {
		contributionPoints.push("agent-tools");
	}
	if (manifest.permissions?.includes("chat.hooks")) {
		contributionPoints.push("chat-hooks");
	}

	const source: ExtensionSource = plugin.isBuiltin ? "builtin" : "plugin";

	return {
		id: `plugin:${plugin.id}`,
		type: "app-plugin",
		source,
		scope: "global",
		name: manifest.displayName || manifest.name || plugin.id,
		description: manifest.description ?? "",
		enabled: plugin.enabled,
		health: mapPluginHealth(plugin.state),
		permissions: manifest.permissions ?? [],
		contributionPoints,
		backingRef: { service: "plugin", id: plugin.id },
	};
}

export class ExtensionDescriptorService {
	/** 聚合 MCP / Skill / Plugin 当前状态。任意来源失败时降级跳过。 */
	list(): ExtensionDescriptor[] {
		const descriptors: ExtensionDescriptor[] = [];

		try {
			for (const config of mcpService.listServers()) {
				const status = mcpService.getServerStatus(config.id);
				descriptors.push(mcpDescriptor(config, status));
			}
		} catch (error) {
			log.error(
				"Failed to collect MCP descriptors",
				error instanceof Error ? error : new Error(String(error)),
			);
		}

		try {
			const skillService = getSkillService();
			// SkillConfig map 私有：listSkills() 仅返回 enabled 的清单。
			// §20 描述符是 UI 投影，仅暴露当前可见的 skill 即可。
			for (const manifest of skillService.listSkills()) {
				descriptors.push(skillDescriptor(manifest));
			}
		} catch (error) {
			log.error(
				"Failed to collect Skill descriptors",
				error instanceof Error ? error : new Error(String(error)),
			);
		}

		try {
			for (const plugin of getPluginManager().getAllPlugins()) {
				descriptors.push(pluginDescriptor(plugin));
			}
		} catch (error) {
			log.error(
				"Failed to collect Plugin descriptors",
				error instanceof Error ? error : new Error(String(error)),
			);
		}

		return descriptors;
	}
}

let instance: ExtensionDescriptorService | null = null;

export function getExtensionDescriptorService(): ExtensionDescriptorService {
	if (!instance) {
		instance = new ExtensionDescriptorService();
	}
	return instance;
}
