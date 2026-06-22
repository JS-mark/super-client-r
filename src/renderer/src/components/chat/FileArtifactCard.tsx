import {
	CodeOutlined,
	FileImageOutlined,
	FileOutlined,
	FilePdfOutlined,
	FileTextOutlined,
	FileZipOutlined,
	MoreOutlined,
} from "@ant-design/icons";
import { App, Button, Card, Dropdown, Tag, Tooltip } from "antd";
import type { MenuProps } from "antd";
import type * as React from "react";
import { useCallback, useMemo, useState } from "react";
import { fileActionService } from "../../services/fileActionService";
import type { ChatFileArtifact, FileOpenTarget } from "../../types/electron";

interface FileArtifactCardProps {
	artifact: ChatFileArtifact;
}

const KIND_LABELS: Record<ChatFileArtifact["kind"], string> = {
	created: "创建",
	modified: "修改",
	read: "读取",
	referenced: "引用",
	attached: "附件",
};

const KIND_COLORS: Record<ChatFileArtifact["kind"], string> = {
	created: "green",
	modified: "blue",
	read: "default",
	referenced: "purple",
	attached: "cyan",
};

const IMAGE_EXTS = new Set([
	"png",
	"jpg",
	"jpeg",
	"gif",
	"webp",
	"svg",
	"bmp",
	"ico",
]);
const TEXT_EXTS = new Set(["txt", "md", "log", "csv", "rst"]);
const CODE_EXTS = new Set([
	"ts",
	"tsx",
	"js",
	"jsx",
	"mjs",
	"cjs",
	"py",
	"go",
	"rs",
	"java",
	"c",
	"cpp",
	"h",
	"hpp",
	"cs",
	"rb",
	"php",
	"swift",
	"kt",
	"sh",
	"bash",
	"zsh",
	"json",
	"yaml",
	"yml",
	"toml",
	"html",
	"css",
	"scss",
	"sass",
	"less",
	"vue",
]);
const ARCHIVE_EXTS = new Set(["zip", "tar", "gz", "rar", "7z", "bz2", "xz"]);

function pickIcon(extension: string | undefined): React.ReactNode {
	const ext = (extension ?? "").toLowerCase().replace(/^\./, "");
	if (!ext) return <FileOutlined />;
	if (ext === "pdf") return <FilePdfOutlined />;
	if (IMAGE_EXTS.has(ext)) return <FileImageOutlined />;
	if (CODE_EXTS.has(ext)) return <CodeOutlined />;
	if (TEXT_EXTS.has(ext)) return <FileTextOutlined />;
	if (ARCHIVE_EXTS.has(ext)) return <FileZipOutlined />;
	return <FileOutlined />;
}

export const FileArtifactCard: React.FC<FileArtifactCardProps> = ({
	artifact,
}) => {
	const { message } = App.useApp();
	const [openTargets, setOpenTargets] = useState<FileOpenTarget[] | null>(null);
	const [targetsLoading, setTargetsLoading] = useState(false);

	const icon = useMemo(
		() => pickIcon(artifact.extension),
		[artifact.extension],
	);

	const handleOpen = useCallback(async () => {
		const result = await fileActionService.open(artifact.path);
		if (!result.success) {
			message.error(result.error ?? "打开失败");
			return;
		}
		const data = result.data;
		if (data && data.ok === false) {
			message.error(data.error ?? "打开失败");
		}
	}, [artifact.path, message]);

	const handleReveal = useCallback(async () => {
		const result = await fileActionService.reveal(artifact.path);
		if (!result.success) {
			message.error(result.error ?? "操作失败");
			return;
		}
		const data = result.data;
		if (data && data.ok === false) {
			message.error(data.error ?? "操作失败");
		}
	}, [artifact.path, message]);

	const handleCopyPath = useCallback(async () => {
		const result = await fileActionService.copyPath(artifact.path);
		if (!result.success) {
			message.error(result.error ?? "复制失败");
			return;
		}
		const data = result.data;
		if (data && data.ok === false) {
			message.error(data.error ?? "复制失败");
			return;
		}
		message.success("路径已复制");
	}, [artifact.path, message]);

	const handleOpenWithTarget = useCallback(
		async (_targetId: string) => {
			// TODO(§19+): wire per-app open once main supports it.
			await handleOpen();
		},
		[handleOpen],
	);

	const loadOpenTargets = useCallback(async () => {
		if (openTargets !== null || targetsLoading) return;
		setTargetsLoading(true);
		try {
			const result = await fileActionService.detectOpenTargets(artifact.path);
			if (result.success && result.data) {
				setOpenTargets(result.data);
			} else {
				setOpenTargets([]);
			}
		} catch {
			setOpenTargets([]);
		} finally {
			setTargetsLoading(false);
		}
	}, [artifact.path, openTargets, targetsLoading]);

	const handleDropdownOpenChange = useCallback(
		(open: boolean) => {
			if (open) {
				void loadOpenTargets();
			}
		},
		[loadOpenTargets],
	);

	const menuItems = useMemo<MenuProps["items"]>(() => {
		const targetItems: MenuProps["items"] = targetsLoading
			? [{ key: "targets-loading", label: "加载中…", disabled: true }]
			: openTargets && openTargets.length > 0
				? openTargets.map((t) => ({
						key: `target-${t.id}`,
						label: t.label,
						disabled: !t.available,
						onClick: () => {
							void handleOpenWithTarget(t.id);
						},
					}))
				: [{ key: "targets-empty", label: "无可用应用", disabled: true }];

		return [
			{
				key: "reveal",
				label: "在系统中显示",
				disabled: artifact.policy.canReveal === false,
				onClick: () => {
					void handleReveal();
				},
			},
			{
				key: "copy-path",
				label: "复制路径",
				onClick: () => {
					void handleCopyPath();
				},
			},
			{
				key: "open-with",
				label: "用应用打开",
				children: targetItems,
			},
			{
				key: "diff",
				label: (
					<Tooltip title="尚未实现" placement="left">
						<span>查看差异</span>
					</Tooltip>
				),
				disabled: true,
			},
			{
				key: "attach",
				label: (
					<Tooltip title="尚未实现" placement="left">
						<span>作为附件引用</span>
					</Tooltip>
				),
				disabled: true,
			},
		];
	}, [
		artifact.policy.canReveal,
		handleCopyPath,
		handleOpenWithTarget,
		handleReveal,
		openTargets,
		targetsLoading,
	]);

	const extLabel = artifact.extension
		? artifact.extension.replace(/^\./, "")
		: "no ext";
	const pathLabel = artifact.relativePath ?? artifact.path;
	const canOpen = artifact.policy.canOpen !== false;

	const openButton = (
		<Button
			type="primary"
			size="small"
			disabled={!canOpen}
			onClick={() => {
				void handleOpen();
			}}
		>
			打开
		</Button>
	);

	return (
		<Card size="small" className="my-1">
			<div className="flex items-center gap-3">
				<div className="text-2xl text-slate-500 shrink-0">{icon}</div>
				<div className="flex-1 min-w-0">
					<div className="font-semibold truncate">{artifact.name}</div>
					<div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
						<Tag color={KIND_COLORS[artifact.kind]}>
							{KIND_LABELS[artifact.kind]}
						</Tag>
						<span>{extLabel}</span>
						<span>·</span>
						<span className="truncate" title={pathLabel}>
							{pathLabel}
						</span>
					</div>
				</div>
				<div className="flex items-center gap-1 shrink-0">
					{canOpen ? (
						openButton
					) : (
						<Tooltip title="不允许打开">{openButton}</Tooltip>
					)}
					<Dropdown
						menu={{ items: menuItems }}
						trigger={["click"]}
						onOpenChange={handleDropdownOpenChange}
					>
						<Button size="small" type="text" icon={<MoreOutlined />} />
					</Dropdown>
				</div>
			</div>
		</Card>
	);
};
