import { BulbOutlined } from "@ant-design/icons";
import { Empty, List, Spin, Tag, theme } from "antd";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { pluginService } from "../../../services/pluginService";

const { useToken } = theme;

interface PromptTemplate {
	id: string;
	name: string;
	description: string;
	template: string;
}

interface PromptTemplatePanelProps {
	onSelect: (template: PromptTemplate) => void;
	onClose: () => void;
}

export function PromptTemplatePanel({
	onSelect,
	onClose,
}: PromptTemplatePanelProps) {
	const { t } = useTranslation();
	const { token } = useToken();
	const [templates, setTemplates] = useState<PromptTemplate[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const result =
					await pluginService.executeCommand<PromptTemplate[]>(
						"prompt-templates.list",
					);
				if (!cancelled && Array.isArray(result)) {
					setTemplates(result);
				}
			} catch {
				// Plugin not installed or not activated
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const handleSelect = useCallback(
		(template: PromptTemplate) => {
			onSelect(template);
			onClose();
		},
		[onSelect, onClose],
	);

	return (
		<div
			style={{
				backgroundColor: token.colorBgElevated,
				border: `1px solid ${token.colorBorderSecondary}`,
				maxHeight: 320,
				overflow: "auto",
			}}
			className="rounded-lg"
		>
			<div className="px-3 py-2 flex items-center gap-2 border-b border-gray-100 dark:border-gray-700">
				<BulbOutlined style={{ color: token.colorPrimary }} />
				<span className="text-sm font-medium">
					{t("toolbar.promptTitle", "Prompt Templates", { ns: "chat" })}
				</span>
				<Tag color="blue" className="ml-auto">
					{templates.length}
				</Tag>
			</div>

			{loading ? (
				<div className="flex justify-center py-8">
					<Spin size="small" />
				</div>
			) : templates.length === 0 ? (
				<Empty
					image={Empty.PRESENTED_IMAGE_SIMPLE}
					description={t(
						"toolbar.noTemplates",
						"No templates available. Install the Prompt Templates plugin.",
						{ ns: "chat" },
					)}
					className="py-6"
				/>
			) : (
				<List
					dataSource={templates}
					split={false}
					renderItem={(template) => (
						<List.Item
							className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 px-3! py-2!"
							onClick={() => handleSelect(template)}
						>
							<List.Item.Meta
								title={
									<span className="text-sm">{template.name}</span>
								}
								description={
									<span className="text-xs text-gray-500">
										{template.description}
									</span>
								}
							/>
						</List.Item>
					)}
				/>
			)}
		</div>
	);
}

export type { PromptTemplate };
