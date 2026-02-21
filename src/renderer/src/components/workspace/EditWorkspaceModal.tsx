import { Form, Input, Modal, Radio } from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/utils";
import { WORKSPACE_COLORS, type Workspace } from "../../stores/workspaceStore";
import { WORKSPACE_TYPE_OPTIONS } from "./WorkspaceCard";

export function EditWorkspaceModal({
	workspace,
	open,
	onClose,
	onSave,
}: {
	workspace: Workspace | null;
	open: boolean;
	onClose: () => void;
	onSave: (data: Partial<Workspace>) => void;
}) {
	const { t } = useTranslation();
	const [form] = Form.useForm();
	const [color, setColor] = useState(workspace?.color || WORKSPACE_COLORS[0]);

	// Reset form when workspace changes
	useState(() => {
		if (workspace) {
			form.setFieldsValue({
				name: workspace.name,
				description: workspace.description,
				type: workspace.type,
			});
			setColor(workspace.color || WORKSPACE_COLORS[0]);
		}
	});

	const handleSubmit = () => {
		form.validateFields().then((values) => {
			onSave({ ...values, color });
			onClose();
		});
	};

	if (!workspace) return null;

	return (
		<Modal
			title={t("workspaces.edit.title", "编辑工作区", { ns: "workspaces" })}
			open={open}
			onOk={handleSubmit}
			onCancel={onClose}
			okText={t("common.save", "保存")}
			cancelText={t("cancel", "取消", { ns: "common" })}
		>
			<Form form={form} layout="vertical" className="mt-4">
				<Form.Item
					name="name"
					label={t("workspaces.name", "名称", { ns: "workspaces" })}
					rules={[{ required: true, message: "请输入工作区名称" }]}
				>
					<Input />
				</Form.Item>

				<Form.Item
					name="description"
					label={t("workspaces.description", "描述", { ns: "workspaces" })}
				>
					<Input.TextArea rows={3} />
				</Form.Item>

				<Form.Item name="type" label={t("type.label", { ns: "workspaces" })}>
					<Radio.Group>
						<div className="grid grid-cols-2 gap-2">
							{WORKSPACE_TYPE_OPTIONS.map((type) => (
								<Radio.Button
									key={type.value}
									value={type.value}
									className="!h-auto"
								>
									<div className="flex items-center gap-2 py-1">
										<span>{type.icon}</span>
										<span>{t(type.label, { ns: "workspaces" })}</span>
									</div>
								</Radio.Button>
							))}
						</div>
					</Radio.Group>
				</Form.Item>

				<Form.Item label={t("workspaces.color", "颜色", { ns: "workspaces" })}>
					<div className="flex flex-wrap gap-2">
						{WORKSPACE_COLORS.map((c) => (
							<button
								key={c}
								type="button"
								onClick={() => setColor(c)}
								className={cn(
									"w-8 h-8 rounded-lg transition-all",
									color === c
										? "ring-2 ring-offset-2 ring-slate-400 scale-110"
										: "hover:scale-105",
								)}
								style={{ backgroundColor: c }}
							/>
						))}
					</div>
				</Form.Item>
			</Form>
		</Modal>
	);
}
