import {
	CheckOutlined,
	CopyOutlined,
	DeleteOutlined,
	DownOutlined,
	ExportOutlined,
	PlusOutlined,
	SettingOutlined,
} from "@ant-design/icons";
import {
	Button,
	Dropdown,
	Form,
	Input,
	Modal,
	message,
	Radio,
	Tooltip,
} from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/utils";
import {
	useWorkspaceStore,
	WORKSPACE_COLORS,
	type Workspace,
	type WorkspaceType,
} from "../../stores/workspaceStore";

const WORKSPACE_TYPE_OPTIONS: {
	value: WorkspaceType;
	label: string;
	icon: string;
}[] = [
	{ value: "personal", label: "type.personal", icon: "🏠" },
	{ value: "work", label: "type.work", icon: "💼" },
	{ value: "project", label: "type.project", icon: "📁" },
	{ value: "temp", label: "type.temp", icon: "⏱️" },
];

interface WorkspaceFormData {
	name: string;
	description?: string;
	type: WorkspaceType;
	color: string;
	icon?: string;
}

// 工作区徽章组件
function WorkspaceBadge({
	workspace,
	size = "default",
	showName = true,
}: {
	workspace: Workspace;
	size?: "small" | "default";
	showName?: boolean;
}) {
	const { t } = useTranslation();
	const isSmall = size === "small";

	return (
		<div className="flex items-center gap-2">
			<div
				className={cn(
					"rounded-lg flex items-center justify-center font-medium text-white",
					isSmall ? "w-6 h-6 text-xs" : "w-8 h-8 text-sm",
				)}
				style={{ backgroundColor: workspace.color }}
			>
				{workspace.icon || workspace.name.charAt(0).toUpperCase()}
			</div>
			{showName && (
				<div className="flex flex-col">
					<span
						className={cn(
							"font-medium text-slate-800  truncate max-w-[120px]",
							isSmall && "text-xs",
						)}
					>
						{workspace.name}
					</span>
					{!isSmall && (
						<span className="text-xs text-slate-500 ">
							{t("sessionCount", {
								ns: "workspaces",
								count: workspace.sessionIds.length,
							})}
						</span>
					)}
				</div>
			)}
		</div>
	);
}

// 创建工作区弹窗
function CreateWorkspaceModal({
	open,
	onClose,
	onCreate,
}: {
	open: boolean;
	onClose: () => void;
	onCreate: (data: WorkspaceFormData) => void;
}) {
	const { t } = useTranslation();
	const [form] = Form.useForm();
	const [color, setColor] = useState(WORKSPACE_COLORS[0]);

	const handleSubmit = () => {
		form.validateFields().then((values) => {
			onCreate({ ...values, color });
			form.resetFields();
			setColor(WORKSPACE_COLORS[0]);
			onClose();
		});
	};

	return (
		<Modal
			title={t("workspaces.create.title", "创建工作区", { ns: "workspaces" })}
			open={open}
			onOk={handleSubmit}
			onCancel={onClose}
			okText={t("common.create", "创建")}
			cancelText={t("cancel", "取消", { ns: "common" })}
		>
			<Form form={form} layout="vertical" className="mt-4">
				<Form.Item
					name="name"
					label={t("workspaces.name", "名称", { ns: "workspaces" })}
					rules={[
						{
							required: true,
							message: t("nameRequired", { ns: "workspaces" }),
						},
					]}
				>
					<Input
						placeholder={t("workspaces.namePlaceholder", "我的工作区", {
							ns: "workspaces",
						})}
					/>
				</Form.Item>

				<Form.Item
					name="description"
					label={t("workspaces.description", "描述", { ns: "workspaces" })}
				>
					<Input.TextArea
						rows={2}
						placeholder={t(
							"workspaces.descriptionPlaceholder",
							"工作区描述...",
							{ ns: "workspaces" },
						)}
					/>
				</Form.Item>

				<Form.Item
					name="type"
					label={t("type.label", { ns: "workspaces" })}
					initialValue="personal"
				>
					<Radio.Group>
						<div className="grid grid-cols-2 gap-2">
							{WORKSPACE_TYPE_OPTIONS.map((type) => (
								<Radio.Button
									key={type.value}
									value={type.value}
									className="h-auto!"
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

// 主组件
export function WorkspaceSwitcher() {
	const { t } = useTranslation();
	const {
		workspaces,
		currentWorkspaceId,
		defaultWorkspaceId,
		switchWorkspace,
		createWorkspace,
		duplicateWorkspace,
		deleteWorkspace,
		exportWorkspace,
		getCurrentWorkspace,
	} = useWorkspaceStore();

	const [createModalOpen, setCreateModalOpen] = useState(false);
	const [dropdownOpen, setDropdownOpen] = useState(false);

	const currentWorkspace = getCurrentWorkspace();

	// 按order排序的工作区
	const sortedWorkspaces = [...workspaces].sort((a, b) => a.order - b.order);

	const handleCreate = (data: WorkspaceFormData) => {
		createWorkspace(data);
		message.success(
			t("workspaces.create.success", "工作区创建成功", { ns: "workspaces" }),
		);
		setDropdownOpen(false);
	};

	const handleDuplicate = (workspace: Workspace) => {
		duplicateWorkspace(workspace.id);
		message.success(
			t("workspaces.duplicate.success", "工作区已复制", { ns: "workspaces" }),
		);
	};

	const handleDelete = (workspace: Workspace) => {
		if (workspace.id === defaultWorkspaceId) {
			message.error(
				t("workspaces.delete.cannotDeleteDefault", "不能删除默认工作区"),
			);
			return;
		}

		Modal.confirm({
			title: t("workspaces.delete.confirmTitle", "删除工作区", {
				ns: "workspaces",
			}),
			content: t(
				"workspaces.delete.confirmContent",
				'确定要删除工作区 "{{name}}" 吗？此操作不可撤销。',
				{ name: workspace.name },
			),
			onOk: () => {
				const success = deleteWorkspace(workspace.id);
				if (success) {
					message.success(
						t("workspaces.delete.success", "工作区已删除", {
							ns: "workspaces",
						}),
					);
				}
			},
		});
	};
	const handleExport = (workspace: Workspace) => {
		try {
			const data = exportWorkspace(workspace.id);
			const blob = new Blob([JSON.stringify(data, null, 2)], {
				type: "application/json",
			});
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `workspace-${workspace.name}-${Date.now()}.json`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
			message.success(t("workspaces.export.success", "工作区已导出"));
		} catch {
			message.error(
				t("workspaces.export.error", "导出失败", { ns: "workspaces" }),
			);
		}
	};

	const menuItems = [
		{
			key: "header",
			label: (
				<div className="px-3 py-2 text-xs text-slate-500  border-b border-slate-200  mb-1">
					{t("workspaces.switch.title", "切换工作区", { ns: "workspaces" })}
				</div>
			),
			disabled: true,
		},
		...sortedWorkspaces.map((workspace) => ({
			key: workspace.id,
			label: (
				<div className="flex items-center justify-between w-full group">
					<button
						onClick={() => {
							switchWorkspace(workspace.id);
							setDropdownOpen(false);
						}}
						className="flex items-center gap-2 flex-1 text-left"
					>
						<WorkspaceBadge
							workspace={workspace}
							size="small"
							showName={false}
						/>
						<span className="text-sm text-slate-700 ">{workspace.name}</span>
						{workspace.id === currentWorkspaceId && (
							<CheckOutlined className="text-blue-500 text-xs ml-2" />
						)}
					</button>

					{/* 操作按钮 */}
					<div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
						<Tooltip
							title={t("workspaces.duplicate", "复制", { ns: "workspaces" })}
						>
							<button
								onClick={(e) => {
									e.stopPropagation();
									handleDuplicate(workspace);
								}}
								className="p-1 rounded hover:bg-slate-100  text-slate-400 hover:text-slate-600"
							>
								<CopyOutlined className="text-xs" />
							</button>
						</Tooltip>
						<Tooltip
							title={t("workspaces.export", "导出", { ns: "workspaces" })}
						>
							<button
								onClick={(e) => {
									e.stopPropagation();
									handleExport(workspace);
								}}
								className="p-1 rounded hover:bg-slate-100  text-slate-400 hover:text-slate-600"
							>
								<ExportOutlined className="text-xs" />
							</button>
						</Tooltip>
						{workspace.id !== defaultWorkspaceId && (
							<Tooltip title={t("delete", "删除", { ns: "common" })}>
								<button
									onClick={(e) => {
										e.stopPropagation();
										handleDelete(workspace);
									}}
									className="p-1 rounded hover:bg-slate-100  text-slate-400 hover:text-red-500"
								>
									<DeleteOutlined className="text-xs" />
								</button>
							</Tooltip>
						)}
					</div>
				</div>
			),
		})),
		{
			key: "divider",
			type: "divider" as const,
		},
		{
			key: "create",
			label: (
				<button
					onClick={() => {
						setCreateModalOpen(true);
						setDropdownOpen(false);
					}}
					className="flex items-center gap-2 text-blue-600  w-full text-left"
				>
					<PlusOutlined />
					<span>
						{t("workspaces.create.title", "创建工作区", { ns: "workspaces" })}
					</span>
				</button>
			),
		},
		{
			key: "manage",
			label: (
				<button
					onClick={() => {
						// Navigate to workspaces page
						window.location.hash = "/workspaces";
						setDropdownOpen(false);
					}}
					className="flex items-center gap-2 text-slate-600  w-full text-left"
				>
					<SettingOutlined />
					<span>
						{t("workspaces.manage", "管理工作区", { ns: "workspaces" })}
					</span>
				</button>
			),
		},
	];

	if (!currentWorkspace) return null;

	return (
		<>
			<Dropdown
				menu={{ items: menuItems }}
				open={dropdownOpen}
				onOpenChange={setDropdownOpen}
				placement="bottomLeft"
				trigger={["click"]}
				overlayClassName="workspace-switcher-dropdown"
			>
				<Button
					type="text"
					className="w-full h-auto py-2 px-3 flex items-center justify-between hover:bg-slate-100  rounded-xl"
				>
					<WorkspaceBadge workspace={currentWorkspace} />
					<DownOutlined className="text-slate-400 text-xs" />
				</Button>
			</Dropdown>

			<CreateWorkspaceModal
				open={createModalOpen}
				onClose={() => setCreateModalOpen(false)}
				onCreate={handleCreate}
			/>
		</>
	);
}
