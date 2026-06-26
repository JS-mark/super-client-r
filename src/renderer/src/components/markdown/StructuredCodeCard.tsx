import { Check, Copy, WrapText } from "lucide-react";
import { type FC, memo, useCallback, useMemo, useState } from "react";
import { cn } from "../../lib/utils";
import { SyntaxHighlighter } from "./SyntaxHighlighter";

interface StructuredCodeCardProps {
	code: string;
	language?: string;
	path?: string;
	title?: string;
	streaming?: boolean;
	className?: string;
}

/**
 * Shared chrome for block-level code, used by both the structured
 * `code_block` message part renderer and the XMarkdown <code> override.
 *
 * Centralising the card here keeps the two paths visually identical when a
 * streaming assistant turn flips from "single text blob via XMarkdown" to
 * "structured parts" after completion.
 */
export const StructuredCodeCard: FC<StructuredCodeCardProps> = memo(
	function StructuredCodeCard({
		code,
		language,
		path,
		title,
		streaming = false,
		className,
	}) {
		// Default to wrap-on: chat bubbles are narrow, and long single lines
		// (URLs, shell pipelines, JSON) get a horizontal scrollbar that's awkward
		// to use inside a scrolling message list. User can still toggle off.
		const [wrapLines, setWrapLines] = useState(true);
		const [copied, setCopied] = useState(false);

		const displayLanguage = language || getLanguageFromPath(path) || "code";
		const displayTitle = title || path || displayLanguage;
		const badge = getLanguageBadge(displayLanguage);

		// Strip only trailing whitespace — markdown fences and tool outputs often
		// end with `\n`, which CodeMirror dutifully renders as a blank last line
		// (and inflates the line count by one). We don't `code.trim()` because
		// that would also remove intentional leading indentation in longer
		// snippets.
		const displayCode = useMemo(
			() => (code ?? "").replace(/[\s\uFEFF\xA0]+$/, ""),
			[code],
		);
		const displayLineCount = useMemo(
			() => (displayCode === "" ? 0 : displayCode.split("\n").length),
			[displayCode],
		);

		const meta = useMemo(
			() =>
				[
					displayLineCount > 0
						? `${displayLineCount} ${displayLineCount === 1 ? "line" : "lines"}`
						: null,
					streaming ? "streaming" : null,
				]
					.filter(Boolean)
					.join(" · "),
			[displayLineCount, streaming],
		);

		const handleCopy = useCallback(async () => {
			await navigator.clipboard.writeText(displayCode);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 1500);
		}, [displayCode]);

		const handleToggleWrap = useCallback(() => {
			setWrapLines((value) => !value);
		}, []);

		return (
			<section
				className={cn(
					"structured-code-card my-3 overflow-hidden rounded-lg border border-black/[0.08] bg-white dark:border-white/10 dark:bg-[#111318]",
					className,
				)}
			>
				{/*
				  Compact header — single row, ~32px tall. Title + meta sit on one
				  line; badge shrinks to 16px; action buttons are 24px with 14px
				  icons.
				*/}
				<div className="flex min-w-0 items-center justify-between gap-3 border-b border-black/[0.06] px-3 py-1.5 dark:border-white/[0.06]">
					<div className="flex min-w-0 items-center gap-2">
						<span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-[3px] bg-[#1495e8] px-1 text-[9px] font-bold uppercase leading-none text-white">
							{badge}
						</span>
						<span className="truncate font-mono text-[12.5px] font-medium leading-5 text-[#3b4252] dark:text-white/85">
							{displayTitle}
						</span>
						{meta && (
							<span className="shrink-0 text-[11px] text-black/40 dark:text-white/40">
								· {meta}
							</span>
						)}
					</div>
					<div className="flex shrink-0 items-center gap-0.5">
						<CodeIconButton
							active={wrapLines}
							title={wrapLines ? "Disable line wrap" : "Enable line wrap"}
							onClick={handleToggleWrap}
						>
							<WrapText size={14} strokeWidth={1.75} />
						</CodeIconButton>
						<CodeIconButton title="Copy code" onClick={handleCopy}>
							{copied ? (
								<Check size={14} strokeWidth={2} />
							) : (
								<Copy size={14} strokeWidth={1.75} />
							)}
						</CodeIconButton>
					</div>
				</div>
				<div className="px-3 py-2">
					<SyntaxHighlighter
						code={displayCode}
						language={displayLanguage}
						streaming={streaming}
						showChrome={false}
						showLineNumbers
						wrapLines={wrapLines}
						trimCode={false}
						className="structured-code-highlighter"
					/>
				</div>
			</section>
		);
	},
);

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
				"flex h-6 w-6 items-center justify-center rounded border-0 bg-transparent text-black/55 transition-colors hover:bg-black/[0.06] hover:text-black/80 dark:text-white/55 dark:hover:bg-white/[0.08] dark:hover:text-white/85",
				active &&
					"bg-black/[0.06] text-[#0b84d8] dark:bg-white/[0.08] dark:text-[#61b7ff]",
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
