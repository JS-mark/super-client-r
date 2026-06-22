import type { FeatureFlags } from "../stores/featureFlagsStore";

/**
 * §22 rollback flags 客户端代理：renderer 是真正的源，
 * main 仅缓存 runtimeEnforcement 一位用于 audit gating。
 */
export const featureFlagsService = {
	push: (flags: FeatureFlags) => window.electron.featureFlags.set(flags),
	getMain: () => window.electron.featureFlags.get(),
};
