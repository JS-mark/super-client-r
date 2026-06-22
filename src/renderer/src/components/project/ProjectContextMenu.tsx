/**
 * ProjectContextMenu — Phase F-4
 *
 * 项目行的右键菜单（plan §13）。沿用 SessionContextMenu 的封装方式：把 children
 * 用 antd Dropdown 包一层，trigger=["contextMenu"]，左键照常触发原 onClick。
 *
 * 6 个菜单项：
 *   1. 置顶项目 / 取消置顶          → projects.pin
 *   2. 在 Finder 中显示              → app.showInFolder
 *   3. 创建永久工作树…               → 弹 CreateWorktreeModal（F-9）
 *   4. 重命名项目                    → 触发外层 inline rename 流（F-7）
 *   5. 归档项目 / 取消归档           → projects.archive
 *   6. 移除…                          → 弹删除确认 Modal（F-10）
 *
 * Inline rename UI 状态在父组件，本菜单只通过 onRename 通知意图。
 */

import {
	BranchesOutlined,
	DeleteOutlined,
	EditOutlined,
	ExclamationCircleFilled,
	FolderOpenOutlined,
	InboxOutlined,
	PushpinOutlined,
} from "@ant-design/icons";
import {
	Checkbox,
	Dropdown,
	type MenuProps,
	Modal,
	Form,
	Input,
	message,
} from "antd";
import type React from "react";
import { useCallback, useMemo, useState } from "react";
import type { Project } from "@super-client/shared-types/project";
import { appService } from "../../services/appService";
import { deleteProjectWithCleanup } from "../../services/projectDeletionService";
import { useProjectStore } from "../../stores/projectStore";

export interface ProjectContextMenuProps {
	project: Project;
	onRename: (project: Project) => void;
	children: React.ReactNode;
}

export const ProjectContextMenu: React.FC<ProjectContextMenuProps> = ({
	project,
	onRename,
	children,
}) => {
	const [worktreeModalOpen, setWorktreeModalOpen] = useState(false);

	const togglePinned = useCallback(() => {
		void useProjectStore.getState().pin(project.id, !project.pinned);
	}, [project.id, project.pinned]);

	const toggleArchived = useCallback(() => {
		void useProjectStore.getState().archive(project.id, !project.archived);
	}, [project.id, project.archived]);

	const handleShowInFolder = useCallback(async () => {
		try {
			await appService.showInFolder(project.cwd);
		} catch (err) {
			const msg = err instanceof Error ? err.message : "无法在 Finder 中显示";
			message.error(`${msg}（${project.cwd}）`);
		}
	}, [project.cwd]);

	const handleRename = useCallback(() => {
		onRename(project);
	}, [project, onRename]);

	const [removeModalOpen, setRemoveModalOpen] = useState(false);
	const handleRemove = useCallback(() => {
		setRemoveModalOpen(true);
	}, []);

	const items: MenuProps["items"] = useMemo(
		() => [
			{
				key: "pin",
				label: project.pinned ? "取消置顶" : "置顶项目",
				icon: <PushpinOutlined />,
				onClick: togglePinned,
			},
			{
				key: "show-in-folder",
				label: "在 Finder 中显示",
				icon: <FolderOpenOutlined />,
				onClick: handleShowInFolder,
			},
			{
				key: "create-worktree",
				label: "创建永久工作树…",
				icon: <BranchesOutlined />,
				onClick: () => setWorktreeModalOpen(true),
			},
			{
				key: "rename",
				label: "重命名项目",
				icon: <EditOutlined />,
				onClick: handleRename,
			},
			{
				key: "archive",
				label: project.archived ? "取消归档" : "归档项目",
				icon: <InboxOutlined />,
				onClick: toggleArchived,
			},
			{ type: "divider" },
			{
				key: "remove",
				label: "移除…",
				icon: <DeleteOutlined />,
				danger: true,
				onClick: handleRemove,
			},
		],
		[
			project.pinned,
			project.archived,
			togglePinned,
			handleShowInFolder,
			handleRename,
			toggleArchived,
			handleRemove,
		],
	);

	return (
		<>
			<Dropdown menu={{ items }} trigger={["contextMenu"]}>
				<div style={{ width: "100%" }}>{children}</div>
			</Dropdown>
			<CreateWorktreeModal
				project={project}
				open={worktreeModalOpen}
				onClose={() => setWorktreeModalOpen(false)}
			/>
			<RemoveProjectModal
				project={project}
				open={removeModalOpen}
				onClose={() => setRemoveModalOpen(false)}
			/>
		</>
	);
};

// ─── RemoveProjectModal ──────────────────────────────────────

interface RemoveProjectModalProps {
	project: Project;
	open: boolean;
	onClose: () => void;
}

function RemoveProjectModal({
	project,
	open,
	onClose,
}: RemoveProjectModalProps) {
	const [keepFiles, setKeepFiles] = useState(false);
	const [confirmName, setConfirmName] = useState("");
	const [submitting, setSubmitting] = useState(false);

	// Modal 关闭时重置表单
	const handleAfterClose = () => {
		setKeepFiles(false);
		setConfirmName("");
	};

	const physicalConfirmed = keepFiles || confirmName === project.name;

	const handleOk = async () => {
		if (!physicalConfirmed) return;
		setSubmitting(true);
		try {
			const res = await deleteProjectWithCleanup(project, {
				keepFiles,
			});
			if (res?.removed) {
				message.success(
					keepFiles ? "已移除项目（文件保留）" : "已删除项目数据",
				);
				onClose();
			}
		} catch (err) {
			message.error(err instanceof Error ? err.message : "移除失败");
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<Modal
			open={open}
			title="移除项目"
			width={520}
			onCancel={onClose}
			afterClose={handleAfterClose}
			destroyOnHidden
			okText={keepFiles ? "移除（保留文件）" : "删除项目数据"}
			cancelText="取消"
			okButtonProps={{
				danger: true,
				disabled: !physicalConfirmed,
				loading: submitting,
			}}
			onOk={handleOk}
		>
			<div className="space-y-3">
				<div>
					确定要删除 <strong>{project.name}</strong> 吗？
				</div>
				<div className="text-xs text-slate-500">
					工作目录：<code>{project.cwd}</code>
				</div>
				<Checkbox
					checked={keepFiles}
					onChange={(e) => {
						setKeepFiles(e.target.checked);
						if (e.target.checked) setConfirmName("");
					}}
				>
					<span>仅从项目列表移除，保留磁盘文件用于后续恢复</span>
				</Checkbox>
				{!keepFiles && (
					<div className="space-y-2 pl-6">
						<div className="flex items-start gap-2 text-xs text-amber-500">
							<ExclamationCircleFilled className="mt-0.5" />
							<span>
								会删除该项目关联的会话、附件和工具产物。要继续，请输入项目名{" "}
								<code className="text-slate-300">{project.name}</code>{" "}
								二次确认：
							</span>
						</div>
						<Input
							placeholder={`输入 ${project.name} 以确认`}
							value={confirmName}
							onChange={(e) => setConfirmName(e.target.value)}
							autoFocus
							status={
								confirmName && confirmName !== project.name
									? "error"
									: undefined
							}
						/>
					</div>
				)}
			</div>
		</Modal>
	);
}

// ─── CreateWorktreeModal ─────────────────────────────────────

interface CreateWorktreeModalProps {
	project: Project;
	open: boolean;
	onClose: () => void;
}

function CreateWorktreeModal({
	project,
	open,
	onClose,
}: CreateWorktreeModalProps) {
	const [form] = Form.useForm<{ worktreePath: string; branchName: string }>();
	const [submitting, setSubmitting] = useState(false);

	const defaultPath = `${project.cwd}-worktree-${Date.now().toString(36)}`;
	const defaultBranch = `worktree-${Date.now().toString(36)}`;

	const handleOk = async () => {
		const values = await form.validateFields();
		setSubmitting(true);
		try {
			const newProject = await useProjectStore
				.getState()
				.createWorktree(project.id, {
					worktreePath: values.worktreePath,
					branchName: values.branchName,
				});
			if (newProject) {
				useProjectStore.getState().setCurrent(newProject.id);
				message.success(`已创建工作树：${newProject.name}`);
				onClose();
			}
		} catch (err) {
			message.error(err instanceof Error ? err.message : "创建工作树失败");
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<Modal
			open={open}
			title={`从 ${project.name} 创建工作树`}
			onCancel={onClose}
			onOk={handleOk}
			confirmLoading={submitting}
			okText="创建"
			cancelText="取消"
			destroyOnHidden
		>
			<Form
				form={form}
				layout="vertical"
				initialValues={{
					worktreePath: defaultPath,
					branchName: defaultBranch,
				}}
			>
				<Form.Item
					label="工作树路径"
					name="worktreePath"
					rules={[{ required: true, message: "请输入工作树路径" }]}
					help="git worktree add 的目标目录；不能与已存在的目录冲突"
				>
					<Input />
				</Form.Item>
				<Form.Item
					label="分支名"
					name="branchName"
					rules={[{ required: true, message: "请输入新建分支名" }]}
					help="git worktree add -b 创建并切到该分支；同名分支已存在会报错"
				>
					<Input />
				</Form.Item>
			</Form>
		</Modal>
	);
}
