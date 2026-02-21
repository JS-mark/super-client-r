/**
 * 插件权限管理服务
 * 管理插件的权限授予、撤销和检查
 */

import { storeManager } from "../../store/StoreManager";
import type { PluginPermission } from "./types";

const STORAGE_KEY = "pluginPermissions";

export class PermissionService {
	private permissions = new Map<string, Set<PluginPermission>>();

	constructor() {
		this.loadFromStorage();
	}

	/**
	 * 从持久化存储加载权限数据
	 */
	private loadFromStorage(): void {
		try {
			const stored = storeManager.getConfig(STORAGE_KEY) as
				| Record<string, PluginPermission[]>
				| undefined;
			if (stored) {
				for (const [pluginId, perms] of Object.entries(stored)) {
					this.permissions.set(pluginId, new Set(perms));
				}
			}
		} catch (error) {
			console.error(
				"[PermissionService] Failed to load permissions from storage:",
				error,
			);
		}
	}

	/**
	 * 持久化权限数据到存储
	 */
	private saveToStorage(): void {
		const data: Record<string, PluginPermission[]> = {};
		for (const [pluginId, perms] of this.permissions) {
			data[pluginId] = Array.from(perms);
		}
		storeManager.setConfig(STORAGE_KEY, data);
	}

	/**
	 * 检查插件是否拥有指定权限
	 */
	hasPermission(pluginId: string, permission: PluginPermission): boolean {
		return this.permissions.get(pluginId)?.has(permission) ?? false;
	}

	/**
	 * 授予插件一组权限
	 */
	grantPermissions(
		pluginId: string,
		permissions: PluginPermission[],
	): void {
		let perms = this.permissions.get(pluginId);
		if (!perms) {
			perms = new Set();
			this.permissions.set(pluginId, perms);
		}
		for (const p of permissions) {
			perms.add(p);
		}
		this.saveToStorage();
	}

	/**
	 * 撤销插件的所有权限
	 */
	revokeAll(pluginId: string): void {
		this.permissions.delete(pluginId);
		this.saveToStorage();
	}

	/**
	 * 获取插件已授予的权限列表
	 */
	getPermissions(pluginId: string): PluginPermission[] {
		return Array.from(this.permissions.get(pluginId) ?? []);
	}

	/**
	 * 为内置插件自动授予所有声明的权限
	 */
	autoGrantBuiltin(
		pluginId: string,
		declaredPermissions: PluginPermission[],
	): void {
		this.grantPermissions(pluginId, declaredPermissions);
	}
}
