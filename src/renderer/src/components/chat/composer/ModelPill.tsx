import { DownOutlined } from "@ant-design/icons";
import { Tooltip } from "antd";
import { useState } from "react";

export interface ModelPillProps {
  /** Display label, typically `${provider.name} · ${model.name}` 或 `model.name`。 */
  label: string | null | undefined;
  /** 点击触发；调用方通常 dispatch `chat:open-model-switcher` window event。 */
  onClick: () => void;
  /** 最长显示字符数，超过则 ellipsis。默认 28。 */
  maxLength?: number;
  /** Tooltip 文案；默认显示完整 label */
  tooltip?: string;
}

/**
 * 模型切换胶囊。点击触发外部 onClick（通常打开 ModelSwitcherModal）。
 * 使用 right-side composer footer，与 ChatModePill / ApprovalModePill 视觉一致。
 */
export function ModelPill({
  label,
  onClick,
  maxLength = 28,
  tooltip,
}: ModelPillProps) {
  const [hover, setHover] = useState(false);

  const display = !label ? "选择模型" : label.length > maxLength ? `${label.slice(0, maxLength)}…` : label;

  return (
    <Tooltip title={tooltip ?? label ?? "选择模型"}>
      <button
        type="button"
        onClick={onClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
        style={{
          background: hover ? "rgba(0,0,0,0.06)" : "transparent",
          border: "none",
          cursor: "pointer",
          maxWidth: 240,
          overflow: "hidden",
          whiteSpace: "nowrap",
          color: "inherit",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{display}</span>
        <DownOutlined style={{ fontSize: 10, opacity: 0.7 }} />
      </button>
    </Tooltip>
  );
}
