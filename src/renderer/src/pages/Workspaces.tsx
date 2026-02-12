import {
	FolderOutlined,
	ImportOutlined,
	PlusOutlined,
	SearchOutlined,
} from "@ant-design/icons";
import {
	Button,
	Card,
	Col,
	Empty,
	Form,
	Input,
	Modal,
	message,
	Radio,
	Row,
	Statistic,
} from "antd";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { MainLayout } from "../components/layout/MainLayout";
import { EditWorkspaceModal } from "../components/workspace/EditWorkspaceModal";
import { WorkspaceCard, WORKSPACE_TYPE_OPTIONS } from "../components/workspace/WorkspaceCard";
import { useTitle } from "../hooks/useTitle";
import { cn } from "../lib/utils";
import {
	useWorkspaceStore,
	WORKSPACE_COLORS,
	type Workspace,
	type WorkspaceExportData,
} from "../stores/workspaceStore";

export default function Workspaces() {
	const { t } = useTranslation();

	const pageTitle = useMemo(
		() => (
			<div className="flex items-center gap-2">
				<div className="w-6 h-6 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
					<FolderOutlined className="text-white text-xs" />
				</div>
				<span className="text-slate-700 dark:text-slate-200 text-sm font-medium">
					{t("workspaces", "工作区", { ns: "menu" })}
				</span>
			</div>
		),
		[t],
	);
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

	const filteredWorkspaces = useMemo(() => {
		return workspaces
			.filter(
				(ws) =>
					ws.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
					ws.description?.toLowerCase().includes(searchQuery.toLowerCase()),
			)
			.sort((a, b) => a.order - b.order);
	}, [workspaces, searchQuery]);

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
			message.success(t("workspaces.create.success", "工作区创建成功", { ns: "workspaces" }));
			setCreateModalOpen(false);
			form.resetFields();
			setColor(WORKSPACE_COLORS[0]);
		});
	};

	const handleSaveEdit = (data: Partial<Workspace>) => {
		if (editingWorkspace) {
			updateWorkspace(editingWorkspace.id, data);
			message.success(t("workspaces.edit.success", "工作区更新成功", { ns: "workspaces" }));
			setEditingWorkspace(null);
		}
	};

	const handleDuplicate = (workspace: Workspace) => {
		duplicateWorkspace(workspace.id);
		message.success(t("workspaces.duplicate.success", "工作区已复制", { ns: "workspaces" }));
	};

	const handleDelete = (workspace: Workspace) => {
		if (workspace.id === defaultWorkspaceId) {
			message.error(t("workspaces.delete.cannotDeleteDefault", "不能删除默认工作区", { ns: "workspaces" }));
			return;
		}
		Modal.confirm({
			title: t("workspaces.delete.confirmTitle", "删除工作区", { ns: "workspaces" }),
			content: t("workspaces.delete.confirmContent", `确定要删除工作区 "${workspace.name}" 吗？`),
			onOk: () => {
				const success = deleteWorkspace(workspace.id);
				if (success) {
					message.success(t("workspaces.delete.success", "工作区已删除", { ns: "workspaces" }));
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
			message.success(t("workspaces.export.success", "工作区已导出", { ns: "workspaces" }));
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
							message.success(t("workspaces.import.success", "工作区导入成功", { ns: "workspaces" }));
						} else {
							message.error(t("workspaces.import.invalidFormat", "无效的工作区文件格式", { ns: "workspaces" }));
						}
					} catch (error) {
						message.error(t("workspaces.import.error", "导入失败", { ns: "workspaces" }));
					}
				};
				reader.readAsText(file);
			}
		};
		input.click();
	};

	return (
		<MainLayout>
			<div className="h-full flex flex-col bg-slate-50/50 dark:bg-slate-950 p-6">
				{/* Header */}
				<div className="mb-6">
					<div className="flex items-center justify-between mb-4">
						<div>
							<h1 className="text-2xl font-bold text-slate-900 dark:text-white">
								{t("workspaces.title", "工作区管理", { ns: "workspaces" })}
							</h1>
							<p className="text-sm text-slate-500 mt-1">
								{t("workspaces.subtitle", "管理工作区和对话", { ns: "workspaces" })}
							</p>
						</div>
						<div className="flex gap-2">
							<Button icon={<ImportOutlined />} onClick={handleImport}>
								{t("workspaces.import", "导入", { ns: "workspaces" })}
							</Button>
							<Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalOpen(true)}>
								{t("workspaces.create.title", "创建工作区", { ns: "workspaces" })}
							</Button>
						</div>
					</div>

					{/* Stats */}
					<Row gutter={16} className="mb-4">
						<Col span={6}>
							<Card>
								<Statistic title={t("workspaces.stats.total", "工作区总数", { ns: "workspaces" })} value={stats.total} prefix={<FolderOutlined />} />
							</Card>
						</Col>
						<Col span={6}>
							<Card>
								<Statistic title={t("workspaces.stats.personal", "个人", { ns: "workspaces" })} value={stats.personal} />
							</Card>
						</Col>
						<Col span={6}>
							<Card>
								<Statistic title={t("workspaces.stats.work", "工作", { ns: "workspaces" })} value={stats.work} />
							</Card>
						</Col>
						<Col span={6}>
							<Card>
								<Statistic title={t("workspaces.stats.project", "项目", { ns: "workspaces" })} value={stats.project} />
							</Card>
						</Col>
					</Row>

					{/* Search */}
					<Input
						prefix={<SearchOutlined className="text-slate-400" />}
						placeholder={t("workspaces.search", "搜索工作区...", { ns: "workspaces" })}
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						allowClear
						className="w-full"
					/>
				</div>

				{/* Workspace list */}
				{filteredWorkspaces.length === 0 ? (
					<Empty
						description={
							searchQuery
								? t("workspaces.noResults", "没有找到匹配的工作区")
								: t("workspaces.empty", "还没有工作区，创建一个吧", { ns: "workspaces" })
						}
						image={Empty.PRESENTED_IMAGE_SIMPLE}
					>
						<Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalOpen(true)}>
							{t("workspaces.create.title", "创建工作区", { ns: "workspaces" })}
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
								onEdit={() => setEditingWorkspace(workspace)}
								onDuplicate={() => handleDuplicate(workspace)}
								onDelete={() => handleDelete(workspace)}
								onExport={() => handleExport(workspace)}
								onSetDefault={() => {
									setDefaultWorkspace(workspace.id);
									message.success(t("workspaces.setDefault.success", "已设为默认工作区", { ns: "workspaces" }));
								}}
							/>
						))}
					</div>
				)}
			</div>

			{/* Create workspace modal */}
			<Modal
				title={t("workspaces.create.title", "创建工作区", { ns: "workspaces" })}
				open={createModalOpen}
				onOk={handleCreate}
				onCancel={() => { setCreateModalOpen(false); form.resetFields(); setColor(WORKSPACE_COLORS[0]); }}
				okText={t("common.create", "创建")}
				cancelText={t("cancel", "取消", { ns: "common" })}
			>
				<Form form={form} layout="vertical" className="mt-4">
					<Form.Item name="name" label={t("workspaces.name", "名称", { ns: "workspaces" })} rules={[{ required: true, message: "请输入工作区名称" }]}>
						<Input placeholder={t("workspaces.namePlaceholder", "我的工作区", { ns: "workspaces" })} />
					</Form.Item>
					<Form.Item name="description" label={t("workspaces.description", "描述", { ns: "workspaces" })}>
						<Input.TextArea rows={2} placeholder={t("workspaces.descriptionPlaceholder", "工作区描述...")} />
					</Form.Item>
					<Form.Item name="type" label={t("workspaces.type.label", "类型", { ns: "workspaces" })} initialValue="personal">
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
					<Form.Item label={t("workspaces.color", "颜色", { ns: "workspaces" })}>
						<div className="flex flex-wrap gap-2">
							{WORKSPACE_COLORS.map((c) => (
								<button
									key={c}
									type="button"
									onClick={() => setColor(c)}
									className={cn(
										"w-8 h-8 rounded-lg transition-all",
										color === c ? "ring-2 ring-offset-2 ring-slate-400 scale-110" : "hover:scale-105",
									)}
									style={{ backgroundColor: c }}
								/>
							))}
						</div>
					</Form.Item>
				</Form>
			</Modal>

			{/* Edit workspace modal */}
			<EditWorkspaceModal
				workspace={editingWorkspace}
				open={!!editingWorkspace}
				onClose={() => setEditingWorkspace(null)}
				onSave={handleSaveEdit}
			/>
		</MainLayout>
	);
}
