/**
 * Built-in plugin aggregator
 * Re-exports all built-in plugin definitions
 */
import type { BuiltinPluginSource } from "./types";
export type { BuiltinMarketPlugin, BuiltinPluginSource } from "./types";

import * as promptTemplates from "./prompt-templates";
import * as builtinThemes from "./builtin-themes";
import * as markdownThemes from "./markdown-themes";

export const BUILTIN_PLUGIN_SOURCES: Record<string, BuiltinPluginSource> = {
	"prompt-templates": {
		manifest: promptTemplates.manifest,
		source: promptTemplates.source,
	},
	"builtin-themes": {
		manifest: builtinThemes.manifest,
		source: builtinThemes.source,
		extraFiles: builtinThemes.extraFiles,
	},
	"markdown-themes": {
		manifest: markdownThemes.manifest,
		source: markdownThemes.source,
		extraFiles: markdownThemes.extraFiles,
	},
};

export const BUILTIN_MARKET_PLUGINS = [
	promptTemplates.marketInfo,
	builtinThemes.marketInfo,
	markdownThemes.marketInfo,
];
