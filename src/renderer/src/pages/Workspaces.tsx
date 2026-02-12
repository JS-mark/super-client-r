import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTitle } from "../hooks/useTitle";
import {
	Button,
	Card,
	Input,
	Modal,
	Form,
	Radio,
	message,
	Empty,
	Tag,
	Tooltip,
	Dropdown,
	Statistic,
	Row,
	Col,
} from "antd";
import {
	PlusOutlined,
	SearchOutlined,
	MoreOutlined,
	CopyOutlined,
	ExportOutlined,
	ImportOutlined,
	DeleteOutlined,
	EditOutlined,
	SettingOutlined,
	CheckOutlined,
	StarOutlined,
	ClockCircleOutlined,
	MessageOutlined,
	FolderOutlined,
} from "@ant-design/icons";
import { MainLayout } from "../components/layout/MainLayout";
import { cn } from "../lib/utils";
import {
	useWorkspaceStore,
	WORKSPACE_COLORS,
	type Workspace,
	type WorkspaceType,
	type WorkspaceExportData,
} from "../stores/workspaceStore";

const WORKSPACE_TYPE_OPTIONS: { value: WorkspaceType; label: string; icon: string }[] = [
	{ value: "personal", label: "workspaces.type.personal", icon: "🏠" },
	{ value: "work", label: "workspaces.type.work", icon: "💼" },
	{ value: "project", label: "workspaces.type.project", icon: "📁" },
	{ value: "temp", label: "workspaces.type.temp", icon: "⏱️" },
];

// 工作区卡片
function WorkspaceCard({
	workspace,
	isDefault,
	isCurrent,
	onSwitch,
	onEdit,
	onDuplicate,
	onDelete,
	onExport,
	onSetDefault,
}: {
	workspace: Workspace;
	isDefault: boolean;
	isCurrent: boolean;
	onSwitch: () => void;
	onEdit: () => void;
	onDuplicate: () => void;
	onDelete: () => void;
	onExport: () => void;
	onSetDefault: () => void;
}) {
	const { t } = useTranslation();
	const stats = useWorkspaceStore().getWorkspaceStats(workspace.id);

	const typeOption = WORKSPACE_TYPE_OPTIONS.find((t) => t.value === workspace.type);

	const menuItems = [
		{
			key: "switch",
			label: t("workspaces.actions.switch", "切换到此工作区"),
			icon: <CheckOutlined />,
			onClick: onSwitch,
			disabled: isCurrent,
		},
		{
			key: "edit",
			label: t("common.edit", "编辑"),
			icon: <EditOutlined />,
			onClick: onEdit,
		},
		{
			key: "duplicate",
			label: t("workspaces.actions.duplicate", "复制"),
			icon: <CopyOutlined />,
			onClick: onDuplicate,
		},
		{
			key: "export",
			label: t("workspaces.actions.export", "导出"),
			icon: <ExportOutlined />,
			onClick: onExport,
		},
		{
			key: "setDefault",
			label: t("workspaces.actions.setDefault", "设为默认"),
			icon: <StarOutlined />,
			onClick: onSetDefault,
			disabled: isDefault,
		},
		{ type: "divider" as const },
		{
			key: "delete",
			label: t("common.delete", "删除"),
			icon: <DeleteOutlined className="text-red-500" />,
			onClick: onDelete,
			danger: true,
			disabled: isDefault,
		},
	];

	return (
		<Card
			className={cn(
				"relative overflow-hidden transition-all hover:shadow-lg",
				isCurrent && "ring-2 ring-blue-500"
			)}
			bodyStyle={{ padding: 0 }}
		>
			{/* 顶部颜色条 */}
			<div className="h-2" style={{ backgroundColor: workspace.color }} />

			<div className="p-5">
				{/* 头部 */}
				<div className="flex items-start justify-between mb-4">
					<div className="flex items-center gap-3">
						<div
							className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl text-white font-bold"
							style={{ backgroundColor: workspace.color }}
						>
							{workspace.icon || workspace.name.charAt(0).toUpperCase()}
						</div>
						<div>
							<div className="flex items-center gap-2">
								<h3 className="font-semibold text-slate-800 dark:text-slate-200">
									{workspace.name}
								</h3>
								{isDefault && (
									<Tag color="gold" className="text-xs">
										{t("workspaces.default", "默认")}
									</Tag>
								)}
								{isCurrent && (
									<Tag color="blue" className="text-xs">
										{t("workspaces.current", "当前")}
									</Tag>
								)}
							</div>
							<Tag className="mt-1 text-xs">
								{typeOption?.icon} {t(typeOption?.label || "")}
							</Tag>
						</div>
					</div>
					<Dropdown menu={{ items: menuItems }} placement="bottomRight">
						<Button type="text" icon={<MoreOutlined />} />
					</Dropdown>
				</div>

				{/* 描述 */}
				{workspace.description && (
					<p className="text-sm text-slate-500 dark:text-slate-400 mb-4 line-clamp-2">
						{workspace.description}
					</p>
				)}

				{/* 统计 */}
				<div className="grid grid-cols-2 gap-4 mb-4">
					<div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
						<MessageOutlined />
						<span>
							{stats.totalSessions} {t("workspaces.stats.sessions", "会话")}
						</span>
					</div>
					<div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
						<ClockCircleOutlined />
						<span>
							{new Date(workspace.updatedAt).toLocaleDateString()}
						</span>
					</div>
				</div>

				{/* 操作按钮 */}
				<div className="flex gap-2">
					<Button
						type={isCurrent ? "default" : "primary"}
						onClick={onSwitch}
						disabled={isCurrent}
						className="flex-1"
					>
						{isCurrent
							? t("workspaces.current", "当前工作区")
							: t("workspaces.actions.switch", "切换")}
					</Button>
				</div>
			</div>
		</Card>
	);
}

// 编辑工作区弹窗
function EditWorkspaceModal({
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

	// 重置表单当workspace变化时
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
			title={t("workspaces.edit.title", "编辑工作区")}
			open={open}
			onOk={handleSubmit}
			onCancel={onClose}
			okText={t("common.save", "保存")}
			cancelText={t("common.cancel", "取消")}
		>
			<Form form={form} layout="vertical" className="mt-4">
				<Form.Item
					name="name"
					label={t("workspaces.name", "名称")}
					rules={[{ required: true, message: "请输入工作区名称" }]}
				>
					<Input />
				</Form.Item>

				<Form.Item name="description" label={t("workspaces.description", "描述")}>
					<Input.TextArea rows={3} />
				</Form.Item>

				<Form.Item name="type" label={t("workspaces.type.label", "类型")}>
					<Radio.Group>
						<div className="grid grid-cols-2 gap-2">
							{WORKSPACE_TYPE_OPTIONS.map((type) => (
								<Radio.Button key={type.value} value={type.value} className="!h-auto">
									<div className="flex items-center gap-2 py-1">
										<span>{type.icon}</span>
										<span>{t(type.label)}</span>
									</div>
								</Radio.Button>
							))}
						</div>
					</Radio.Group>
				</Form.Item>

				<Form.Item label={t("workspaces.color", "颜色")}>
					<div className="flex flex-wrap gap-2">
						{WORKSPACE_COLORS.map((c) => (
							<button
								key={c}
								type="button"
								onClick={() => setColor(c)}
								className={cn(
									"w-8 h-8 rounded-lg transition-all",
									color === c ? "ring-2 ring-offset-2 ring-slate-400 scale-110" : "hover:scale-105"
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

// 主页面
export default function Workspaces() {
	const { t } = useTranslation();

	// 设置标题栏
	const pageTitle = useMemo(() => (
		<div className="flex items-center gap-2">
			<div className="w-6 h-6 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
				<FolderOutlined className="text-white text-xs" />
			</div>
			<span className="text-slate-700 dark:text-slate-200 text-sm font-medium">{t("menu.workspaces", "工作区")}</span>
		</div>
	), [t]);
	useTitle(pageTitle);
	const {
		workspaces,
		currentWorkspaceId,
		defaultWorkspaceId,
		createWorkspace,
		updateWorkspace,
		deleteWorkspace,
		switchWorkspace,
		setDefaultWorkspace,
		duplicateWorkspace,
		exportWorkspace,
		importWorkspace,
	} = useWorkspaceStore();

	const [searchQuery, setSearchQuery] = useState("");
	const [createModalOpen, setCreateModalOpen] = useState(false);
	const [editingWorkspace, setEditingWorkspace] = useState<Workspace | null>(null);
	const [form] = Form.useForm();
	const [color, setColor] = useState(WORKSPACE_COLORS[0]);

	// 过滤工作区
	const filteredWorkspaces = useMemo(() => {
		return workspaces
			.filter(
				(ws) =>
					ws.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
					ws.description?.toLowerCase().includes(searchQuery.toLowerCase())
			)
			.sort((a, b) => a.order - b.order);
	}, [workspaces, searchQuery]);

	// 统计
	const stats = useMemo(() => {
		return {
			total: workspaces.length,
			personal: workspaces.filter((w) => w.type === "personal").length,
			work: workspaces.filter((w) => w.type === "work").length,
			project: workspaces.filter((w) => w.type === "project").length,
		};
	}, [workspaces]);

	const handleCreate = () => {
		form.validateFields().then((values) => {
			createWorkspace({ ...values, color });
			message.success(t("workspaces.create.success", "工作区创建成功"));
			setCreateModalOpen(false);
			form.resetFields();
			setColor(WORKSPACE_COLORS[0]);
		});
	};

	const handleEdit = (workspace: Workspace) => {
		setEditingWorkspace(workspace);
	};

	const handleSaveEdit = (data: Partial<Workspace>) => {
		if (editingWorkspace) {
			updateWorkspace(editingWorkspace.id, data);
			message.success(t("workspaces.edit.success", "工作区更新成功"));
			setEditingWorkspace(null);
		}
	};

	const handleDuplicate = (workspace: Workspace) => {
		duplicateWorkspace(workspace.id);
		message.success(t("workspaces.duplicate.success", "工作区已复制"));
	};

	const handleDelete = (workspace: Workspace) => {
		if (workspace.id === defaultWorkspaceId) {
			message.error(t("workspaces.delete.cannotDeleteDefault", "不能删除默认工作区"));
			return;
		}

		Modal.confirm({
			title: t("workspaces.delete.confirmTitle", "删除工作区"),
			content: t("workspaces.delete.confirmContent", `确定要删除工作区 "${workspace.name}" 吗？`),
			onOk: () => {
				const success = deleteWorkspace(workspace.id);
				if (success) {
					message.success(t("workspaces.delete.success", "工作区已删除"));
				}
			},
		});
	};

	const handleExport = (workspace: Workspace) => {
		try {
			const data = exportWorkspace(workspace.id);
			const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `workspace-${workspace.name}-${Date.now()}.json`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
			message.success(t("workspaces.export.success", "工作区已导出"));
		} catch (error) {
			message.error(t("workspaces.export.error", "导出失败"));
		}
	};

	const handleImport = () => {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = ".json";
		input.onchange = (e) => {
			const file = (e.target as HTMLInputElement).files?.[0];
			if (file) {
				const reader = new FileReader();
				reader.onload = (event) => {
					try {
						const data = JSON.parse(event.target?.result as string) as WorkspaceExportData;
						if (data.version && data.workspace) {
							importWorkspace(data);
							message.success(t("workspaces.import.success", "工作区导入成功"));
						} else {
							message.error(t("workspaces.import.invalidFormat", "无效的工作区文件格式"));
						}
					} catch (error) {
						message.error(t("workspaces.import.error", "导入失败"));
					}
				};
				reader.readAsText(file);
			}
		};
		input.click();
	};

	const handleSetDefault = (workspace: Workspace) => {
		setDefaultWorkspace(workspace.id);
		message.success(t("workspaces.setDefault.success", "已设为默认工作区"));
	};

	return (
		<MainLayout>
			<div className="h-full flex flex-col bg-slate-50/50 dark:bg-slate-950 p-6">
				{/* 头部 */}
				<div className="mb-6">
					<div className="flex items-center justify-between mb-4">
						<div>
							<h1 className="text-2xl font-bold text-slate-900 dark:text-white">
								{t("workspaces.title", "工作区管理")}
							</h1>
							<p className="text-sm text-slate-500 mt-1">
								{t("workspaces.subtitle", "管理工作区和对话")}
							</p>
						</div>
						<div className="flex gap-2">
							<Button icon={<ImportOutlined />} onClick={handleImport}>
								{t("workspaces.import", "导入")}
							</Button>
							<Button
								type="primary"
								icon={<PlusOutlined />}
								onClick={() => setCreateModalOpen(true)}
							>
								{t("workspaces.create.title", "创建工作区")}
							</Button>
						</div>
					</div>

					{/* 统计 */}
					<Row gutter={16} className="mb-4">
						<Col span={6}>
							<Card>
								<Statistic
									title={t("workspaces.stats.total", "工作区总数")}
									value={stats.total}
									prefix={<FolderOutlined />}
								/>
							</Card>
						</Col>
						<Col span={6}>
							<Card>
								<Statistic
									title={t("workspaces.stats.personal", "个人")}
									value={stats.personal}
								/>
							</Card>
						</Col>
						<Col span={6}>
							<Card>
								<Statistic
									title={t("workspaces.stats.work", "工作")}
									value={stats.work}
								/>
							</Card>
						</Col>
						<Col span={6}>
							<Card>
								<Statistic
									title={t("workspaces.stats.project", "项目")}
									value={stats.project}
								/>
							</Card>
						</Col>
					</Row>

					{/* 搜索 */}
					<Input
						prefix={<SearchOutlined className="text-slate-400" />}
						placeholder={t("workspaces.search", "搜索工作区...")}
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						allowClear
						className="max-w-md"
					/>
				</div>

				{/* 工作区列表 */}
				{filteredWorkspaces.length === 0 ? (
					<Empty
						description={
							searchQuery
								? t("workspaces.noResults", "没有找到匹配的工作区")
								: t("workspaces.empty", "还没有工作区，创建一个吧")
						}
						image={Empty.PRESENTED_IMAGE_SIMPLE}
					>
						<Button
							type="primary"
							icon={<PlusOutlined />}
							onClick={() => setCreateModalOpen(true)}
						>
							{t("workspaces.create.title", "创建工作区")}
						</Button>
					</Empty>
				) : (
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
						{filteredWorkspaces.map((workspace) => (
							<WorkspaceCard
								key={workspace.id}
								workspace={workspace}
								isDefault={workspace.id === defaultWorkspaceId}
								isCurrent={workspace.id === currentWorkspaceId}
								onSwitch={() => switchWorkspace(workspace.id)}
								onEdit={() => handleEdit(workspace)}
								onDuplicate={() => handleDuplicate(workspace)}
								onDelete={() => handleDelete(workspace)}
								onExport={() => handleExport(workspace)}
								onSetDefault={() => handleSetDefault(workspace)}
							/>
						))}
					</div>
				)}
			</div>

			{/* 创建工作区弹窗 */}
			<Modal
				title={t("workspaces.create.title", "创建工作区")}
				open={createModalOpen}
				onOk={handleCreate}
				onCancel={() => {
					setCreateModalOpen(false);
					form.resetFields();
					setColor(WORKSPACE_COLORS[0]);
				}}
				okText={t("common.create", "创建")}
				cancelText={t("common.cancel", "取消")}
			>
				<Form form={form} layout="vertical" className="mt-4">
					<Form.Item
						name="name"
						label={t("workspaces.name", "名称")}
						rules={[{ required: true, message: "请输入工作区名称" }]}
					>
						<Input placeholder={t("workspaces.namePlaceholder", "我的工作区")} />
					</Form.Item>

					<Form.Item name="description" label={t("workspaces.description", "描述")}>
						<Input.TextArea
							rows={2}
							placeholder={t("workspaces.descriptionPlaceholder", "工作区描述...")}
						/>
					</Form.Item>

					<Form.Item
						name="type"
						label={t("workspaces.type.label", "类型")}
						initialValue="personal"
					>
						<Radio.Group>
							<div className="grid grid-cols-2 gap-2">
								{WORKSPACE_TYPE_OPTIONS.map((type) => (
									<Radio.Button key={type.value} value={type.value} className="!h-auto">
										<div className="flex items-center gap-2 py-1">
											<span>{type.icon}</span>
											<span>{t(type.label)}</span>
										</div>
									</Radio.Button>
								))}
							</div>
						</Radio.Group>
					</Form.Item>

					<Form.Item label={t("workspaces.color", "颜色")}>
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
											: "hover:scale-105"
									)}
									style={{ backgroundColor: c }}
								/>
							))}
						</div>
					</Form.Item>
				</Form>
			</Modal>

			{/* 编辑工作区弹窗 */}
			<EditWorkspaceModal
				workspace={editingWorkspace}
				open={!!editingWorkspace}
				onClose={() => setEditingWorkspace(null)}
				onSave={handleSaveEdit}
			/>
		</MainLayout>
	);
}
