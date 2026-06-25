import { Check, Copy, WrapText } from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";
import type {
	ArtifactMessagePart,
	CodeBlockMessagePart,
	DataMessagePart,
	DiffMessagePart,
	MessagePart,
	SourcesMessagePart,
	StatusMessagePart,
	TableMessagePart,
	TreeMessagePart,
} from "@super-client/shared-types/chat";
import { cn } from "../../../lib/utils";
import { SyntaxHighlighter } from "../../markdown/SyntaxHighlighter";
import { TextPartRenderer } from "./TextPartRenderer";

export interface StreamPartRendererProps {
	part: MessagePart;
	streaming?: boolean;
}

export const StreamPartRenderer = memo(function StreamPartRenderer({
	part,
	streaming = false,
}: StreamPartRendererProps) {
	switch (part.type) {
		case "text":
			return <TextPartRenderer part={part} streaming={streaming} />;
		case "code_block":
			return <CodeBlockPartRenderer part={part} />;
		case "diff":
			return <DiffPartRenderer part={part} />;
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

function CodeBlockPartRenderer({ part }: { part: CodeBlockMessagePart }) {
	const [wrapLines, setWrapLines] = useState(false);
	const [copied, setCopied] = useState(false);
	const displayLanguage = part.language || getLanguageFromPath(part.path) || "code";
	const title = part.title || part.path || displayLanguage;
	const badge = getLanguageBadge(displayLanguage);
	const meta = useMemo(
		() =>
			[
				typeof part.lineCount === "number" ? `${part.lineCount} lines` : null,
				part.state === "streaming" ? "streaming" : null,
			]
				.filter(Boolean)
				.join(" · "),
		[part.lineCount, part.state],
	);

	const handleCopy = useCallback(async () => {
		await navigator.clipboard.writeText(part.content);
		setCopied(true);
		window.setTimeout(() => setCopied(false), 1500);
	}, [part.content]);

	const handleToggleWrap = useCallback(() => {
		setWrapLines((value) => !value);
	}, []);

	return (
		<section className="structured-code-card my-3 overflow-hidden rounded-2xl border border-black/10 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-white/10 dark:bg-[#111318]">
			<div className="flex min-w-0 items-center justify-between gap-4 px-5 py-4">
				<div className="flex min-w-0 items-center gap-3">
					<span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-[2px] bg-[#1495e8] px-1 text-[10px] font-bold uppercase leading-none text-white">
						{badge}
					</span>
					<div className="min-w-0">
						<div className="truncate font-mono text-lg font-semibold leading-6 text-[#202437] dark:text-white/90">
							{title}
						</div>
						{meta && (
							<div className="mt-0.5 text-xs text-[#7b8197] dark:text-white/45">
								{meta}
							</div>
						)}
					</div>
				</div>
				<div className="flex shrink-0 items-center gap-1.5">
					<CodeIconButton
						active={wrapLines}
						title={wrapLines ? "Disable line wrap" : "Enable line wrap"}
						onClick={handleToggleWrap}
					>
						<WrapText size={18} strokeWidth={2} />
					</CodeIconButton>
					<CodeIconButton title="Copy code" onClick={handleCopy}>
						{copied ? (
							<Check size={18} strokeWidth={2.2} />
						) : (
							<Copy size={18} strokeWidth={2} />
						)}
					</CodeIconButton>
				</div>
			</div>
			<div className="px-5 pb-5">
				<SyntaxHighlighter
					code={part.content}
					language={displayLanguage}
					streaming={part.state === "streaming"}
					showChrome={false}
					showLineNumbers={false}
					wrapLines={wrapLines}
					trimCode={false}
					className="structured-code-highlighter"
				/>
			</div>
		</section>
	);
}

function CodeIconButton({
	active = false,
	title,
	onClick,
	children,
}: {
	active?: boolean;
	title: string;
	onClick: () => void;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			aria-label={title}
			title={title}
			onClick={onClick}
			className={cn(
				"flex h-8 w-8 items-center justify-center rounded-md border-0 bg-transparent text-[#1f2433] transition-colors hover:bg-black/5 dark:text-white/75 dark:hover:bg-white/10",
				active && "bg-black/5 text-[#0b84d8] dark:bg-white/10 dark:text-[#61b7ff]",
			)}
		>
			{children}
		</button>
	);
}

function getLanguageBadge(language: string): string {
	const normalized = language.trim().toLowerCase();
	const aliases: Record<string, string> = {
		typescript: "TS",
		tsx: "TSX",
		javascript: "JS",
		jsx: "JSX",
		python: "PY",
		shell: "SH",
		bash: "SH",
		zsh: "SH",
		markdown: "MD",
		json: "JSON",
		yaml: "YAML",
	};
	const shortName = aliases[normalized] ?? normalized.slice(0, 4);
	return (shortName || "CODE").toUpperCase();
}

function getLanguageFromPath(path?: string): string | undefined {
	const extension = path?.split(".").pop()?.trim().toLowerCase();
	if (!extension || extension === path) return undefined;
	const aliases: Record<string, string> = {
		ts: "ts",
		tsx: "tsx",
		js: "js",
		jsx: "jsx",
		py: "python",
		md: "markdown",
		json: "json",
		yml: "yaml",
		yaml: "yaml",
		sh: "bash",
	};
	return aliases[extension] ?? extension;
}

function DiffPartRenderer({ part }: { part: DiffMessagePart }) {
	const fileCount = part.files.length;
	return (
		<PartShell title="Changes" meta={`${fileCount} file${fileCount === 1 ? "" : "s"}`}>
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
				{part.preview && <div className="whitespace-pre-wrap">{part.preview}</div>}
			</div>
		</PartShell>
	);
}

function StatusPartRenderer({ part }: { part: StatusMessagePart }) {
	return (
		<div className="my-2 rounded-md bg-black/5 px-3 py-2 text-xs dark:bg-white/10">
			<div className="font-medium">{part.label}</div>
			{part.detail && (
				<div className="mt-1 text-black/60 dark:text-white/60">{part.detail}</div>
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
