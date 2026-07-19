/**
 * ProjectSettingsModal — Phase E-2
 *
 * 替代旧 `EditWorkspaceModal + WorkspaceRuntimeForm`。
 * - 基本信息: 改名、置顶（写 useProjectStore）
 * - 默认值: ProjectSettings sparse partial（写 projects.saveSettings）
 *
 * ProjectSettings 是 sparse 的：所有字段都可缺省，留空就走 app 全局默认。
 * 不再像旧 WorkspaceRuntimeForm 那样构造一份"全套"默认。
 */

import {
	Alert,
	Button,
	Checkbox,
	Form,
	Input,
	Modal,
	Radio,
	Select,
	Space,
	Spin,
	Switch,
	Tabs,
	message,
} from "antd";
import { ExclamationCircleFilled } from "@ant-design/icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
	ApprovalMode,
	InteractionProfile,
	ModelSelection,
	ProjectSettings,
	SandboxMode,
} from "@super-client/shared-types";
import { useModelStore } from "../../stores/modelStore";
import { useProjectStore } from "../../stores/projectStore";
import { deleteProjectWithCleanup } from "../../services/projectDeletionService";

const INTERACTION_PROFILE_OPTIONS: Array<{
	value: InteractionProfile;
	label: string;
	desc: string;
}> = [
	{ value: "hybrid", label: "Hybrid", desc: "兼顾对话与 Agent 流程（推荐）" },
	{
		value: "claude-code",
		label: "Claude Code",
		desc: "侧重 Agent 工程化执行的紧凑布局",
	},
	{ value: "codex", label: "Codex", desc: "侧重对话与代码补全的轻量布局" },
];

const APPROVAL_MODE_OPTIONS: Array<{
	value: ApprovalMode;
	label: string;
	desc: string;
}> = [
	{ value: "request", label: "请求审批", desc: "每次工具调用都需要确认" },
	{
		value: "auto-safe",
		label: "自动放行安全操作",
		desc: "只读类操作自动通过",
	},
	{
		value: "full-access",
		label: "完全放行（不推荐）",
		desc: "所有工具调用直接执行",
	},
];

const SANDBOX_MODE_OPTIONS: Array<{
	value: SandboxMode;
	label: string;
	desc: string;
}> = [
	{ value: "read-only", label: "只读", desc: "禁止任何文件写入" },
	{
		value: "workspace-write",
		label: "工作区可写",
		desc: "仅允许写入会话工作目录及配置的可写路径",
	},
	{
		value: "system-access",
		label: "系统级（需显式授权）",
		desc: "仅当主进程审批流程接入后可启用",
	},
];

interface ProjectSettingsModalProps {
	projectId: string | null;
	open: boolean;
	onClose: () => void;
}

export function ProjectSettingsModal({
	projectId,
	open,
	onClose,
}: ProjectSettingsModalProps) {
	const project = useProjectStore((s) =>
		projectId ? (s.projects.find((p) => p.id === projectId) ?? null) : null,
	);
	const renameProject = useProjectStore((s) => s.rename);
	const pinProject = useProjectStore((s) => s.pin);
	const providers = useModelStore((s) => s.providers);
	const [modal, modalContextHolder] = Modal.useModal();

	const [activeTab, setActiveTab] = useState<"basic" | "runtime">("basic");
	const [name, setName] = useState("");
	const [pinned, setPinned] = useState(false);
	const [settings, setSettings] = useState<ProjectSettings | null>(null);
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const load = useCallback(async () => {
		if (!projectId) return;
		setLoading(true);
		setError(null);
		try {
			const res = await window.electron.projects.getSettings(projectId);
			if (res.success && res.data) {
				setSettings(res.data);
			} else {
				setSettings({});
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
			setSettings({});
		} finally {
			setLoading(false);
		}
	}, [projectId]);

	useEffect(() => {
		if (!open || !project) return;
		setName(project.name);
		setPinned(!!project.pinned);
		setActiveTab("basic");
		void load();
	}, [open, project, load]);

	const modelOptions = useMemo(() => {
		const items: Array<{ label: string; value: string }> = [];
		for (const p of providers) {
			for (const m of p.models) {
				items.push({
					label: `${p.name} · ${m.name || m.id}`,
					value: `${p.id}||${m.id}`,
				});
			}
		}
		return items;
	}, [providers]);

	const handleSaveBasic = async () => {
		if (!project) return;
		setSaving(true);
		try {
			if (name.trim() && name.trim() !== project.name) {
				await renameProject(project.id, name.trim());
			}
			if (pinned !== !!project.pinned) {
				await pinProject(project.id, pinned);
			}
			message.success("已保存");
			onClose();
		} catch (err) {
			message.error(err instanceof Error ? err.message : String(err));
		} finally {
			setSaving(false);
		}
	};

	const handleDelete = useCallback(() => {
		if (!project) return;
		let keepFiles = false;
		modal.confirm({
			icon: <ExclamationCircleFilled style={{ color: "#ff4d4f" }} />,
			title: `删除项目"${project.name}"？`,
			width: 460,
			content: (
				<div className="space-y-3 mt-2">
					<p className="text-sm leading-relaxed">
						将删除该项目关联的所有会话、附件和工具产物。
						如果只想从列表中隐藏，请勾选保留磁盘文件。
					</p>
					<Checkbox
						defaultChecked={false}
						onChange={(e) => {
							keepFiles = e.target.checked;
						}}
					>
						<span className="text-[13px]">
							仅从项目列表移除，保留磁盘文件用于后续恢复
						</span>
					</Checkbox>
				</div>
			),
			okText: "删除项目数据",
			okButtonProps: { danger: true },
			cancelText: "取消",
			async onOk() {
				const res = await deleteProjectWithCleanup(project, {
					keepFiles,
				});
				if (res?.removed) {
					message.success(
						keepFiles ? "项目已移出列表（文件已保留）" : "项目数据已删除",
					);
					onClose();
				} else {
					message.error("删除失败");
				}
			},
		});
	}, [project, modal, onClose]);

	const handleSaveRuntime = async () => {
		if (!project || !settings) return;
		setSaving(true);
		try {
			const res = await window.electron.projects.saveSettings(
				project.id,
				settings,
			);
			if (res.success) {
				message.success("默认值已保存");
				onClose();
			} else {
				message.error(res.error || "保存失败");
			}
		} catch (err) {
			message.error(err instanceof Error ? err.message : String(err));
		} finally {
			setSaving(false);
		}
	};

	const selectedModelValue = settings?.defaultModel
		? `${settings.defaultModel.providerId}||${settings.defaultModel.modelId}`
		: undefined;

	const updateSettings = (patch: Partial<ProjectSettings>) => {
		// `s` is `ProjectSettings | null`; spreading null is a runtime no-op,
		// but TS requires the null-narrow, so the `?? {}` is required for the
		// type checker even though unicorn(no-useless-fallback-in-spread)
		// flags it. The runtime and TS views genuinely conflict here.
		// eslint-disable-next-line unicorn/no-useless-fallback-in-spread
		setSettings((s) => ({ ...(s ?? {}), ...patch }));
	};

	const updateRuntimePolicy = (
		patch: Partial<NonNullable<ProjectSettings["runtimePolicy"]>>,
	) => {
		setSettings((s) => ({
			// eslint-disable-next-line unicorn/no-useless-fallback-in-spread
			...(s ?? {}),
			runtimePolicy: {
				// eslint-disable-next-line unicorn/no-useless-fallback-in-spread
				...(s?.runtimePolicy ?? {}),
				...patch,
			},
		}));
	};

	if (!project) return null;

	return (
		<Modal
			title={`项目设置：${project.name}`}
			open={open}
			onCancel={onClose}
			width={640}
			destroyOnHidden
			footer={
				<div className="flex items-center justify-between">
					<Button danger type="text" onClick={handleDelete}>
						删除项目
					</Button>
					<div className="flex items-center gap-2">
						<Button onClick={onClose}>取消</Button>
						<Button
							type="primary"
							loading={saving}
							onClick={
								activeTab === "basic" ? handleSaveBasic : handleSaveRuntime
							}
						>
							保存
						</Button>
					</div>
				</div>
			}
		>
			{modalContextHolder}
			<Tabs
				activeKey={activeTab}
				onChange={(k) => setActiveTab(k as "basic" | "runtime")}
				items={[
					{
						key: "basic",
						label: "基本信息",
						children: (
							<Form layout="vertical" className="mt-2">
								<Form.Item label="项目名" help="留空时回退到 cwd 目录名">
									<Input
										value={name}
										onChange={(e) => setName(e.target.value)}
										maxLength={64}
									/>
								</Form.Item>
								<Form.Item label="工作目录 (cwd)">
									<Input value={project.cwd} disabled />
								</Form.Item>
								<Form.Item label="置顶">
									<Switch checked={pinned} onChange={setPinned} />
								</Form.Item>
							</Form>
						),
					},
					{
						key: "runtime",
						label: "默认值",
						children: loading ? (
							<div className="flex items-center justify-center py-8">
								<Spin />
							</div>
						) : error ? (
							<Alert
								type="error"
								showIcon
								message="加载项目设置失败"
								description={error}
								action={
									<Button size="small" onClick={() => void load()}>
										重试
									</Button>
								}
							/>
						) : settings ? (
							<Form layout="vertical" disabled={saving} className="mt-2">
								<Alert
									type="info"
									showIcon
									className="mb-3"
									message="所有字段都可留空：留空字段沿用 app 全局默认。"
								/>

								<Form.Item
									label="默认模型"
									help="留空表示沿用全局活跃模型；会话级覆盖优先于此"
								>
									<Select
										placeholder="选择 provider · model"
										value={selectedModelValue}
										options={modelOptions}
										allowClear
										showSearch
										optionFilterProp="label"
										onChange={(val) => {
											if (!val) {
												updateSettings({ defaultModel: undefined });
												return;
											}
											const [providerId, modelId] = (val as string).split("||");
											const next: ModelSelection = { providerId, modelId };
											updateSettings({ defaultModel: next });
										}}
									/>
								</Form.Item>

								<Form.Item label="交互档案">
									<Radio.Group
										value={settings.interactionProfile}
										onChange={(e) =>
											updateSettings({
												interactionProfile: e.target
													.value as InteractionProfile,
											})
										}
									>
										<Space direction="vertical">
											<Radio value={undefined}>
												<span className="text-slate-500">使用全局默认</span>
											</Radio>
											{INTERACTION_PROFILE_OPTIONS.map((opt) => (
												<Radio key={opt.value} value={opt.value}>
													<span className="font-medium">{opt.label}</span>
													<span className="text-slate-500 ml-2 text-xs">
														{opt.desc}
													</span>
												</Radio>
											))}
										</Space>
									</Radio.Group>
								</Form.Item>

								<Form.Item label="审批策略">
									<Radio.Group
										value={settings.runtimePolicy?.approvalMode}
										onChange={(e) =>
											updateRuntimePolicy({
												approvalMode: e.target.value as ApprovalMode,
											})
										}
									>
										<Space direction="vertical">
											<Radio value={undefined}>
												<span className="text-slate-500">使用全局默认</span>
											</Radio>
											{APPROVAL_MODE_OPTIONS.map((opt) => (
												<Radio key={opt.value} value={opt.value}>
													<span className="font-medium">{opt.label}</span>
													<span className="text-slate-500 ml-2 text-xs">
														{opt.desc}
													</span>
												</Radio>
											))}
										</Space>
									</Radio.Group>
								</Form.Item>

								<Form.Item label="沙箱策略">
									<Radio.Group
										value={settings.runtimePolicy?.sandboxMode}
										onChange={(e) =>
											updateRuntimePolicy({
												sandboxMode: e.target.value as SandboxMode,
											})
										}
									>
										<Space direction="vertical">
											<Radio value={undefined}>
												<span className="text-slate-500">使用全局默认</span>
											</Radio>
											{SANDBOX_MODE_OPTIONS.map((opt) => (
												<Radio
													key={opt.value}
													value={opt.value}
													disabled={opt.value === "system-access"}
												>
													<span className="font-medium">{opt.label}</span>
													<span className="text-slate-500 ml-2 text-xs">
														{opt.desc}
													</span>
												</Radio>
											))}
										</Space>
									</Radio.Group>
								</Form.Item>
							</Form>
						) : null,
					},
				]}
			/>
		</Modal>
	);
}
