import { FolderOutlined } from "@ant-design/icons";
import { Tooltip } from "antd";
import { useTranslation } from "react-i18next";
import type { Project } from "@super-client/shared-types/project";

/**
 * Round-4 Codex-style composer §2 — ProjectPill (read-only slice).
 *
 * 编辑（切换项目、workspaceId 写回）是后续批次的工作；本轮仅承担展示：
 *   - 项目名 + `cwd` 尾段（例如 `super-client-r · super-client-r`）
 *   - 完整 cwd 展示在 Tooltip 中
 *   - `project == null`（casual session）时返回 null，让父容器完全隐藏 pill
 */

/** 抽出 cwd 尾段做 chip 副标签；无路径分隔符时回退到原字符串。 */
export function shortenCwd(cwd: string): string {
	if (!cwd) return "";
	// 允许 posix / windows 两种分隔符；trim 掉尾部 /
	const trimmed = cwd.replace(/[\\/]+$/, "");
	if (!trimmed) return "";
	const parts = trimmed.split(/[\\/]/);
	const last = parts[parts.length - 1];
	return last || trimmed;
}

/**
 * 组装 pill 的展示 label（外部可复用于测试与 Tooltip fallback）。
 * project == null → 返回 null，调用方据此隐藏整个 pill。
 */
export function getProjectPillLabel(
	project: Project | null | undefined,
): { name: string; suffix: string; cwd: string } | null {
	if (!project) return null;
	return {
		name: project.name,
		suffix: shortenCwd(project.cwd),
		cwd: project.cwd,
	};
}

export interface ProjectPillProps {
	project: Project | null | undefined;
	onClick?: () => void;
}

export function ProjectPill({ project, onClick }: ProjectPillProps) {
	const { t } = useTranslation();
	const label = getProjectPillLabel(project);
	if (!label) return null;

	const showSuffix = label.suffix && label.suffix !== label.name;
	const tooltipText = t("composer.projectPill.tooltip", "项目 · {{cwd}}", {
		ns: "chat",
		cwd: label.cwd,
	});

	return (
		<Tooltip title={tooltipText}>
			<button
				type="button"
				onClick={onClick}
				disabled={!onClick}
				className={`composer-pill${onClick ? " is-clickable" : ""}`}
				aria-label={tooltipText}
			>
				<FolderOutlined />
				<span>{label.name}</span>
				{showSuffix && (
					<span className="composer-pill-suffix" style={{ opacity: 0.6 }}>
						· {label.suffix}
					</span>
				)}
			</button>
		</Tooltip>
	);
}
