import { DownOutlined } from "@ant-design/icons";
import { Dropdown, Tooltip, message, theme } from "antd";
import type { MenuProps } from "antd";
import * as React from "react";
import { fileActionService } from "../../services/fileActionService";
import { useProjectStore } from "../../stores/projectStore";
import type { FileOpenTarget } from "../../types/electron";

const { useToken } = theme;

interface BadgeStyle {
	bg: string;
	glyph: string;
}

const BADGES: Record<string, BadgeStyle> = {
	vscode: { bg: "#0078d4", glyph: "<" },
	sublime: { bg: "#fb923c", glyph: "S" },
	finder: { bg: "#3b82f6", glyph: "F" },
	terminal: { bg: "#1f2937", glyph: ">_" },
	iterm: { bg: "#111827", glyph: ">$" },
	warp: { bg: "#a3a3a3", glyph: "▤" },
	xcode: { bg: "#3b82f6", glyph: "X" },
	"android-studio": { bg: "#3ddc84", glyph: "A" },
	cmd: { bg: "#1f2937", glyph: ">" },
	"gnome-terminal": { bg: "#1f2937", glyph: ">" },
};

const FALLBACK_BADGE: BadgeStyle = { bg: "#6b7280", glyph: "?" };

/** Letter-glyph fallback when an app icon isn't available. */
const TargetBadge: React.FC<{ id: string; size?: number }> = ({
	id,
	size = 18,
}) => {
	const style = BADGES[id] ?? FALLBACK_BADGE;
	return (
		<span
			aria-hidden
			style={{
				display: "inline-flex",
				alignItems: "center",
				justifyContent: "center",
				width: size,
				height: size,
				borderRadius: 4,
				background: style.bg,
				color: "#fff",
				fontSize: 10,
				fontWeight: 600,
				lineHeight: 1,
				flexShrink: 0,
			}}
		>
			{style.glyph}
		</span>
	);
};

/**
 * Real macOS app icon (PNG data URL fetched from main).
 * Falls back to <TargetBadge> while loading or when no icon is available.
 */
const AppIcon: React.FC<{ target: FileOpenTarget; size?: number }> = ({
	target,
	size = 18,
}) => {
	const [iconUrl, setIconUrl] = React.useState<string | null>(null);
	const [failed, setFailed] = React.useState(false);

	React.useEffect(() => {
		let cancelled = false;
		setIconUrl(null);
		setFailed(false);
		console.log(
			`[IdeAppSwitcher] AppIcon mount for target=${target.id} appPath=${target.appPath ?? "(none)"}`,
		);
		if (!target.appPath) {
			console.warn(
				`[IdeAppSwitcher] AppIcon: no appPath for target ${target.id}`,
			);
			return () => {
				cancelled = true;
			};
		}
		(async () => {
			try {
				const resp = await fileActionService.getAppIcon(target.appPath!);
				if (cancelled) return;
				console.log(
					`[IdeAppSwitcher] getAppIcon resp for ${target.id}: success=${resp.success} dataLen=${resp.data?.length ?? 0}`,
				);
				if (resp.success && resp.data) {
					setIconUrl(resp.data);
				} else {
					setFailed(true);
				}
			} catch (err) {
				console.warn(
					`[IdeAppSwitcher] getAppIcon threw for ${target.id}:`,
					err,
				);
				if (!cancelled) setFailed(true);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [target.appPath]);

	if (iconUrl && !failed) {
		return (
			<img
				src={iconUrl}
				width={size}
				height={size}
				alt=""
				style={{
					display: "inline-block",
					borderRadius: 4,
					flexShrink: 0,
					objectFit: "contain",
				}}
			/>
		);
	}
	return <TargetBadge id={target.id} size={size} />;
};

interface IdeAppSwitcherProps {
	conversationId?: string | null;
	workspaceId?: string;
}

export const IdeAppSwitcher: React.FC<IdeAppSwitcherProps> = ({
	conversationId,
	workspaceId,
}) => {
	const { token } = useToken();
	const [sandboxCwd, setSandboxCwd] = React.useState<string | null>(null);
	const [targets, setTargets] = React.useState<FileOpenTarget[]>([]);
	const [selectedId, setSelectedId] = React.useState<string | null>(null);

	// 项目会话优先用 project.cwd（真实根目录），casual 会话才回落到 per-session 沙箱。
	// 跟 ChatPage 的「工作目录」按钮保持同一心智，避免点开后看到的是沙箱。
	const projectId =
		workspaceId && workspaceId !== "default" ? workspaceId : null;
	const projectCwd = useProjectStore((s) =>
		projectId
			? (s.projects.find((p) => p.id === projectId)?.cwd ?? null)
			: null,
	);

	// Resolve sandbox cwd as fallback (only consumed when there is no project root).
	React.useEffect(() => {
		let cancelled = false;
		if (!conversationId || projectCwd) {
			setSandboxCwd(null);
			return () => {
				cancelled = true;
			};
		}
		(async () => {
			try {
				const resp =
					await window.electron.cwd.resolveSessionCwd(conversationId);
				if (cancelled) return;
				if (resp.success && resp.data) {
					setSandboxCwd(resp.data);
				} else {
					setSandboxCwd(null);
				}
			} catch {
				if (!cancelled) setSandboxCwd(null);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [conversationId, projectCwd]);

	const cwd = projectCwd ?? sandboxCwd;

	// Detect targets when cwd resolves.
	React.useEffect(() => {
		let cancelled = false;
		if (!cwd) {
			setTargets([]);
			return () => {
				cancelled = true;
			};
		}
		(async () => {
			try {
				const resp = await fileActionService.detectOpenTargets(
					cwd,
					workspaceId,
				);
				if (cancelled) return;
				if (resp.success && resp.data) {
					setTargets(resp.data);
				} else {
					setTargets([]);
				}
			} catch {
				if (!cancelled) setTargets([]);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [cwd, workspaceId]);

	// Initial selection: first editor or finder fallback.
	React.useEffect(() => {
		if (selectedId && targets.some((t) => t.id === selectedId)) return;
		if (targets.length === 0) {
			setSelectedId(null);
			return;
		}
		const firstEditor = targets.find((t) => t.kind === "editor");
		const finder = targets.find((t) => t.id === "finder");
		setSelectedId(firstEditor?.id ?? finder?.id ?? targets[0]?.id ?? null);
	}, [targets, selectedId]);

	const selectedTarget = React.useMemo(
		() => targets.find((t) => t.id === selectedId) ?? null,
		[targets, selectedId],
	);

	const handleSelect = React.useCallback(
		async (target: FileOpenTarget) => {
			setSelectedId(target.id);
			if (!cwd) return;
			try {
				const resp = await fileActionService.openWith(
					cwd,
					target.id,
					workspaceId,
				);
				if (resp.success && resp.data?.ok) {
					message.success(`已用 ${target.label} 打开`);
				} else {
					message.error(resp.data?.error || resp.error || "打开失败");
				}
			} catch (e) {
				message.error((e as Error).message || "打开失败");
			}
		},
		[cwd, workspaceId],
	);

	if (!conversationId) return null;
	if (!cwd) return null;
	if (targets.length === 0) return null;

	const items: MenuProps["items"] = targets.map((target) => ({
		key: target.id,
		label: (
			<span className="flex items-center gap-2">
				<AppIcon target={target} />
				<span>{target.label}</span>
			</span>
		),
		onClick: () => {
			void handleSelect(target);
		},
	}));

	const buttonLabel = selectedTarget?.label ?? "选择应用";

	return (
		<Tooltip title="使用应用打开工作目录" placement="bottom">
			<Dropdown menu={{ items }} trigger={["click"]} placement="bottomRight">
				<button
					type="button"
					className="flex items-center gap-1.5 px-2 rounded-md text-xs transition-colors hover:opacity-80"
					style={{
						height: 28,
						color: token.colorTextSecondary,
						border: `1px solid ${token.colorBorderSecondary}`,
						background: token.colorFillQuaternary,
					}}
					aria-label="选择打开应用"
				>
					{selectedTarget && <AppIcon target={selectedTarget} size={20} />}
					<span style={{ color: token.colorText }}>{buttonLabel}</span>
					<DownOutlined style={{ fontSize: 10, opacity: 0.6 }} />
				</button>
			</Dropdown>
		</Tooltip>
	);
};
