import { DownOutlined } from "@ant-design/icons";
import { Tooltip } from "antd";

export interface ModelPillProps {
	/** Display label, typically `${provider.name} · ${model.name}` 或 `model.name`。 */
	label: string | null | undefined;
	/** 点击触发；调用方通常 dispatch `chat:open-model-switcher` window event。 */
	onClick: () => void;
	/** Tooltip 文案；默认显示完整 label */
	tooltip?: string;
}

/**
 * 模型切换胶囊。点击触发外部 onClick（打开 ChatModelPicker）。
 * 使用 right-side composer footer，与 ApprovalModePill / ChatToolsMenu 视觉一致。
 *
 * 截断策略：完全交给 CSS。inner `<span>` 用 `min-width: 0` 让 flex 子项可
 * 以收缩到比内容更窄，再加 `text-overflow: ellipsis` —— 这样超出 `.composer-pill`
 * 的 `max-width` 时会真正显示 `…`，而不是被 button 的 `overflow: hidden`
 * 静默裁掉。完整名字始终通过 Tooltip 暴露。
 */
export function ModelPill({ label, onClick, tooltip }: ModelPillProps) {
	const display = label || "选择模型";

	return (
		<Tooltip title={tooltip ?? label ?? "选择模型"}>
			<button type="button" onClick={onClick} className="composer-pill">
				<span className="composer-pill-text">{display}</span>
				<DownOutlined className="composer-pill-caret" />
			</button>
		</Tooltip>
	);
}
