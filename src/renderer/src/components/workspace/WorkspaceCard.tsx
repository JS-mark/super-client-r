import {
	CheckOutlined,
	ClockCircleOutlined,
	CopyOutlined,
	DeleteOutlined,
	EditOutlined,
	ExportOutlined,
	MessageOutlined,
	MoreOutlined,
	StarOutlined,
} from "@ant-design/icons";
import { Button, Card, Dropdown, Tag } from "antd";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/utils";
import {
	useWorkspaceStore,
	type Workspace,
	type WorkspaceType,
} from "../../stores/workspaceStore";

const WORKSPACE_TYPE_OPTIONS: {
	value: WorkspaceType;
	label: string;
	icon: string;
}[] = [
		{ value: "personal", label: "workspaces.type.personal", icon: "🏠" },
		{ value: "work", label: "workspaces.type.work", icon: "💼" },
		{ value: "project", label: "workspaces.type.project", icon: "📁" },
		{ value: "temp", label: "workspaces.type.temp", icon: "⏱️" },
	];

export { WORKSPACE_TYPE_OPTIONS };

export function WorkspaceCard({
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

	const typeOption = WORKSPACE_TYPE_OPTIONS.find(
		(t) => t.value === workspace.type,
	);

	const menuItems = [
		{
			key: "switch",
			label: t("workspaces.actions.switch", "切换到此工作区", { ns: "workspaces" }),
			icon: <CheckOutlined />,
			onClick: onSwitch,
			disabled: isCurrent,
		},
		{
			key: "edit",
			label: t("edit", "编辑", { ns: "common" }),
			icon: <EditOutlined />,
			onClick: onEdit,
		},
		{
			key: "duplicate",
			label: t("workspaces.actions.duplicate", "复制", { ns: "workspaces" }),
			icon: <CopyOutlined />,
			onClick: onDuplicate,
		},
		{
			key: "export",
			label: t("workspaces.actions.export", "导出", { ns: "workspaces" }),
			icon: <ExportOutlined />,
			onClick: onExport,
		},
		{
			key: "setDefault",
			label: t("workspaces.actions.setDefault", "设为默认", { ns: "workspaces" }),
			icon: <StarOutlined />,
			onClick: onSetDefault,
			disabled: isDefault,
		},
		{ type: "divider" as const },
		{
			key: "delete",
			label: t("delete", "删除", { ns: "common" }),
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
				isCurrent && "ring-2 ring-blue-500",
			)}
			bodyStyle={{ padding: 0 }}
		>
			{/* Top color bar */}
			<div className="h-2" style={{ backgroundColor: workspace.color }} />

			<div className="p-5">
				{/* Header */}
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
								<h3 className="font-semibold text-slate-800 ">
									{workspace.name}
								</h3>
								{isDefault && (
									<Tag color="gold" className="text-xs">
										{t("workspaces.default", "默认", { ns: "workspaces" })}
									</Tag>
								)}
								{isCurrent && (
									<Tag color="blue" className="text-xs">
										{t("workspaces.current", "当前", { ns: "workspaces" })}
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

				{/* Description */}
				{workspace.description && (
					<p className="text-sm text-slate-500  mb-4 line-clamp-2">
						{workspace.description}
					</p>
				)}

				{/* Stats */}
				<div className="grid grid-cols-2 gap-4 mb-4">
					<div className="flex items-center gap-2 text-sm text-slate-600 ">
						<MessageOutlined />
						<span>
							{stats.totalSessions} {t("workspaces.stats.sessions", "会话", { ns: "workspaces" })}
						</span>
					</div>
					<div className="flex items-center gap-2 text-sm text-slate-600 ">
						<ClockCircleOutlined />
						<span>{new Date(workspace.updatedAt).toLocaleDateString()}</span>
					</div>
				</div>

				{/* Action buttons */}
				<div className="flex gap-2">
					<Button
						type={isCurrent ? "default" : "primary"}
						onClick={onSwitch}
						disabled={isCurrent}
						className="flex-1"
					>
						{isCurrent
							? t("workspaces.current", "当前工作区")
							: t("workspaces.actions.switch", "切换", { ns: "workspaces" })}
					</Button>
				</div>
			</div>
		</Card>
	);
}
