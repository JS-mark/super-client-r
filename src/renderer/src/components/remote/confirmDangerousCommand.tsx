import { Modal } from "antd";
import type { DangerousCommandMatch } from "./dangerousCommands";

/**
 * 弹出危险命令二次确认对话框。
 *
 * 从 DeviceTerminal 的输入处理逻辑中抽出的纯 UI 单元：仅负责渲染确认弹窗
 * 并在用户确认 / 取消时回调，不持有任何终端状态。行为与原内联实现等价。
 */
export function confirmDangerousCommand(options: {
	command: string;
	danger: DangerousCommandMatch;
	onConfirm: () => void;
	onCancel: () => void;
}): void {
	const { command, danger, onConfirm, onCancel } = options;
	Modal.confirm({
		title: "⚠️ 危险命令确认",
		content: (
			<div>
				<p style={{ marginBottom: 8 }}>将要执行以下命令：</p>
				<pre
					style={{
						background: "#1e1e2e",
						color: "#cdd6f4",
						padding: "8px 12px",
						borderRadius: 6,
						fontFamily: "monospace",
						fontSize: 13,
					}}
				>
					{command}
				</pre>
				<p
					style={{
						marginTop: 8,
						color: danger.level === "danger" ? "#f38ba8" : "#f9e2af",
						fontWeight: 500,
					}}
				>
					{`⚠ ${danger.category}: ${danger.description}`}
				</p>
			</div>
		),
		okText: "确认执行",
		cancelText: "取消",
		okButtonProps: { danger: true },
		onOk: onConfirm,
		onCancel,
	});
}
