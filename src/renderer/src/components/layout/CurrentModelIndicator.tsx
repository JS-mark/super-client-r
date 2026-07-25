import { Tooltip, theme } from "antd";
import { useTranslation } from "react-i18next";
import { useModelStore } from "../../stores/modelStore";

const { useToken } = theme;

/**
 * 只读的「当前模型」指示位——用于非 Chat 页面的 TitleBar 右侧。
 *
 * 产品决策：模型切换只在 Chat 输入区上方（ComposerStatusBar / ModelPill）进行；
 * Win TitleBar 右侧空间紧、易被窗口控制按钮截断，所以非 Chat 页这里**只展示**
 * 全局默认模型（`modelStore.activeSelection`），不可点击、不承载切换交互。
 *
 * 当没有已选模型（或所选 provider/model 已被删除）时渲染 null，保持标题栏干净。
 */
export function CurrentModelIndicator() {
	const { t } = useTranslation();
	const { token } = useToken();
	const providers = useModelStore((s) => s.providers);
	const activeSelection = useModelStore((s) => s.activeSelection);

	if (!activeSelection) return null;
	const provider = providers.find((p) => p.id === activeSelection.providerId);
	if (!provider) return null;
	const model = provider.models.find((m) => m.id === activeSelection.modelId);
	if (!model) return null;

	const modelLabel = model.name || model.id;
	const full = `${provider.name} · ${modelLabel}`;

	return (
		<Tooltip
			title={t("currentModelReadonly", { ns: "app", model: full })}
			placement="bottomRight"
		>
			<span
				className="flex items-center text-xs px-2 h-6 rounded max-w-[180px] truncate"
				style={{
					color: token.colorTextSecondary,
					background: token.colorFillQuaternary,
				}}
				aria-label={t("currentModelReadonly", { ns: "app", model: full })}
			>
				{modelLabel}
			</span>
		</Tooltip>
	);
}
