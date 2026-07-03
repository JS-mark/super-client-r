import { memo, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
	ArtifactMessagePart,
	CodeBlockMessagePart,
	DataMessagePart,
	DiffMessagePart,
	MessagePart,
	SourcesMessagePart,
	StatusMessagePart,
	TableMessagePart,
	ToolMessagePart,
	TreeMessagePart,
} from "@super-client/shared-types/chat";
import type { SessionContentRefReadResult } from "../../../types/electron";
import { sessionContentRefService } from "../../../services/sessionContentRefService";
import { StructuredCodeCard } from "../../markdown/StructuredCodeCard";
import { SubagentPartCard } from "./SubagentPartCard";
import { TextPartRenderer } from "./TextPartRenderer";

export interface StreamPartRendererProps {
	part: MessagePart;
	streaming?: boolean;
	sessionId?: string;
}

export const StreamPartRenderer = memo(function StreamPartRenderer({
	part,
	streaming = false,
	sessionId,
}: StreamPartRendererProps) {
	if (hasContentRef(part)) {
		return <ReferencedContentPartRenderer part={part} sessionId={sessionId} />;
	}

	switch (part.type) {
		case "text":
			return <TextPartRenderer part={part} streaming={streaming} />;
		case "code_block":
			return <CodeBlockPartRenderer part={part} />;
		case "diff":
			return <DiffPartRenderer part={part} />;
		case "tool":
			return <ToolPartRenderer part={part} />;
		case "data":
			return <DataPartRenderer part={part} />;
		case "table":
			return <TablePartRenderer part={part} />;
		case "tree":
			return <TreePartRenderer part={part} />;
		case "sources":
			return <SourcesPartRenderer part={part} />;
		case "artifact":
			return <ArtifactPartRenderer part={part} />;
		case "status":
			return <StatusPartRenderer part={part} />;
		case "subagent":
			return <SubagentPartCard part={part} />;
		default:
			return <JsonFallback value={part} />;
	}
});

function PartShell({
	title,
	meta,
	children,
}: {
	title: string;
	meta?: string;
	children: React.ReactNode;
}) {
	return (
		<section className="my-2 overflow-hidden rounded-lg border border-black/10 bg-black/[0.02] text-sm dark:border-white/10 dark:bg-white/[0.03]">
			<div className="flex min-w-0 items-center justify-between gap-3 border-b border-black/10 px-3 py-2 dark:border-white/10">
				<div className="min-w-0 truncate font-medium">{title}</div>
				{meta && (
					<div className="shrink-0 text-xs text-black/45 dark:text-white/45">
						{meta}
					</div>
				)}
			</div>
			<div className="p-3">{children}</div>
		</section>
	);
}

function JsonFallback({ value }: { value: unknown }) {
	return (
		<pre className="max-w-full overflow-auto rounded-md bg-black/5 p-3 text-xs leading-5 dark:bg-white/10">
			{JSON.stringify(value, null, 2)}
		</pre>
	);
}

function hasContentRef(part: MessagePart): part is MessagePart & {
	contentRef: string;
} {
	return typeof part.contentRef === "string" && part.contentRef.length > 0;
}

type ContentRefLoadState =
	| { status: "idle" }
	| { status: "loading" }
	| { status: "loaded"; result: LoadedContentRefPreview }
	| { status: "metadata"; result: SessionContentRefReadResult }
	| { status: "error" };

interface LoadedContentRefPreview {
	contentRef: string;
	byteLength: number;
	mediaType?: string;
	source?: SessionContentRefReadResult["source"];
	textPreview: string;
	truncated: boolean;
}

const CONTENT_REF_PREVIEW_LIMIT = 20_000;

function ReferencedContentPartRenderer({
	part,
	sessionId,
}: {
	part: MessagePart & { contentRef: string };
	sessionId?: string;
}) {
	const { t } = useTranslation();
	const [loadState, setLoadState] = useState<ContentRefLoadState>({
		status: "idle",
	});
	const byteLength =
		typeof part.byteLength === "number" && Number.isFinite(part.byteLength)
			? Math.max(0, part.byteLength)
			: undefined;
	const canLoad = typeof sessionId === "string" && sessionId.length > 0;
	const loadedMeta =
		loadState.status === "loaded" || loadState.status === "metadata"
			? loadState.result
			: undefined;

	const handleLoadContent = useCallback(async () => {
		if (!canLoad) return;
		setLoadState({ status: "loading" });
		try {
			const response = await sessionContentRefService.read(
				sessionId,
				part.contentRef,
			);
			if (!response.success || !response.data) {
				setLoadState({ status: "error" });
				return;
			}

			if (typeof response.data.text !== "string") {
				setLoadState({ status: "metadata", result: response.data });
				return;
			}

			const textPreview = response.data.text.slice(0, CONTENT_REF_PREVIEW_LIMIT);
			setLoadState({
				status: "loaded",
				result: {
					contentRef: response.data.contentRef,
					byteLength: response.data.byteLength,
					textPreview,
					truncated: response.data.text.length > textPreview.length,
					...(response.data.mediaType
						? { mediaType: response.data.mediaType }
						: {}),
					...(response.data.source ? { source: response.data.source } : {}),
				},
			});
		} catch {
			setLoadState({ status: "error" });
		}
	}, [canLoad, part.contentRef, sessionId]);

	return (
		<PartShell
			title={referencedPartTitle(part)}
			meta={t("contentRef.meta", "referenced content", { ns: "chat" })}
		>
			<div className="flex flex-col gap-2 text-xs">
				<div className="text-black/60 dark:text-white/60">
					{t(
						"contentRef.summary",
						"Large content is stored outside the message body.",
						{ ns: "chat" },
					)}
				</div>
				<div className="grid gap-1.5">
					<div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2">
						<div className="text-black/45 dark:text-white/45">
							{t("contentRef.reference", "Reference", { ns: "chat" })}
						</div>
						<div className="break-all font-mono text-black/70 dark:text-white/70">
							{part.contentRef}
						</div>
					</div>
					{byteLength !== undefined && (
						<div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2">
							<div className="text-black/45 dark:text-white/45">
								{t("contentRef.size", "Size", { ns: "chat" })}
							</div>
							<div>{formatBytes(byteLength)}</div>
						</div>
					)}
					{part.truncated !== undefined && (
						<div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2">
							<div className="text-black/45 dark:text-white/45">
								{t("contentRef.status", "Status", { ns: "chat" })}
							</div>
							<div>
								{part.truncated
									? t("contentRef.truncated", "Truncated", { ns: "chat" })
									: t("contentRef.referenced", "Referenced", { ns: "chat" })}
							</div>
						</div>
					)}
					{loadedMeta?.mediaType && (
						<div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2">
							<div className="text-black/45 dark:text-white/45">
								{t("contentRef.mediaType", "Media type", { ns: "chat" })}
							</div>
							<div className="break-all font-mono">{loadedMeta.mediaType}</div>
						</div>
					)}
					{loadedMeta && (
						<div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2">
							<div className="text-black/45 dark:text-white/45">
								{t("contentRef.fullSize", "Full size", { ns: "chat" })}
							</div>
							<div>{formatBytes(loadedMeta.byteLength)}</div>
						</div>
					)}
				</div>
				{loadState.status === "loaded" && (
					<LoadedContentPreview part={part} result={loadState.result} />
				)}
				{loadState.status === "metadata" && (
					<ContentRefNotice
						title={t("contentRef.unavailableTitle", "Preview unavailable", {
							ns: "chat",
						})}
						detail={t(
							"contentRef.unavailableDetail",
							"Binary or non-text content cannot be previewed here.",
							{ ns: "chat" },
						)}
					/>
				)}
				{loadState.status === "error" && (
					<ContentRefNotice
						title={t("contentRef.errorTitle", "Content unavailable", {
							ns: "chat",
						})}
						detail={t(
							"contentRef.errorDetail",
							"The referenced content could not be loaded.",
							{ ns: "chat" },
						)}
					/>
				)}
				{loadState.status !== "loaded" && (
					<button
						type="button"
						onClick={handleLoadContent}
						disabled={!canLoad || loadState.status === "loading"}
						className="w-fit rounded-md border border-black/15 px-2.5 py-1 font-medium text-black/70 transition-colors hover:border-black/30 hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/15 dark:text-white/70 dark:hover:border-white/30 dark:hover:bg-white/10"
					>
						{loadState.status === "loading"
							? t("contentRef.loading", "Loading...", { ns: "chat" })
							: t("contentRef.load", "Load content", { ns: "chat" })}
					</button>
				)}
				{!canLoad && (
					<div className="text-black/45 dark:text-white/45">
						{t(
							"contentRef.missingSession",
							"Content can be loaded after the session is available.",
							{ ns: "chat" },
						)}
					</div>
				)}
			</div>
		</PartShell>
	);
}

function LoadedContentPreview({
	part,
	result,
}: {
	part: MessagePart;
	result: LoadedContentRefPreview;
}) {
	const { t } = useTranslation();
	const truncationNote = result.truncated
		? t(
				"contentRef.previewTruncated",
				"Showing the first {{count}} characters of {{size}}.",
				{
					ns: "chat",
					count: CONTENT_REF_PREVIEW_LIMIT,
					size: formatBytes(result.byteLength),
				},
			)
		: undefined;

	return (
		<div className="mt-2 flex flex-col gap-2">
			{part.type === "code_block" ? (
				<StructuredCodeCard
					code={result.textPreview}
					language={part.language}
					path={part.path}
					title={part.title}
					streaming={false}
				/>
			) : part.type === "text" ? (
				<TextPartRenderer
					part={{
						id: part.id,
						type: "text",
						state: part.state,
						createdAt: part.createdAt,
						updatedAt: part.updatedAt,
						content: result.textPreview,
						byteLength: result.byteLength,
						truncated: result.truncated,
					}}
				/>
			) : (
				<pre className="max-h-96 max-w-full overflow-auto rounded bg-black/5 p-2 text-xs leading-5 whitespace-pre-wrap dark:bg-white/10">
					{result.textPreview}
				</pre>
			)}
			{truncationNote && (
				<div className="text-black/45 dark:text-white/45">{truncationNote}</div>
			)}
		</div>
	);
}

function ContentRefNotice({
	title,
	detail,
}: {
	title: string;
	detail: string;
}) {
	return (
		<div className="rounded-md border border-black/10 bg-black/[0.03] px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]">
			<div className="font-medium text-black/70 dark:text-white/70">{title}</div>
			<div className="mt-1 text-black/50 dark:text-white/50">{detail}</div>
		</div>
	);
}

function referencedPartTitle(part: MessagePart): string {
	switch (part.type) {
		case "text":
			return "Text";
		case "code_block":
			return part.title || part.path || part.language || "Code";
		case "diff":
			return "Changes";
		case "tool":
			return part.name;
		case "data":
			return part.title || "Data";
		case "table":
			return part.title || "Table";
		case "tree":
			return part.title || "Tree";
		case "sources":
			return "Sources";
		case "artifact":
			return part.title || "Artifact";
		case "status":
			return part.label;
		case "plan":
			return part.plan.goal || "Plan";
		case "subagent":
			return part.run.profileName || part.run.taskGoal || "Subagent";
	}
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	const units = ["KB", "MB", "GB", "TB"];
	let value = bytes / 1024;
	let unitIndex = 0;
	while (value >= 1024 && unitIndex < units.length - 1) {
		value /= 1024;
		unitIndex += 1;
	}
	const formatted = Number.isInteger(value) ? String(value) : value.toFixed(1);
	return `${formatted} ${units[unitIndex]}`;
}

const PART_PREVIEW_LIMIT = 500;

function valuePreview(value: unknown): string {
	if (value === undefined) return "";
	if (typeof value === "string") {
		return value.length > PART_PREVIEW_LIMIT
			? `${value.slice(0, PART_PREVIEW_LIMIT)}...`
			: value;
	}
	if (
		value === null ||
		typeof value === "number" ||
		typeof value === "boolean"
	) {
		return String(value);
	}
	if (Array.isArray(value)) return `Array(${value.length})`;
	if (typeof value === "object") {
		const keys = Object.keys(value as Record<string, unknown>);
		return keys.length ? `{ ${keys.slice(0, 6).join(", ")} }` : "{}";
	}
	return String(value);
}

function CodeBlockPartRenderer({ part }: { part: CodeBlockMessagePart }) {
	return (
		<StructuredCodeCard
			code={part.content ?? ""}
			language={part.language}
			path={part.path}
			title={part.title}
			streaming={part.state === "streaming"}
		/>
	);
}

function DiffPartRenderer({ part }: { part: DiffMessagePart }) {
	const fileCount = part.files.length;
	return (
		<PartShell
			title="Changes"
			meta={`${fileCount} file${fileCount === 1 ? "" : "s"}`}
		>
			<div className="flex flex-col gap-3">
				{part.files.map((file) => (
					<div key={`${file.path}:${file.status}`} className="min-w-0">
						<div className="mb-1 flex min-w-0 items-center gap-2">
							<span className="rounded bg-black/5 px-1.5 py-0.5 text-xs font-medium uppercase dark:bg-white/10">
								{file.status}
							</span>
							<span className="truncate font-mono text-xs">{file.path}</span>
						</div>
						{file.hunks?.map((hunk, hunkIndex) => (
							<pre
								key={`${file.path}:${hunkIndex}`}
								className="max-w-full overflow-auto rounded bg-black/5 p-2 text-xs leading-5 dark:bg-white/10"
							>
								{[
									hunk.header,
									...hunk.lines.map((line) => {
										const prefix =
											line.type === "add"
												? "+"
												: line.type === "remove"
													? "-"
													: " ";
										return `${prefix}${line.content}`;
									}),
								]
									.filter(Boolean)
									.join("\n")}
							</pre>
						))}
					</div>
				))}
			</div>
		</PartShell>
	);
}

function ToolPartRenderer({ part }: { part: ToolMessagePart }) {
	const status =
		part.state === "executing"
			? "running"
			: part.state === "requires-approval"
				? "needs approval"
				: part.state;
	const output = part.error?.details ?? part.output;
	return (
		<PartShell title={part.name} meta={status}>
			<div className="flex flex-col gap-2 text-xs">
				{part.input && (
					<div>
						<div className="mb-1 font-medium text-black/55 dark:text-white/55">
							Input
						</div>
						<pre className="max-w-full overflow-auto rounded bg-black/5 p-2 leading-5 dark:bg-white/10">
							{valuePreview(part.input)}
						</pre>
					</div>
				)}
				{output !== undefined && (
					<div>
						<div className="mb-1 font-medium text-black/55 dark:text-white/55">
							{part.error ? "Error" : "Result"}
						</div>
						<pre className="max-w-full overflow-auto rounded bg-black/5 p-2 leading-5 dark:bg-white/10">
							{valuePreview(output)}
						</pre>
					</div>
				)}
				{part.duration !== undefined && (
					<div className="text-black/45 dark:text-white/45">
						{part.duration}ms
					</div>
				)}
			</div>
		</PartShell>
	);
}

function DataPartRenderer({ part }: { part: DataMessagePart }) {
	return (
		<PartShell title={part.title || "Data"} meta={part.format}>
			<JsonFallback value={part.value} />
		</PartShell>
	);
}

function TablePartRenderer({ part }: { part: TableMessagePart }) {
	return (
		<PartShell title={part.title || "Table"} meta={`${part.rows.length} rows`}>
			<div className="max-w-full overflow-auto">
				<table className="w-full border-collapse text-left text-xs">
					<thead>
						<tr>
							{part.columns.map((column) => (
								<th
									key={column}
									className="border-b border-black/10 px-2 py-1 font-medium dark:border-white/10"
								>
									{column}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{part.rows.map((row, rowIndex) => (
							<tr key={rowIndex}>
								{part.columns.map((column, columnIndex) => (
									<td
										key={`${rowIndex}:${column}`}
										className="border-b border-black/5 px-2 py-1 align-top dark:border-white/5"
									>
										{formatCell(row[columnIndex])}
									</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</PartShell>
	);
}

function TreePartRenderer({ part }: { part: TreeMessagePart }) {
	return (
		<PartShell title={part.title || "Tree"} meta={`${part.nodes.length} items`}>
			<ul className="m-0 flex list-none flex-col gap-1 p-0 text-xs">
				{part.nodes.map((node) => (
					<li key={node.id} className="min-w-0 truncate font-mono">
						<span className="mr-2 text-black/45 dark:text-white/45">
							{node.kind || "item"}
						</span>
						{node.label}
					</li>
				))}
			</ul>
		</PartShell>
	);
}

function SourcesPartRenderer({ part }: { part: SourcesMessagePart }) {
	return (
		<PartShell title="Sources" meta={`${part.sources.length}`}>
			<ol className="m-0 flex list-decimal flex-col gap-2 pl-4 text-xs">
				{part.sources.map((source) => (
					<li key={source.id} className="min-w-0">
						<div className="truncate font-medium">
							{source.title || source.path || source.url || source.id}
						</div>
						{(source.path || source.url) && (
							<div className="truncate font-mono text-black/50 dark:text-white/50">
								{source.path || source.url}
							</div>
						)}
						{source.snippet && (
							<div className="mt-1 line-clamp-2 text-black/60 dark:text-white/60">
								{source.snippet}
							</div>
						)}
					</li>
				))}
			</ol>
		</PartShell>
	);
}

function ArtifactPartRenderer({ part }: { part: ArtifactMessagePart }) {
	return (
		<PartShell title={part.title || "Artifact"} meta={part.artifactType}>
			<div className="flex flex-col gap-1 text-xs">
				<div className="font-mono text-black/60 dark:text-white/60">
					{part.ref || part.artifactId}
				</div>
				{part.preview && (
					<div className="whitespace-pre-wrap">{part.preview}</div>
				)}
			</div>
		</PartShell>
	);
}

function StatusPartRenderer({ part }: { part: StatusMessagePart }) {
	return (
		<div className="my-2 rounded-md bg-black/5 px-3 py-2 text-xs dark:bg-white/10">
			<div className="font-medium">{part.label}</div>
			{part.detail && (
				<div className="mt-1 text-black/60 dark:text-white/60">
					{part.detail}
				</div>
			)}
			{typeof part.progress === "number" && (
				<div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
					<div
						className="h-full rounded-full bg-blue-500"
						style={{ width: `${Math.max(0, Math.min(100, part.progress))}%` }}
					/>
				</div>
			)}
		</div>
	);
}

function formatCell(value: unknown): string {
	if (value === null || value === undefined) return "";
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}
	return JSON.stringify(value);
}
