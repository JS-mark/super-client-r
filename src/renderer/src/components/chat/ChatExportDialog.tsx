import { useState } from "react";
import { Modal, Radio, Input, Button, message } from "antd";
import { FileTextOutlined, CodeOutlined, FileMarkdownOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useMessageStore, type ExportFormat } from "../../stores/messageStore";
import type { Message } from "../../stores/chatStore";

interface ChatExportDialogProps {
	messages: Message[];
	isOpen: boolean;
	onClose: () => void;
}

export function ChatExportDialog({
	messages,
	isOpen,
	onClose,
}: ChatExportDialogProps) {
	const { t } = useTranslation();
	const [format, setFormat] = useState<ExportFormat>("markdown");
	const [filename, setFilename] = useState("");
	const [isExporting, setIsExporting] = useState(false);

	const { exportMessages } = useMessageStore();

	const handleExport = async () => {
		if (messages.length === 0) {
			message.warning(t("chat.noMessagesToExport", "没有可导出的消息", { ns: "chat" }));
			return;
		}

		setIsExporting(true);
		try {
			const exportedFilename = await exportMessages(messages, format, filename);
			message.success(
				t("chat.exportSuccess", "导出成功: {{filename}}", { filename: exportedFilename })
			);
			onClose();
		} catch (error) {
			message.error(t("chat.exportError", "导出失败: {{error}}", { error: String(error) }));
		} finally {
			setIsExporting(false);
		}
	};

	const formatOptions = [
		{
			value: "markdown" as ExportFormat,
			label: t("chat.exportFormat.markdown", "Markdown (.md)"),
			description: t("chat.exportFormat.markdownDesc", "适合阅读和编辑的格式", { ns: "chat" }),
			icon: <FileMarkdownOutlined className="text-2xl text-blue-500" />,
		},
		{
			value: "json" as ExportFormat,
			label: t("chat.exportFormat.json", "JSON (.json)"),
			description: t("chat.exportFormat.jsonDesc", "包含完整数据的结构化格式", { ns: "chat" }),
			icon: <CodeOutlined className="text-2xl text-green-500" />,
		},
		{
			value: "txt" as ExportFormat,
			label: t("chat.exportFormat.txt", "纯文本 (.txt)"),
			description: t("chat.exportFormat.txtDesc", "简洁的纯文本格式", { ns: "chat" }),
			icon: <FileTextOutlined className="text-2xl text-slate-500" />,
		},
	];

	return (
		<Modal
			title={t("chat.exportChat", "导出聊天记录", { ns: "chat" })}
			open={isOpen}
			onCancel={onClose}
			footer={[
				<Button key="cancel" onClick={onClose}>
					{t("cancel", "取消", { ns: "common" })}
				</Button>,
				<Button
					key="export"
					type="primary"
					onClick={handleExport}
					loading={isExporting}
					disabled={messages.length === 0}
				>
					{t("chat.export", "导出", { ns: "chat" })}
				</Button>,
			]}
			width={500}
		>
			<div className="space-y-6">
				{/* 格式选择 */}
				<div>
					<label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
						{t("chat.exportFormat", "导出格式", { ns: "chat" })}
					</label>
					<Radio.Group
						value={format}
						onChange={(e) => setFormat(e.target.value)}
						className="w-full"
					>
						<div className="space-y-3">
							{formatOptions.map((option) => (
								<div
									key={option.value}
									className={`flex items-center gap-4 p-4 rounded-lg border transition-colors cursor-pointer ${
										format === option.value
											? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
											: "border-slate-200 dark:border-slate-700 hover:border-blue-300"
									}`}
									onClick={() => setFormat(option.value)}
								>
									<Radio value={option.value} className="hidden">{option.label}</Radio>
									{option.icon}
									<div className="flex-1">
										<div className="font-medium">{option.label}</div>
										<div className="text-sm text-slate-500">{option.description}</div>
									</div>
									{format === option.value && (
										<div className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center">
											<svg
												className="w-3 h-3 text-white"
												fill="none"
												viewBox="0 0 24 24"
												stroke="currentColor"
											>
												<path
													strokeLinecap="round"
													strokeLinejoin="round"
													strokeWidth={2}
													d="M5 13l4 4L19 7"
												/>
											</svg>
										</div>
									)}
								</div>
							))}
						</div>
					</Radio.Group>
				</div>

				{/* 文件名 */}
				<div>
					<label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
						{t("chat.exportFilename", "文件名 (可选)", { ns: "chat" })}
					</label>
					<Input
						value={filename}
						onChange={(e) => setFilename(e.target.value)}
						placeholder={t("chat.exportFilenamePlaceholder", "留空使用默认文件名", { ns: "chat" })}
						suffix={`.${format === "markdown" ? "md" : format}`}
					/>
				</div>

				{/* 消息统计 */}
				<div className="text-sm text-slate-500">
					{t("chat.exportStats", "将导出 {{count}} 条消息", { count: messages.length })}
				</div>
			</div>
		</Modal>
	);
}
