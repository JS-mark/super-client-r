/**
 * NewConversationModal — plan §25.3 advanced creation surface.
 *
 * Triggered by TitleBar More menu (`新建任务…`) via the `chat:open-new-conversation`
 * window event. Single self-contained component: it owns its open-state and the
 * event listener, so callers only need to mount it once in MainLayout.
 *
 * Form: workspace + optional remote binding + optional name. Submit
 * delegates to `chatStore.createConversationAdvanced` so the entire flow is one
 * action (workspace switch → create → bind).
 */

import {
	Alert,
	Button,
	Form,
	Input,
	Modal,
	Radio,
	Select,
	Switch,
	Tag,
} from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { gitService, type GitBranchInfo } from "../../services/gitService";
import { useChatStore } from "../../stores/chatStore";
import { useIMBotStore } from "../../stores/imbotStore";
import { useProjectStore, useSortedProjects } from "../../stores/projectStore";

const PLATFORM_LABEL: Record<string, string> = {
	telegram: "Telegram",
	dingtalk: "DingTalk",
	lark: "Lark",
};

interface FormState {
	workspaceId: string;
	name: string;
	remoteEnabled: boolean;
	botId: string | null;
	chatId: string;
	branchMode: "current" | "new-branch" | "worktree";
	newBranchName: string;
	worktreePath: string;
}

/**
 * D-3: workspaceId === "" 表示无项目 Agent 任务（projectId=null），
 * workspaceId === <projectId> 表示项目 Agent 任务。
 */
function defaultState(currentProjectId: string | null): FormState {
	return {
		workspaceId: currentProjectId ?? "",
		name: "",
		remoteEnabled: false,
		botId: null,
		chatId: "",
		branchMode: "current",
		newBranchName: "",
		worktreePath: "",
	};
}

export function NewConversationModal() {
	const navigate = useNavigate();
	const [open, setOpen] = useState(false);
	const [submitting, setSubmitting] = useState(false);

	// D-3: 切到 useProjectStore；项目列表用 sorted hook。
	const sortedWorkspaces = useSortedProjects();
	const currentWorkspaceId = useProjectStore((s) => s.currentProjectId);

	const { botStatuses, fetchBots } = useIMBotStore();
	const runningBots = useMemo(
		() => botStatuses.filter((b) => b.status === "running"),
		[botStatuses],
	);

	const [state, setState] = useState<FormState>(() =>
		defaultState(currentWorkspaceId),
	);
	const [branchInfo, setBranchInfo] = useState<GitBranchInfo | null>(null);
	const [branchLoading, setBranchLoading] = useState(false);
	const [gitModalOpen, setGitModalOpen] = useState(false);
	const selectedProject = useMemo(
		() => sortedWorkspaces.find((w) => w.id === state.workspaceId) ?? null,
		[sortedWorkspaces, state.workspaceId],
	);

	useEffect(() => {
		const onOpen = () => {
			setState(defaultState(currentWorkspaceId));
			setOpen(true);
			fetchBots();
		};
		window.addEventListener("chat:open-new-conversation", onOpen);
		return () => {
			window.removeEventListener("chat:open-new-conversation", onOpen);
		};
	}, [currentWorkspaceId, fetchBots]);

	const handleRemoteToggle = useCallback((checked: boolean) => {
		setState((prev) => ({
			...prev,
			remoteEnabled: checked,
		}));
	}, []);

	useEffect(() => {
		if (!selectedProject) {
			setBranchInfo(null);
			return;
		}
		let cancelled = false;
		setBranchLoading(true);
		gitService
			.getBranchInfo(selectedProject.cwd)
			.then((res) => {
				if (cancelled) return;
				setBranchInfo(res.success && res.data ? res.data : null);
			})
			.catch(() => {
				if (!cancelled) setBranchInfo(null);
			})
			.finally(() => {
				if (!cancelled) setBranchLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [selectedProject]);

	useEffect(() => {
		if (!selectedProject) return;
		setState((prev) => ({
			...prev,
			worktreePath:
				prev.worktreePath ||
				`${selectedProject.cwd}-worktree-${Date.now().toString(36)}`,
			newBranchName:
				prev.newBranchName || `worktree-${Date.now().toString(36)}`,
		}));
	}, [selectedProject]);

	const handleSubmit = useCallback(async () => {
		if (state.remoteEnabled && (!state.botId || !state.chatId.trim())) {
			return;
		}
		if (
			state.workspaceId &&
			state.branchMode === "worktree" &&
			(!state.newBranchName.trim() || !state.worktreePath.trim())
		) {
			return;
		}
		setSubmitting(true);
		try {
			let workspaceId = state.workspaceId;
			if (selectedProject && state.branchMode === "worktree") {
				const newProject = await useProjectStore
					.getState()
					.createWorktree(selectedProject.id, {
						worktreePath: state.worktreePath.trim(),
						branchName: state.newBranchName.trim(),
					});
				if (newProject) workspaceId = newProject.id;
			}
			const id = await useChatStore.getState().createConversationAdvanced({
				workspaceId,
				chatMode: "agent",
				name: state.name.trim() || undefined,
				remote:
					state.remoteEnabled && state.botId
						? { botId: state.botId, chatId: state.chatId.trim() }
						: undefined,
			});
			if (id) {
				setOpen(false);
				navigate("/chat");
			}
		} finally {
			setSubmitting(false);
		}
	}, [state, selectedProject, navigate]);

	const submitDisabled =
		submitting ||
		(state.remoteEnabled && (!state.botId || !state.chatId.trim())) ||
		(state.workspaceId !== "" &&
			state.branchMode === "worktree" &&
			(!state.newBranchName.trim() || !state.worktreePath.trim()));

	return (
		<Modal
			title="新建 Agent 任务"
			open={open}
			onCancel={() => setOpen(false)}
			onOk={handleSubmit}
			okText="创建"
			cancelText="取消"
			okButtonProps={{ disabled: submitDisabled, loading: submitting }}
			width={520}
      destroyOnHidden
		>
			<Form layout="vertical" className="pt-2">
				<Form.Item
					label="项目"
					help={
						state.workspaceId === ""
							? "无项目任务不绑定项目；工具 / Agent 在用户家目录运行"
							: "项目任务：工具 / Agent / 文件操作在该项目目录下运行"
					}
				>
					<Select
						value={state.workspaceId}
						onChange={(workspaceId) =>
							setState((prev) => ({
								...prev,
								workspaceId,
								branchMode: "current",
								newBranchName: "",
								worktreePath: "",
							}))
						}
						options={[
							{ value: "", label: "无项目 Agent 任务" },
							...sortedWorkspaces.map((w) => ({
								value: w.id,
								label: w.name,
							})),
						]}
					/>
				</Form.Item>

				{selectedProject && (
					<Form.Item
						label="分支"
						help="当前版本支持读取分支信息，并可为项目对话创建新 worktree + 新分支。"
					>
						<div className="flex flex-col gap-2">
							<div className="flex items-center justify-between">
								<div className="text-xs text-slate-500">
									{branchLoading
										? "正在读取 Git 信息..."
										: branchInfo?.isRepo
											? `当前分支：${branchInfo.branch ?? "HEAD"}`
											: "当前项目不是 Git 仓库或无法读取分支"}
								</div>
								<Button size="small" onClick={() => setGitModalOpen(true)}>
									Git 图谱
								</Button>
							</div>
							<Radio.Group
								value={state.branchMode}
								onChange={(e) =>
									setState((prev) => ({
										...prev,
										branchMode: e.target.value,
									}))
								}
							>
								<Radio value="current">使用当前分支</Radio>
								<Radio value="new-branch" disabled>
									创建当前目录新分支（待接入）
								</Radio>
								<Radio value="worktree">创建新 worktree + 新分支</Radio>
							</Radio.Group>
							{state.branchMode === "worktree" && (
								<div className="grid grid-cols-1 gap-2">
									<Input
										placeholder="新分支名"
										value={state.newBranchName}
										onChange={(e) =>
											setState((prev) => ({
												...prev,
												newBranchName: e.target.value,
											}))
										}
									/>
									<Input
										placeholder="worktree 路径"
										value={state.worktreePath}
										onChange={(e) =>
											setState((prev) => ({
												...prev,
												worktreePath: e.target.value,
											}))
										}
									/>
									<Alert
										type="warning"
										showIcon
										message="创建 worktree 会执行 git worktree add，后续将接入统一命令审批。"
									/>
								</div>
							)}
						</div>
					</Form.Item>
				)}

				<Form.Item label="名称（可选）">
					<Input
						value={state.name}
						onChange={(e) =>
							setState((prev) => ({ ...prev, name: e.target.value }))
						}
						placeholder="留空则自动命名"
						maxLength={80}
					/>
				</Form.Item>

				<Form.Item
					label={
						<div className="flex items-center justify-between w-full">
							<span>绑定远端 IM Bot</span>
							<Switch
								size="small"
								checked={state.remoteEnabled}
								onChange={handleRemoteToggle}
							/>
						</div>
					}
				>
					{state.remoteEnabled && (
						<div className="flex flex-col gap-2">
							{runningBots.length === 0 ? (
								<div className="text-xs text-amber-500">
									没有正在运行的 IM Bot。请先在 IM Bot 页面启动一个机器人。
								</div>
							) : (
								<Select
									placeholder="选择一个运行中的 IM Bot"
									value={state.botId}
									onChange={(botId) => setState((prev) => ({ ...prev, botId }))}
									options={runningBots.map((b) => ({
										value: b.id,
										label: (
											<span>
												{b.name}
												<Tag color="blue" className="ml-2 text-xs">
													{PLATFORM_LABEL[b.type] || b.type}
												</Tag>
											</span>
										),
									}))}
								/>
							)}
							<Input
								placeholder="Chat ID（群组或会话 ID）"
								value={state.chatId}
								onChange={(e) =>
									setState((prev) => ({ ...prev, chatId: e.target.value }))
								}
								disabled={!state.botId}
							/>
						</div>
					)}
				</Form.Item>
			</Form>
			<Modal
				open={gitModalOpen}
				title="Git 图谱"
				onCancel={() => setGitModalOpen(false)}
				footer={null}
			>
				<div className="space-y-2 text-sm">
					<div>项目：{selectedProject?.name}</div>
					<div>路径：{selectedProject?.cwd}</div>
					<div>当前分支：{branchInfo?.branch ?? "未知"}</div>
					<div>Upstream：{branchInfo?.upstream ?? "无"}</div>
					<div>
						状态：
						{branchInfo?.dirty ? "有未提交修改" : "干净"}
						{branchInfo?.ahead ? ` · ahead ${branchInfo.ahead}` : ""}
						{branchInfo?.behind ? ` · behind ${branchInfo.behind}` : ""}
					</div>
					<Alert
						type="info"
						showIcon
						message="完整 commit DAG 和分支切换将在 Git 图谱 IPC 接入后显示。"
					/>
				</div>
			</Modal>
		</Modal>
	);
}
