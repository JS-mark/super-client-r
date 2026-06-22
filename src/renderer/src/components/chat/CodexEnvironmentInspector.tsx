import {
	FileOutlined,
	FileImageOutlined,
	FileTextOutlined,
	FileMarkdownOutlined,
	FileZipOutlined,
	FileExcelOutlined,
	FileWordOutlined,
	FilePdfOutlined,
	CodeOutlined,
	PaperClipOutlined,
} from "@ant-design/icons";
import { Button, Collapse, Empty, Skeleton, Tag, theme } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useChatStore } from "../../stores/chatStore";
import { useChatMessageStore } from "../../stores/chatMessageStore";
import { useFileArtifactStore } from "../../stores/fileArtifactStore";
import { useAttachmentStore } from "../../stores/attachmentStore";
import { fileActionService } from "../../services/fileActionService";
import { runtimeService } from "../../services/runtimeService";
import { useCodexBranchSection } from "./CodexBranchSection";
import type { EffectiveSessionRuntime } from "@super-client/shared-types/chat";

export interface CodexEnvironmentInspectorProps {
	collapsed?: boolean;
	onCollapseToggle?: () => void;
}

const { useToken } = theme;

function pickFileIcon(extOrName: string | undefined): React.ReactNode {
	const ext = (extOrName ?? "").toLowerCase().replace(/^\./, "");
	if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(ext))
		return <FileImageOutlined />;
	if (["md", "markdown"].includes(ext)) return <FileMarkdownOutlined />;
	if (["zip", "tar", "gz", "rar", "7z"].includes(ext))
		return <FileZipOutlined />;
	if (["pdf"].includes(ext)) return <FilePdfOutlined />;
	if (["doc", "docx"].includes(ext)) return <FileWordOutlined />;
	if (["xls", "xlsx", "csv"].includes(ext)) return <FileExcelOutlined />;
	if (["txt", "log"].includes(ext)) return <FileTextOutlined />;
	if (
		[
			"ts",
			"tsx",
			"js",
			"jsx",
			"py",
			"go",
			"rs",
			"java",
			"c",
			"cpp",
			"h",
			"hpp",
			"json",
			"yaml",
			"yml",
			"toml",
			"sh",
			"rb",
			"php",
			"vue",
		].includes(ext)
	)
		return <CodeOutlined />;
	return <FileOutlined />;
}

function extOf(name: string): string {
	const idx = name.lastIndexOf(".");
	return idx >= 0 ? name.slice(idx + 1) : "";
}

function formatBytes(n?: number): string {
	if (n == null) return "";
	if (n < 1024) return `${n}B`;
	if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)}KB`;
	return `${(n / 1024 / 1024).toFixed(1)}MB`;
}

export function CodexEnvironmentInspector(_: CodexEnvironmentInspectorProps) {
	const { token } = useToken();
	const currentConversationId = useChatStore((s) => s.currentConversationId);
	const messages = useChatMessageStore((s) => s.messages);

	// Subscribe to artifact store so re-renders happen on store changes.
	const artifactsMap = useFileArtifactStore((s) => s.artifacts);
	const changeSetsMap = useFileArtifactStore((s) => s.changeSets);
	const { artifacts, changeSets } = useMemo(() => {
		if (!currentConversationId) return { artifacts: [], changeSets: [] };
		return {
			artifacts: artifactsMap[currentConversationId] ?? [],
			changeSets: changeSetsMap[currentConversationId] ?? [],
		};
	}, [artifactsMap, changeSetsMap, currentConversationId]);

	const attachments = useAttachmentStore((s) => s.attachments);

	// Resolve effective runtime on mount and when conversation changes.
	const [runtime, setRuntime] = useState<EffectiveSessionRuntime | null>(null);
	const [runtimeLoading, setRuntimeLoading] = useState(false);
	const [runtimeError, setRuntimeError] = useState<string | null>(null);
	useEffect(() => {
		let cancelled = false;
		if (!currentConversationId) {
			setRuntime(null);
			setRuntimeError(null);
			return;
		}
		setRuntimeLoading(true);
		setRuntimeError(null);
		runtimeService
			.resolveSession({ sessionId: currentConversationId })
			.then((res) => {
				if (cancelled) return;
				if (res.success && res.data) {
					setRuntime(res.data);
				} else {
					setRuntime(null);
					setRuntimeError(res.error ?? "无法获取运行时");
				}
			})
			.catch((err) => {
				if (cancelled) return;
				setRuntime(null);
				setRuntimeError(err instanceof Error ? err.message : String(err));
			})
			.finally(() => {
				if (!cancelled) setRuntimeLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [currentConversationId]);

	const branchSection = useCodexBranchSection(currentConversationId ?? null);

	// Latest user message → attachmentIds
	const latestAttachmentIds = useMemo(() => {
		for (let i = messages.length - 1; i >= 0; i--) {
			const m = messages[i];
			if (m.role === "user" && m.metadata?.attachmentIds?.length) {
				return m.metadata.attachmentIds;
			}
		}
		return [];
	}, [messages]);

	const totals = useMemo(() => {
		let additions = 0;
		let deletions = 0;
		let fileCount = 0;
		for (const cs of changeSets) {
			additions += cs.additions;
			deletions += cs.deletions;
			fileCount += cs.files.length;
		}
		if (fileCount === 0) fileCount = artifacts.length;
		return { additions, deletions, fileCount };
	}, [changeSets, artifacts.length]);

	const handleReveal = (path: string) => {
		fileActionService.reveal(path).catch(() => {});
	};

	const sectionHeaderStyle: React.CSSProperties = {
		fontSize: 12,
		fontWeight: 600,
		color: token.colorTextSecondary,
	};

	const rowStyle: React.CSSProperties = {
		display: "flex",
		alignItems: "center",
		gap: 8,
		fontSize: 12,
		padding: "4px 0",
		color: token.colorText,
	};

	// Section: Changes
	const changesContent =
		artifacts.length === 0 && changeSets.length === 0 ? (
			<Empty
				image={Empty.PRESENTED_IMAGE_SIMPLE}
				description={<span style={{ fontSize: 12 }}>暂无变更</span>}
				style={{ margin: "8px 0" }}
			/>
		) : (
			<div className="flex flex-col">
				<div
					style={{
						fontSize: 12,
						color: token.colorTextSecondary,
						marginBottom: 6,
					}}
				>
					{totals.additions === 0 && totals.deletions === 0
						? `${totals.fileCount} 个文件`
						: `${totals.fileCount} 个文件 · `}
					{(totals.additions !== 0 || totals.deletions !== 0) && (
						<>
							<span style={{ color: token.colorSuccess }}>
								+{totals.additions}
							</span>{" "}
							<span style={{ color: token.colorError }}>
								-{totals.deletions}
							</span>
						</>
					)}
				</div>
				{artifacts.map((a) => {
					const display = a.relativePath ?? a.path;
					return (
						<div key={a.id} style={rowStyle}>
							<span style={{ flexShrink: 0 }}>
								{pickFileIcon(a.extension ?? extOf(a.name))}
							</span>
							<span
								className="truncate"
								title={display}
								style={{ flex: 1, minWidth: 0 }}
							>
								{display}
							</span>
							<Button
								type="link"
								size="small"
								style={{ padding: 0, fontSize: 12 }}
								onClick={() => handleReveal(a.path)}
							>
								定位
							</Button>
						</div>
					);
				})}
				{changeSets.map((cs) =>
					cs.files.map((f, idx) => (
						<div key={`${cs.id}-${idx}`} style={rowStyle}>
							<span style={{ flexShrink: 0 }}>
								{pickFileIcon(extOf(f.path))}
							</span>
							<span
								className="truncate"
								title={f.path}
								style={{ flex: 1, minWidth: 0 }}
							>
								{f.path}
							</span>
							<span
								style={{ color: token.colorSuccess, fontSize: 11 }}
							>{`+${f.additions}`}</span>
							<span
								style={{ color: token.colorError, fontSize: 11 }}
							>{`-${f.deletions}`}</span>
							<Button
								type="link"
								size="small"
								style={{ padding: 0, fontSize: 12 }}
								onClick={() => handleReveal(f.path)}
							>
								定位
							</Button>
						</div>
					)),
				)}
			</div>
		);

	// Section: Runtime
	const runtimeRow = (label: string, value: string | undefined) => (
		<div
			style={{
				display: "flex",
				justifyContent: "space-between",
				alignItems: "center",
				fontSize: 12,
				padding: "4px 0",
				borderBottom: `1px dashed ${token.colorBorderSecondary}`,
			}}
		>
			<span style={{ color: token.colorTextSecondary }}>{label}</span>
			<span style={{ color: token.colorText }}>{value ?? "—"}</span>
		</div>
	);

	const runtimeContent = runtimeLoading ? (
		<Skeleton active paragraph={{ rows: 3 }} title={false} />
	) : runtimeError && !runtime ? (
		<div style={{ fontSize: 12, color: token.colorTextSecondary }}>—</div>
	) : runtime ? (
		<div className="flex flex-col">
			{runtimeRow("沙盒模式", runtime.runtimePolicy.sandboxMode)}
			{runtimeRow("审批模式", runtime.runtimePolicy.approvalMode)}
			{runtimeRow("Plan 模式", runtime.planMode)}
			{runtimeRow("交互画像", runtime.interactionProfile)}
		</div>
	) : (
		<div style={{ fontSize: 12, color: token.colorTextSecondary }}>—</div>
	);

	const branchHeader = (
		<div
			className="flex items-center justify-between"
			style={{ width: "100%" }}
		>
			<span style={sectionHeaderStyle}>分支</span>
			{branchSection.refreshButton}
		</div>
	);

	// Section: Sources & Context
	const sourcesContent =
		latestAttachmentIds.length === 0 ? (
			<div style={{ fontSize: 12, color: token.colorTextSecondary }}>
				暂无来源
			</div>
		) : (
			<div className="flex flex-col">
				{latestAttachmentIds.map((id) => {
					const att = attachments.find((a) => a.id === id);
					if (!att) {
						return (
							<div key={id} style={rowStyle}>
								<PaperClipOutlined />
								<Tag style={{ fontSize: 11 }}>{id}</Tag>
							</div>
						);
					}
					return (
						<div key={id} style={rowStyle}>
							<span style={{ flexShrink: 0 }}>
								{pickFileIcon(extOf(att.originalName ?? att.name))}
							</span>
							<span
								className="truncate"
								title={att.originalName ?? att.name}
								style={{ flex: 1, minWidth: 0 }}
							>
								{att.originalName ?? att.name}
							</span>
							<span style={{ color: token.colorTextSecondary, fontSize: 11 }}>
								{formatBytes(att.size)} · {att.type}
							</span>
						</div>
					);
				})}
			</div>
		);

	return (
		<aside
			className="hidden lg:flex flex-col h-full shrink-0"
			style={{
				width: 320,
				borderLeft: `1px solid ${token.colorBorderSecondary}`,
				backgroundColor: token.colorBgContainer,
			}}
		>
			<div
				className="flex items-center justify-between shrink-0 px-3"
				style={{
					height: 36,
					borderBottom: `1px solid ${token.colorBorderSecondary}`,
				}}
			>
				<span style={{ fontSize: 12, fontWeight: 600 }}>环境检视</span>
			</div>

			<div className="flex-1 overflow-auto px-2 py-1">
				<Collapse
					ghost
					defaultActiveKey={["changes", "runtime", "branch", "sources"]}
					items={[
						{
							key: "changes",
							label: <span style={sectionHeaderStyle}>变更</span>,
							children: changesContent,
						},
						{
							key: "runtime",
							label: <span style={sectionHeaderStyle}>运行时</span>,
							children: runtimeContent,
						},
						{
							key: "branch",
							label: branchHeader,
							children: branchSection.content,
						},
						{
							key: "sources",
							label: <span style={sectionHeaderStyle}>来源与上下文</span>,
							children: sourcesContent,
						},
					]}
				/>
			</div>
		</aside>
	);
}

export default CodexEnvironmentInspector;
