import { Check, Copy, WrapText } from "lucide-react";
import { type FC, memo, useCallback, useMemo, useState } from "react";
import { cn } from "../../lib/utils";
import { StaticHighlighter } from "./StaticHighlighter";
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
/**
 * Streaming fast path — rendered while the assistant is still emitting tokens
 * into this code block. Skips the full card's hooks (in particular the
 * per-render `code.replace(/\s+$/) ` + `split("\n")` over the whole content)
 * because those are O(N) and would fire on every chunk; for a 1k-line block
 * mid-stream that adds up to hundreds of thousands of string ops while the
 * user is just trying to read the reply.
 *
 * The toolbar isn't actionable during streaming anyway (line numbers shift
 * around, copy would grab an in-progress snippet), so we drop straight to
 * the lightweight `<pre><code>{code}</code></pre>` branch of
 * `SyntaxHighlighter`. When streaming flips off the parent unmounts this
 * subcomponent and mounts `FullCodeCard` for the post-stream UX.
 */
const StreamingCodeCard: FC<StructuredCodeCardProps> = ({
	code,
	language,
	path,
	className,
}) => (
	<section
		className={cn(
			"structured-code-card my-3 overflow-hidden rounded-lg border border-black/[0.08] bg-white dark:border-white/10 dark:bg-[#111318]",
			className,
		)}
	>
		<div className="px-2 py-2">
			<SyntaxHighlighter
				code={code ?? ""}
				language={language || getLanguageFromPath(path) || "code"}
				streaming
				showChrome={false}
				showLineNumbers={false}
				wrapLines
				trimCode={false}
				className="structured-code-highlighter"
			/>
		</div>
	</section>
);

const FullCodeCard: FC<StructuredCodeCardProps> = ({
	code,
	language,
	path,
	title,
	className,
}) => {
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
				displayLineCount > 0
					? `${displayLineCount} ${displayLineCount === 1 ? "line" : "lines"}`
					: "",
			[displayLineCount],
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
				<div className="flex min-w-0 items-center justify-between gap-3 border-b border-black/[0.06] px-2 py-1.5 dark:border-white/[0.06]">
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
				<div className="px-2 py-2">
					{/* Read-only highlight via highlight.js — replaces the
					    CodeMirror EditorView we used to spin up per code block.
					    Background: profiling on 2026-06-28 attributed the
					    chat-wide UI lag to react-window remounting batches of
					    EditorViews on scroll/session-switch (~30ms mount × 10+
					    blocks → multi-second long tasks). highlight.js renders
					    the entire block to an HTML string up-front, memoised by
					    (code, language); mount cost is dominated by a single
					    `dangerouslySetInnerHTML` call (~1ms). */}
					<StaticHighlighter
						code={displayCode}
						language={displayLanguage}
						wrapLines={wrapLines}
						showLineNumbers
						className="structured-code-highlighter"
					/>
				</div>
			</section>
		);
};

/**
 * Public entry. Dispatches between the streaming fast-path and the full
 * post-stream card. We split the two because the full card declares several
 * hooks (`useState` × 2, `useMemo` × 3, `useCallback` × 2) — the Rules of
 * Hooks forbid skipping them with an early `if (streaming) return …`, but
 * we *do* want to skip the O(N) memoised computations they wrap on the
 * streaming hot path. A wrapper component that picks which subtree to mount
 * is the idiomatic way to bypass an entire hook list conditionally; React
 * unmounts and remounts when `streaming` flips, which is exactly what we
 * want (the in-progress `<pre>` is replaced once by the rich CodeMirror
 * card when the assistant turn completes).
 *
 * Wrapped in `memo` so that parents which pass stable props (most call
 * sites) don't re-render the chrome when their own state changes.
 */
export const StructuredCodeCard: FC<StructuredCodeCardProps> = memo(
	function StructuredCodeCard(props) {
		return props.streaming ? (
			<StreamingCodeCard {...props} />
		) : (
			<FullCodeCard {...props} />
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
