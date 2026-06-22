/**
 * BranchPill —— 顶部标题栏里的「分支胶囊」按钮。
 *
 * 行为：
 *   - 仅在会话归属某个项目（resolveProjectRoot 拿到值）且项目是 git 仓库时显示。
 *     非项目会话 / 非 git 仓库 → 整个组件返回 null，不占位。
 *   - 显示当前分支名（detached HEAD 时显示前 7 位 sha 或 "HEAD"），dirty 时分支
 *     名右侧带一个 1px 的橙点提示。
 *   - 左键点击弹出 popover：搜索框 + 分支列表 + 「创建并检出新分支…」 + 「Git 图谱」。
 *
 * 数据加载策略：
 *   - 切换会话时同步发起一次 `getBranchInfo` 拿当前分支 / dirty / dirtyCount，
 *     popover 不打开也能在按钮上展示。
 *   - 打开 popover 时按需调用 `listBranches` 拿完整列表；关闭 popover 后清掉，
 *     下次重新打开会重新拉，确保外部（终端等）改了也能看到。
 *
 * 设计取舍：
 *   - "Git 图谱" 项目里没有现成视图，做成 disabled + tooltip"即将推出"，
 *     和其他类似的占位 UI（提交 / 推送）保持一致。
 *   - 切换 dirty 分支时与老 dropdown 行为一致：弹窗提示，不强制 force（要 force
 *     得用户先去终端 stash / commit）。
 *   - "右键菜单"在 UX 上被改成"左键打开 popover"——按钮上的 ⌄ 箭头是这个交互的
 *     视觉锚点，右键弹复杂面板会和系统右键菜单冲突且反直觉。
 */

import {
	CheckOutlined,
	DownOutlined,
	LoadingOutlined,
	NodeIndexOutlined,
	PlusOutlined,
	SearchOutlined,
} from "@ant-design/icons";
import { App, Input, Popover, theme } from "antd";
import type { InputRef } from "antd";
import * as React from "react";

import { gitService } from "../../services/gitService";
import type { GitBranchInfo } from "@super-client/shared-types/git";
import { GitGraphDrawer } from "./GitGraphDrawer";

const { useToken } = theme;

interface BranchPillProps {
	conversationId: string | null;
}

interface BranchRow {
	name: string;
	current: boolean;
}

/**
 * 自定义 "git branch" 图标 —— 比 antd 的 BranchesOutlined 更接近图中风格的
 * "三点连线"形态。size 默认 14，颜色取 currentColor，便于和文本色一起被覆盖。
 */
const BranchGlyph: React.FC<{ size?: number }> = ({ size = 14 }) => (
	<svg
		width={size}
		height={size}
		viewBox="0 0 16 16"
		fill="none"
		stroke="currentColor"
		strokeWidth="1.5"
		strokeLinecap="round"
		strokeLinejoin="round"
		aria-hidden="true"
	>
		<circle cx="4" cy="3" r="1.5" />
		<circle cx="4" cy="13" r="1.5" />
		<circle cx="12" cy="6" r="1.5" />
		<path d="M4 4.5v7" />
		<path d="M12 7.5v0.5a3 3 0 0 1-3 3H4" />
	</svg>
);

export const BranchPill: React.FC<BranchPillProps> = ({ conversationId }) => {
	const { token } = useToken();
	const { message: messageApi, modal: modalApi } = App.useApp();

	// project root 的解析结果。null 表示"非项目会话"或解析失败 —— 这两种情况
	// 都不展示胶囊（return null）。
	const [projectRoot, setProjectRoot] = React.useState<string | null>(null);
	const [branchInfo, setBranchInfo] = React.useState<GitBranchInfo | null>(null);
	const [open, setOpen] = React.useState(false);

	// popover 内的列表态。每次开 popover 都重新拉，确保外部变更可见。
	const [branches, setBranches] = React.useState<BranchRow[] | null>(null);
	const [branchesLoading, setBranchesLoading] = React.useState(false);
	const [branchesError, setBranchesError] = React.useState<string | null>(null);
	const [query, setQuery] = React.useState("");
	const searchRef = React.useRef<InputRef | null>(null);

	// "创建并检出新分支" 内嵌行的展开状态 + 输入值。
	const [creating, setCreating] = React.useState(false);
	const [newBranchName, setNewBranchName] = React.useState("");
	const [submittingCreate, setSubmittingCreate] = React.useState(false);
	const newBranchInputRef = React.useRef<InputRef | null>(null);

	// Git 图谱 drawer 开关
	const [graphOpen, setGraphOpen] = React.useState(false);

	// ─── 1. 解析 project root + 拉一次分支信息 ───────────────────────
	const refreshInfo = React.useCallback(async (id: string) => {
		const rootRes = await window.electron.cwd.resolveProjectRoot(id);
		const root = rootRes.success && rootRes.data ? rootRes.data : null;
		setProjectRoot(root);
		if (!root) {
			setBranchInfo(null);
			return;
		}
		const infoRes = await gitService.getBranchInfo(root);
		if (infoRes.success && infoRes.data) setBranchInfo(infoRes.data);
		else setBranchInfo(null);
	}, []);

	React.useEffect(() => {
		if (!conversationId) {
			setProjectRoot(null);
			setBranchInfo(null);
			return;
		}
		void refreshInfo(conversationId);
	}, [conversationId, refreshInfo]);

	// ─── 2. popover 打开时拉分支列表 ────────────────────────────────
	const loadBranches = React.useCallback(async () => {
		if (!projectRoot) return;
		setBranchesLoading(true);
		setBranchesError(null);
		try {
			const res = await gitService.listBranches(projectRoot);
			if (!res.success || !res.data) {
				setBranches([]);
				setBranchesError(res.error || "读取分支失败");
				return;
			}
			setBranches(res.data);
		} catch (err) {
			setBranches([]);
			setBranchesError(err instanceof Error ? err.message : String(err));
		} finally {
			setBranchesLoading(false);
		}
	}, [projectRoot]);

	const handleOpenChange = React.useCallback(
		(next: boolean) => {
			setOpen(next);
			if (next) {
				setQuery("");
				setCreating(false);
				setNewBranchName("");
				if (!branchesLoading) void loadBranches();
				// 让 focus 落到搜索框，键盘流可直接输入过滤。
				setTimeout(() => searchRef.current?.focus(), 50);
			} else {
				// 关闭后丢掉缓存，下次开重新拉
				setBranches(null);
				setBranchesError(null);
			}
		},
		[branchesLoading, loadBranches],
	);

	// ─── 3. 切换分支 ────────────────────────────────────────────────
	const doSwitch = React.useCallback(
		async (branch: string) => {
			if (!projectRoot) return;
			const hide = messageApi.loading(`切换到 ${branch}…`, 0);
			try {
				const res = await gitService.switchBranch(projectRoot, branch);
				hide();
				if (!res.success || !res.data) {
					messageApi.error(res.error || "切换失败");
					return;
				}
				const data = res.data;
				if (data.ok) {
					messageApi.success(`已切换到 ${branch}`);
					setOpen(false);
					if (conversationId) void refreshInfo(conversationId);
					return;
				}
				if (data.dirty) {
					modalApi.confirm({
						title: "工作区有未提交修改",
						content: `切换到 "${branch}" 会覆盖未提交的本地修改。建议先提交或 stash，再切换。`,
						okText: "知道了",
						cancelText: "取消",
					});
					return;
				}
				messageApi.error(data.error || "切换失败");
			} catch (err) {
				hide();
				messageApi.error(err instanceof Error ? err.message : String(err));
			}
		},
		[conversationId, messageApi, modalApi, projectRoot, refreshInfo],
	);

	// ─── 4. 创建并检出新分支 ────────────────────────────────────────
	const submitCreate = React.useCallback(async () => {
		if (!projectRoot) return;
		const name = newBranchName.trim();
		if (!name) {
			messageApi.warning("分支名不能为空");
			return;
		}
		setSubmittingCreate(true);
		try {
			const res = await gitService.createBranch(projectRoot, name);
			if (!res.success || !res.data) {
				messageApi.error(res.error || "创建失败");
				return;
			}
			if (!res.data.ok) {
				messageApi.error(res.data.error || "创建失败");
				return;
			}
			messageApi.success(`已创建并切换到 ${name}`);
			setCreating(false);
			setNewBranchName("");
			setOpen(false);
			if (conversationId) void refreshInfo(conversationId);
		} finally {
			setSubmittingCreate(false);
		}
	}, [
		conversationId,
		messageApi,
		newBranchName,
		projectRoot,
		refreshInfo,
	]);

	// ─── 5. 隐藏条件 ────────────────────────────────────────────────
	// 非项目会话 → 不展示胶囊。项目根存在但不是 git 仓库 → 同样不展示
	// （避免在不是项目的情况下展示一个"假"的分支按钮）。
	if (!conversationId || !projectRoot) return null;
	if (branchInfo && !branchInfo.isRepo) return null;

	const branchName = branchInfo?.branch || "—";
	const dirty = !!branchInfo?.dirty;
	const dirtyCount = branchInfo?.dirtyCount ?? 0;

	// ─── 6. popover 内容 ────────────────────────────────────────────
	const filtered = (branches ?? []).filter((b) =>
		query.trim() ? b.name.toLowerCase().includes(query.toLowerCase()) : true,
	);

	// 视觉常量（统一行高/圆角/字号，避免散落 magic number）
	const ROW_RADIUS = 8;
	const ROW_PAD_Y = 7;
	const ROW_PAD_X = 10;
	const SECTION_GUTTER = 8;
	const dividerColor = token.colorBorderSecondary;
	const subtleBg = token.colorFillTertiary;
	const hoverBg = token.colorBgTextHover;

	const popoverContent = (
		<div
			style={{
				width: 280,
				// 让 antd 默认 popover padding 失效，自己控制布局
				margin: -12,
				padding: "8px 6px",
			}}
		>
			{/* 搜索框 —— 胶囊圆角，深背景，无可见 border */}
			<div style={{ padding: "2px 4px 6px" }}>
				<Input
					ref={searchRef}
					prefix={
						<SearchOutlined
							style={{ color: token.colorTextTertiary, fontSize: 12 }}
						/>
					}
					placeholder="搜索分支"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					allowClear
					style={{
						borderRadius: 999,
						background: subtleBg,
						border: `1px solid ${dividerColor}`,
						height: 28,
						fontSize: 12,
					}}
					variant="borderless"
				/>
			</div>

			{/* 分隔 */}
			<div
				style={{
					height: 1,
					background: dividerColor,
					margin: `${SECTION_GUTTER - 2}px 4px ${SECTION_GUTTER - 4}px`,
				}}
			/>

			{/* "分支" section label */}
			<div
				style={{
					fontSize: 11,
					color: token.colorTextTertiary,
					padding: "2px 10px 6px",
					letterSpacing: 0.1,
				}}
			>
				分支
			</div>

			{/* 分支列表 */}
			<div
				style={{
					maxHeight: 240,
					overflowY: "auto",
					display: "flex",
					flexDirection: "column",
					gap: 2,
					padding: "0 4px",
				}}
			>
				{branchesLoading ? (
					<div
						style={{
							padding: `${ROW_PAD_Y}px ${ROW_PAD_X}px`,
							color: token.colorTextSecondary,
							fontSize: 12,
						}}
					>
						<LoadingOutlined /> 加载中…
					</div>
				) : branchesError ? (
					<div
						style={{
							padding: `${ROW_PAD_Y}px ${ROW_PAD_X}px`,
							color: token.colorTextTertiary,
							fontSize: 12,
						}}
					>
						{branchesError}
					</div>
				) : filtered.length === 0 ? (
					<div
						style={{
							padding: `${ROW_PAD_Y}px ${ROW_PAD_X}px`,
							color: token.colorTextTertiary,
							fontSize: 12,
						}}
					>
						{query ? "无匹配分支" : "暂无分支"}
					</div>
				) : (
					filtered.map((b) => {
						const isCurrent = b.current;
						const showDirty = isCurrent && dirty && dirtyCount > 0;
						return (
								<button
									key={b.name}
									type="button"
									onClick={() => {
										if (!isCurrent) void doSwitch(b.name);
									}}
									style={{
										display: "flex",
										alignItems: "center",
										gap: 10,
										width: "100%",
										padding: `${ROW_PAD_Y}px ${ROW_PAD_X}px`,
										borderRadius: ROW_RADIUS,
										border: "none",
										background: isCurrent ? subtleBg : "transparent",
										cursor: isCurrent ? "default" : "pointer",
										textAlign: "left",
										color: token.colorText,
										transition: "background 120ms",
									}}
									onMouseEnter={(e) => {
										if (!isCurrent) {
											e.currentTarget.style.background = hoverBg;
										}
									}}
									onMouseLeave={(e) => {
										if (!isCurrent) {
											e.currentTarget.style.background = "transparent";
										}
									}}
								>
									<span
										style={{
											color: token.colorTextSecondary,
											display: "flex",
											alignItems: "center",
										}}
									>
										<BranchGlyph size={13} />
									</span>
									<div
										style={{
											flex: 1,
											minWidth: 0,
											display: "flex",
											flexDirection: "column",
											gap: 1,
										}}
									>
										<span
											style={{
												fontSize: 13,
												fontWeight: isCurrent ? 500 : 400,
												overflow: "hidden",
												textOverflow: "ellipsis",
												whiteSpace: "nowrap",
												lineHeight: 1.3,
											}}
										>
											{b.name}
										</span>
										{showDirty && (
											<span
												style={{
													fontSize: 11,
													color: token.colorTextTertiary,
													lineHeight: 1.3,
												}}
											>
												未提交的更改：{dirtyCount} 个文件
											</span>
										)}
									</div>
									{isCurrent && (
										<CheckOutlined
											style={{ color: token.colorPrimary, fontSize: 12 }}
										/>
									)}
								</button>
						);
					})
				)}
			</div>

			{/* 分隔 */}
			<div
				style={{
					height: 1,
					background: dividerColor,
					margin: `${SECTION_GUTTER}px 4px`,
				}}
			/>

			{/* action 区 */}
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					gap: 2,
					padding: "0 4px",
				}}
			>
				{creating ? (
					<div
						style={{
							display: "flex",
							gap: 8,
							padding: `${ROW_PAD_Y - 1}px ${ROW_PAD_X}px`,
							alignItems: "center",
						}}
					>
						<PlusOutlined
							style={{ color: token.colorTextSecondary, fontSize: 12 }}
						/>
						<Input
							ref={newBranchInputRef}
							autoFocus
							placeholder="新分支名"
							value={newBranchName}
							onChange={(e) => setNewBranchName(e.target.value)}
							onPressEnter={() => void submitCreate()}
							onKeyDown={(e) => {
								if (e.key === "Escape") {
									setCreating(false);
									setNewBranchName("");
								}
							}}
							disabled={submittingCreate}
							style={{
								borderRadius: 8,
								background: subtleBg,
								border: `1px solid ${dividerColor}`,
								fontSize: 12,
								height: 26,
							}}
							variant="borderless"
						/>
					</div>
				) : (
					<ActionRow
						icon={<PlusOutlined />}
						label="创建并检出新分支…"
						onClick={() => {
							setCreating(true);
							setTimeout(() => newBranchInputRef.current?.focus(), 30);
						}}
						token={token}
					/>
				)}

				<ActionRow
					icon={<NodeIndexOutlined />}
					label="Git 图谱"
					onClick={() => {
						setOpen(false);
						setGraphOpen(true);
					}}
					token={token}
				/>
			</div>
		</div>
	);

	// ─── 7. 胶囊按钮本体 ────────────────────────────────────────────
	return (
		<>
			<Popover
				content={popoverContent}
				trigger="click"
				open={open}
				onOpenChange={handleOpenChange}
				placement="bottomLeft"
				arrow={false}
			>
				<button
					type="button"
					className="flex items-center gap-1.5 transition-colors"
					style={{
						height: 24,
						padding: "0 9px",
						borderRadius: 999,
						border: `1px solid ${token.colorBorderSecondary}`,
						background: open ? token.colorFillTertiary : "transparent",
						color: token.colorText,
						fontSize: 12,
						lineHeight: 1,
						cursor: "pointer",
						maxWidth: 200,
						fontWeight: 500,
					}}
					onMouseEnter={(e) => {
						if (!open) {
							e.currentTarget.style.background = token.colorFillQuaternary;
						}
					}}
					onMouseLeave={(e) => {
						if (!open) {
							e.currentTarget.style.background = "transparent";
						}
					}}
					aria-label={`当前分支 ${branchName}`}
					title={
						dirty
							? `${branchName}（${dirtyCount} 个未提交变更）`
							: branchName
					}
				>
					<BranchGlyph size={12} />
					<span
						style={{
							maxWidth: 130,
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap",
						}}
					>
						{branchName}
					</span>
					{dirty && (
						<span
							aria-hidden
							style={{
								width: 6,
								height: 6,
								borderRadius: 999,
								background: token.colorWarning,
								display: "inline-block",
								flexShrink: 0,
							}}
						/>
					)}
					<DownOutlined
						style={{
							fontSize: 8,
							opacity: 0.6,
							marginLeft: 1,
							color: token.colorTextSecondary,
						}}
					/>
				</button>
			</Popover>

			<GitGraphDrawer
				open={graphOpen}
				cwd={projectRoot}
				currentBranch={branchInfo?.branch}
				onClose={() => setGraphOpen(false)}
			/>
		</>
	);
};

/**
 * popover 内通用的 "图标 + 文本" 操作行。抽出来让创建分支 / Git 图谱共用样式。
 */
const ActionRow: React.FC<{
	icon: React.ReactNode;
	label: string;
	onClick: () => void;
	// avoid importing GlobalToken just for one param
	token: {
		colorText: string;
		colorTextSecondary: string;
		colorBgTextHover: string;
	};
}> = ({ icon, label, onClick, token }) => {
	return (
		<button
			type="button"
			onClick={onClick}
			style={{
				display: "flex",
				alignItems: "center",
				gap: 10,
				width: "100%",
				padding: "7px 10px",
				borderRadius: 8,
				border: "none",
				background: "transparent",
				cursor: "pointer",
				textAlign: "left",
				color: token.colorText,
				fontSize: 13,
				transition: "background 120ms",
			}}
			onMouseEnter={(e) => {
				e.currentTarget.style.background = token.colorBgTextHover;
			}}
			onMouseLeave={(e) => {
				e.currentTarget.style.background = "transparent";
			}}
		>
			<span
				style={{
					color: token.colorTextSecondary,
					display: "flex",
					alignItems: "center",
					fontSize: 13,
				}}
			>
				{icon}
			</span>
			{label}
		</button>
	);
};
