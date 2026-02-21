/**
 * Shared types for built-in plugins
 */

export interface BuiltinMarketPlugin {
	id: string;
	name: string;
	displayName: string;
	description: string;
	version: string;
	author: string;
	icon?: string;
	categories: string[];
	downloads: number;
	rating: number;
	installed?: boolean;
}

export interface BuiltinPluginSource {
	manifest: Record<string, unknown>;
	source: string;
	extraFiles?: Record<string, string>;
}
