/**
 * Extensions service (§20)
 *
 * 渲染端访问统一只读视图的轻量包装。
 */

import type { ExtensionDescriptor } from "@super-client/shared-types/extensions";
import type { IPCResponse } from "../types/electron";

export const extensionsService = {
	/** 拉取所有扩展（MCP / Skills / App Plugins）的只读描述符。 */
	async list(): Promise<ExtensionDescriptor[]> {
		const response = (await window.electron.extensions.list()) as IPCResponse<
			ExtensionDescriptor[]
		>;
		if (!response.success || !response.data) {
			throw new Error(response.error ?? "Failed to load extensions");
		}
		return response.data;
	},
};
