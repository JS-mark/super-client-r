/**
 * 处理插件 window API 的 IPC 消息
 * 监听 plugin:showMessage / plugin:showInputBox / plugin:showQuickPick
 * 使用 Ant Design Modal 显示对话框并返回结果
 */

import { Input, Modal, Radio, Space } from "antd";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

/**
 * 向主进程回复插件对话框结果
 */
function respondToPlugin(responseChannel: string, result: unknown): void {
	window.electron.ipc.invoke(responseChannel, result);
}

export function PluginWindowHandler() {
	const { t } = useTranslation();
	const inputRef = useRef<string>("");

	useEffect(() => {
		const titleMap: Record<string, string> = {
			error: t("error", { ns: "common" }),
			warning: t("warning", { ns: "common" }),
			info: t("info", { ns: "common" }),
		};
		const okText = t("confirm", { ns: "common" });
		const cancelText = t("cancel", { ns: "common" });

		// 消息对话框 (info / warning / error)
		const unsubMessage = window.electron.plugin.onShowMessage((data) => {
			const { type, message: msg, items, responseChannel } = data;
			const modalMethod =
				type === "error"
					? Modal.error
					: type === "warning"
						? Modal.warning
						: Modal.info;

			if (items && items.length > 0) {
				// 带按钮选项的消息
				Modal.confirm({
					title: titleMap[type] || titleMap.info,
					content: msg,
					okText: items[0],
					cancelText: items.length > 1 ? items[1] : cancelText,
					onOk: () => respondToPlugin(responseChannel, items[0]),
					onCancel: () =>
						respondToPlugin(
							responseChannel,
							items.length > 1 ? items[1] : undefined,
						),
				});
			} else {
				modalMethod({
					title: titleMap[type] || titleMap.info,
					content: msg,
					onOk: () => respondToPlugin(responseChannel, undefined),
				});
			}
		});

		// 输入对话框
		const unsubInputBox = window.electron.plugin.onShowInputBox((data) => {
			const { options, responseChannel } = data;
			const opts = (options || {}) as {
				prompt?: string;
				placeHolder?: string;
				value?: string;
			};
			inputRef.current = opts.value || "";

			Modal.confirm({
				title: opts.prompt || t("input", { ns: "common" }),
				content: (
					<Input
						placeholder={opts.placeHolder}
						defaultValue={opts.value}
						onChange={(e) => {
							inputRef.current = e.target.value;
						}}
						autoFocus
					/>
				),
				okText,
				cancelText,
				onOk: () => respondToPlugin(responseChannel, inputRef.current),
				onCancel: () => respondToPlugin(responseChannel, undefined),
			});
		});

		// 选择对话框
		const unsubQuickPick = window.electron.plugin.onShowQuickPick((data) => {
			const { items, options, responseChannel } = data;
			const opts = (options || {}) as { placeHolder?: string };
			let selectedItem: unknown = items[0];

			Modal.confirm({
				title: opts.placeHolder || t("select", { ns: "common" }),
				content: (
					<Radio.Group
						defaultValue={0}
						onChange={(e) => {
							selectedItem = items[e.target.value as number];
						}}
					>
						<Space direction="vertical">
							{(items as Array<{ label: string; description?: string }>).map(
								(item, idx) => (
									<Radio key={idx} value={idx}>
										{item.label}
										{item.description && (
											<span
												style={{
													marginLeft: 8,
													opacity: 0.6,
													fontSize: 12,
												}}
											>
												{item.description}
											</span>
										)}
									</Radio>
								),
							)}
						</Space>
					</Radio.Group>
				),
				okText,
				cancelText,
				onOk: () => respondToPlugin(responseChannel, selectedItem),
				onCancel: () => respondToPlugin(responseChannel, undefined),
			});
		});

		return () => {
			unsubMessage();
			unsubInputBox();
			unsubQuickPick();
		};
	}, [t]);

	return null;
}
