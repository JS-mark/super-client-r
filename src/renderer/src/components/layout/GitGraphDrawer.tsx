/**
 * GitGraphDrawer —— 项目级 git 图谱视图（右侧 Drawer）。
 *
 * 功能：从 main 端拉最多 200 条 commit（topo order, all refs），渲染成
 * 「lane + commit 行」的 DAG 图谱。每行：
 *
 *     [lane SVG (固定 18*N px)]  [sha7]  [refs 标签]  [subject]  [author · 相对时间]
 *
 * Lane 算法（贪心）：
 *   1. 维护 `lanes: (sha | null)[]`，每个 lane 存它"下一步在等的 sha"。
 *   2. 处理新 commit C 时：
 *      a. 找出所有 lanes[k] === C.hash 的 k —— 这些 lane 在等 C
 *      b. 选最小的 k 作为 C 的渲染 lane；其它 k 在本行收束并 set null
 *      c. 若没有 lane 等 C → 新分配一个 lane（优先填 null slot 否则 append）
 *      d. 把 lanes[laneIdx] = C.parents[0]，让第一个父继续在原 lane 流下
 *      e. 对其余父 Pj：若已有 lane 在等 Pj → 不动；否则分配新 lane 等 Pj
 *   3. 记录这一行的 `lanesAbove` 和 `lanesBelow`，渲染时画线。
 *
 * 颜色：每条 lane 第一次出现时从 PALETTE 取一个颜色，按 lane 索引循环。
 *
 * 限制：
 *   - 不支持加载更多（200 条够看，再多了 lane 算法和滚动都吃力）；
 *   - 不抓 commit body / files —— 只展示标题行；
 *   - 没有点击交互（diff 视图属于另一个 epic）。
 */

import { CloseOutlined, ReloadOutlined } from "@ant-design/icons";
import { Button, Drawer, Empty, Skeleton, Tag, theme, Tooltip } from "antd";
import * as React from "react";

import { gitService } from "../../services/gitService";
import type { GitCommit } from "@super-client/shared-types/git";

const { useToken } = theme;

const PALETTE = [
	"#3B82F6", // blue
	"#10B981", // emerald
	"#F59E0B", // amber
	"#EF4444", // red
	"#8B5CF6", // violet
	"#EC4899", // pink
	"#06B6D4", // cyan
	"#84CC16", // lime
];

const LANE_WIDTH = 16;
const ROW_HEIGHT = 36;
const CIRCLE_R = 4.5;
const MAX_LANES_RENDERED = 8;

interface RowMeta {
	commit: GitCommit;
	laneIdx: number;
	lanesAbove: (string | null)[];
	lanesBelow: (string | null)[];
	laneColors: string[]; // 颜色按 lane 索引取
}

interface GitGraphDrawerProps {
	open: boolean;
	cwd: string | null;
	currentBranch?: string;
	onClose: () => void;
}

/**
 * 把 commit 数组转成带 lane 信息的渲染行。一次性算完，后续渲染只读。
 *
 * 复杂度 O(N * maxLanes)。N=200, maxLanes<=8，对前端足够便宜。
 */
function buildRows(commits: GitCommit[]): RowMeta[] {
	const rows: RowMeta[] = [];
	let lanes: (string | null)[] = [];
	const laneColors: string[] = []; // lane idx → color，长度只增不减

	const ensureColor = (k: number) => {
		while (laneColors.length <= k) {
			laneColors.push(PALETTE[laneColors.length % PALETTE.length]);
		}
	};

	const allocLane = (sha: string): number => {
		// 优先填 null slot
		const k = lanes.findIndex((v) => v === null);
		if (k >= 0) {
			lanes[k] = sha;
			ensureColor(k);
			return k;
		}
		lanes.push(sha);
		ensureColor(lanes.length - 1);
		return lanes.length - 1;
	};

	for (const commit of commits) {
		const lanesAbove = lanes.slice();

		// 1. 找所有等当前 commit 的 lane
		const incoming: number[] = [];
		for (let k = 0; k < lanes.length; k++) {
			if (lanes[k] === commit.hash) incoming.push(k);
		}

		let laneIdx: number;
		if (incoming.length === 0) {
			// 没人等 → 这是某条 ref 的最新 commit，分配新 lane
			laneIdx = allocLane(commit.hash); // 暂时把自己放进去占位
			// 紧接着我们会用第一个父覆盖它
		} else {
			laneIdx = incoming[0];
			// 关掉所有非主 lane 的 incoming
			for (let i = 1; i < incoming.length; i++) {
				lanes[incoming[i]] = null;
			}
		}

		// 2. 把 laneIdx 上的"期望"换成第一个父（没父就清空，让 lane 在下一行消失）
		const firstParent = commit.parents[0];
		lanes[laneIdx] = firstParent ?? null;

		// 3. 其余父：若已有 lane 等 → 不动；否则分配新 lane
		for (let i = 1; i < commit.parents.length; i++) {
			const p = commit.parents[i];
			const existing = lanes.findIndex((v) => v === p);
			if (existing < 0) allocLane(p);
		}

		// 4. 尾部空 lane 截断 —— 防止 lanes 数组越积越长
		while (lanes.length > 0 && lanes[lanes.length - 1] === null) {
			lanes.pop();
		}

		const lanesBelow = lanes.slice();

		// 颜色拷贝（截到 max(lanesAbove,lanesBelow) 长度）
		const maxLen = Math.max(lanesAbove.length, lanesBelow.length, laneIdx + 1);
		ensureColor(maxLen - 1);

		rows.push({
			commit,
			laneIdx,
			lanesAbove,
			lanesBelow,
			laneColors: laneColors.slice(0, maxLen),
		});
	}

	return rows;
}

/**
 * 把秒级 timestamp 渲染为「X 分钟前」/「X 小时前」/ 绝对日期 的友好串。
 * 没用 dayjs 是因为这里只需要这一个函数，避免再加一个全局依赖。
 */
function formatRelative(ts: number): string {
	if (!ts) return "";
	const diff = Date.now() / 1000 - ts;
	if (diff < 60) return "刚刚";
	if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
	if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
	if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} 天前`;
	const d = new Date(ts * 1000);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * 单行的 lane SVG。逻辑见文件头注释中的"渲染规则"：
 *   - 上半段（y: 0 → ROW/2）：把 lanesAbove 里 alive 的 lane 画到 commit 圆心或本 lane 底端
 *   - 下半段（y: ROW/2 → ROW）：把 lanesBelow 里 alive 的 lane 从 commit 圆心或本 lane 顶端画下去
 */
const LaneCell: React.FC<{ row: RowMeta }> = ({ row }) => {
	const { lanesAbove, lanesBelow, laneIdx, laneColors, commit } = row;
	const width = Math.min(
		Math.max(lanesAbove.length, lanesBelow.length, laneIdx + 1),
		MAX_LANES_RENDERED,
	) * LANE_WIDTH;
	const cx = (k: number) => k * LANE_WIDTH + LANE_WIDTH / 2;
	const cy = ROW_HEIGHT / 2;
	const commitX = cx(laneIdx);

	// 上半段：每个 alive lane 都有一条线进来
	const upperLines: React.ReactNode[] = [];
	lanesAbove.forEach((sha, k) => {
		if (!sha) return;
		if (k >= MAX_LANES_RENDERED) return;
		const color = laneColors[k] ?? PALETTE[0];
		if (sha === commit.hash) {
			// 这条 lane 在等当前 commit → 线收束到圆心
			upperLines.push(
				<line
					key={`u-${k}`}
					x1={cx(k)}
					y1={0}
					x2={commitX}
					y2={cy}
					stroke={color}
					strokeWidth={1.5}
				/>,
			);
		} else {
			// 这条 lane 路过当前行 → 直线穿过
			upperLines.push(
				<line
					key={`u-${k}`}
					x1={cx(k)}
					y1={0}
					x2={cx(k)}
					y2={cy}
					stroke={color}
					strokeWidth={1.5}
				/>,
			);
		}
	});

	// 下半段：每个 alive lane 都有一条线出去
	const lowerLines: React.ReactNode[] = [];
	lanesBelow.forEach((sha, k) => {
		if (!sha) return;
		if (k >= MAX_LANES_RENDERED) return;
		const color = laneColors[k] ?? PALETTE[0];
		const wasAboveSame = lanesAbove[k] === sha;
		if (k === laneIdx) {
			// 第一个父延续主 lane
			lowerLines.push(
				<line
					key={`l-${k}`}
					x1={commitX}
					y1={cy}
					x2={cx(k)}
					y2={ROW_HEIGHT}
					stroke={color}
					strokeWidth={1.5}
				/>,
			);
		} else if (!wasAboveSame) {
			// 新分配出来的 lane（merge 的额外父）→ 从 commit 圆心斜向到本 lane 底
			lowerLines.push(
				<line
					key={`l-${k}`}
					x1={commitX}
					y1={cy}
					x2={cx(k)}
					y2={ROW_HEIGHT}
					stroke={color}
					strokeWidth={1.5}
				/>,
			);
		} else {
			// 路过的 lane（上下同 sha，且不是 commit 所在 lane）→ 直线
			lowerLines.push(
				<line
					key={`l-${k}`}
					x1={cx(k)}
					y1={cy}
					x2={cx(k)}
					y2={ROW_HEIGHT}
					stroke={color}
					strokeWidth={1.5}
				/>,
			);
		}
	});

	const commitColor =
		(laneIdx < MAX_LANES_RENDERED ? laneColors[laneIdx] : null) ?? PALETTE[0];

	return (
		<svg
			width={width}
			height={ROW_HEIGHT}
			style={{ flexShrink: 0, display: "block" }}
		>
			{upperLines}
			{lowerLines}
			<circle
				cx={commitX}
				cy={cy}
				r={CIRCLE_R}
				fill={commitColor}
				stroke={commitColor}
				strokeWidth={1.5}
			/>
		</svg>
	);
};

export const GitGraphDrawer: React.FC<GitGraphDrawerProps> = ({
	open,
	cwd,
	currentBranch,
	onClose,
}) => {
	const { token } = useToken();
	const [commits, setCommits] = React.useState<GitCommit[] | null>(null);
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);

	const load = React.useCallback(async () => {
		if (!cwd) return;
		setLoading(true);
		setError(null);
		try {
			const res = await gitService.listCommits(cwd, { limit: 200 });
			if (!res.success || !res.data) {
				setCommits([]);
				setError(res.error || "读取提交历史失败");
				return;
			}
			setCommits(res.data);
		} catch (err) {
			setCommits([]);
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setLoading(false);
		}
	}, [cwd]);

	React.useEffect(() => {
		if (open && cwd) void load();
		if (!open) {
			// 关闭时清空，避免再开看到旧数据闪一下
			setCommits(null);
			setError(null);
		}
	}, [open, cwd, load]);

	const rows = React.useMemo<RowMeta[]>(
		() => (commits ? buildRows(commits) : []),
		[commits],
	);

	const refIsTag = (r: string) => r.startsWith("tag: ");
	const refLabel = (r: string) => (refIsTag(r) ? r.replace(/^tag:\s*/, "") : r);

	return (
		<Drawer
			open={open}
			onClose={onClose}
			placement="right"
			size={720}
			closeIcon={null}
			styles={{
				body: { padding: 0 },
				header: { display: "none" },
			}}
		>
			{/* 自绘头部 */}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					padding: "12px 16px",
					borderBottom: `1px solid ${token.colorBorderSecondary}`,
				}}
			>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 10,
					}}
				>
					<span
						style={{
							fontSize: 15,
							fontWeight: 600,
							color: token.colorText,
						}}
					>
						Git 图谱
					</span>
					{currentBranch && (
						<Tag color="blue" style={{ marginInlineEnd: 0 }}>
							{currentBranch}
						</Tag>
					)}
				</div>
				<div style={{ display: "flex", gap: 4 }}>
					<Tooltip title="刷新">
						<Button
							type="text"
							size="small"
							icon={<ReloadOutlined />}
							loading={loading}
							onClick={() => void load()}
						/>
					</Tooltip>
					<Button
						type="text"
						size="small"
						icon={<CloseOutlined />}
						onClick={onClose}
					/>
				</div>
			</div>

			{/* 主体 */}
			<div
				style={{
					height: "calc(100% - 53px)",
					overflowY: "auto",
					padding: "8px 0",
				}}
			>
				{loading && commits === null ? (
					<div style={{ padding: 16 }}>
						<Skeleton active paragraph={{ rows: 8 }} />
					</div>
				) : error ? (
					<Empty
						description={error}
						style={{ marginTop: 80, color: token.colorTextSecondary }}
					/>
				) : rows.length === 0 ? (
					<Empty description="暂无提交" style={{ marginTop: 80 }} />
				) : (
					rows.map((row) => {
						const c = row.commit;
						return (
							<div
								key={c.hash}
								style={{
									display: "flex",
									alignItems: "center",
									gap: 10,
									padding: "0 16px",
									height: ROW_HEIGHT,
									fontSize: 13,
									color: token.colorText,
								}}
							>
								<LaneCell row={row} />
								<code
									style={{
										fontSize: 12,
										color: token.colorTextTertiary,
										fontFamily:
											"ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
										flexShrink: 0,
										minWidth: 60,
									}}
								>
									{c.hash.slice(0, 7)}
								</code>
								{c.refs.length > 0 && (
									<div
										style={{
											display: "flex",
											gap: 4,
											flexShrink: 0,
											maxWidth: 220,
											overflow: "hidden",
										}}
									>
										{c.refs.slice(0, 4).map((r) => (
											<Tag
												key={r}
												color={refIsTag(r) ? "gold" : "blue"}
												style={{
													marginInlineEnd: 0,
													fontSize: 11,
													lineHeight: "18px",
													padding: "0 6px",
												}}
											>
												{refLabel(r)}
											</Tag>
										))}
									</div>
								)}
								<span
									style={{
										flex: 1,
										minWidth: 0,
										overflow: "hidden",
										textOverflow: "ellipsis",
										whiteSpace: "nowrap",
									}}
									title={c.subject}
								>
									{c.subject}
								</span>
								<span
									style={{
										fontSize: 12,
										color: token.colorTextTertiary,
										flexShrink: 0,
										maxWidth: 180,
										overflow: "hidden",
										textOverflow: "ellipsis",
										whiteSpace: "nowrap",
									}}
									title={`${c.author} · ${new Date(
										c.timestamp * 1000,
									).toLocaleString()}`}
								>
									{c.author} · {formatRelative(c.timestamp)}
								</span>
							</div>
						);
					})
				)}
			</div>
		</Drawer>
	);
};
