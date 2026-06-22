import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * §22 回滚开关：在不删代码、不污染 storage 的前提下禁用本期新增能力。
 * 关闭任一项后下次刷新即生效；ApprovalGrantStore / 持久化会话记录均不受影响。
 */
export interface FeatureFlags {
	/** Compatibility only: Extensions route has been removed; marketplace pages stay separate. */
	unifiedNavigation: boolean;
	/** false: LLM 与 Agent SDK 路径下不再写入 RuntimePolicyService audit log。 */
	runtimeEnforcement: boolean;
	/** false: 隐藏 FileArtifactCard / ChangedFilesSummary / 环境检查器；底层 capture 照旧。 */
	fileArtifacts: boolean;
	/** false: MainLayout 始终渲染 AppSidebar，忽略 interactionProfile。 */
	profileLayouts: boolean;
}

interface FeatureFlagsState extends FeatureFlags {
	setFlag: <K extends keyof FeatureFlags>(
		key: K,
		value: FeatureFlags[K],
	) => void;
	reset: () => void;
}

const DEFAULTS: FeatureFlags = {
	unifiedNavigation: false,
	runtimeEnforcement: true,
	fileArtifacts: true,
	profileLayouts: true,
};

export const useFeatureFlagsStore = create<FeatureFlagsState>()(
	persist(
		(set) => ({
			...DEFAULTS,
			setFlag: (key, value) =>
				set({ [key]: value } as Partial<FeatureFlagsState>),
			reset: () => set({ ...DEFAULTS }),
		}),
		{
			name: "feature-flags",
			partialize: (state) => ({
				unifiedNavigation: state.unifiedNavigation,
				runtimeEnforcement: state.runtimeEnforcement,
				fileArtifacts: state.fileArtifacts,
				profileLayouts: state.profileLayouts,
			}),
		},
	),
);

/** 仅返回 4 个布尔位的纯快照，方便推送到 main。 */
export function getFeatureFlagsSnapshot(): FeatureFlags {
	const s = useFeatureFlagsStore.getState();
	return {
		unifiedNavigation: s.unifiedNavigation,
		runtimeEnforcement: s.runtimeEnforcement,
		fileArtifacts: s.fileArtifacts,
		profileLayouts: s.profileLayouts,
	};
}
