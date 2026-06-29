/**
 * StaticHighlighter — read-only syntax highlighting via highlight.js.
 *
 * Replaces the per-block CodeMirror `EditorView` we used to instantiate for
 * displaying historical code in chat. Profiling (2026-06-28) showed that
 * scrolling a chat with many code blocks produced ~3s long tasks because
 * react-window remounted batches of `EditorView`s as rows entered/left the
 * viewport — CodeMirror's mount cost (theme + syntaxHighlighting + bracket
 * matching + lineNumbers + foldGutter + Lezer parser) is ~30ms per block,
 * which destroys interactivity at 10+ blocks/frame. CodeMirror is an
 * *editor*; we only ever needed read-only display.
 *
 * highlight.js does the highlight once into an HTML string and renders via
 * a single `dangerouslySetInnerHTML`. Mount cost drops to ~1ms regardless of
 * code size, and the result is fully cacheable by (code, language).
 *
 * Line numbers are produced by splitting the highlighted HTML across `\n`
 * and rebalancing open `<span class="hljs-...">` tags so each visual line is
 * its own element — that lets a CSS counter render gutter numbers without
 * touching JS during scroll.
 */

import hljs from "highlight.js/lib/common";
import { type FC, useMemo } from "react";
import { cn } from "../../lib/utils";

// Markdown fence aliases → highlight.js canonical language ids. Mirrors the
// table that lived in `SyntaxHighlighter.tsx` for CodeMirror.
const LANG_ALIASES: Record<string, string> = {
	ts: "typescript",
	tsx: "typescript",
	js: "javascript",
	jsx: "javascript",
	typescriptreact: "typescript",
	javascriptreact: "javascript",
	zsh: "bash",
	shell: "bash",
	sh: "bash",
	"objective-c": "objectivec",
	objc: "objectivec",
	"c#": "csharp",
	cs: "csharp",
	golang: "go",
	rs: "rust",
	rb: "ruby",
	kt: "kotlin",
	hs: "haskell",
	erl: "erlang",
	ps1: "powershell",
	plaintext: "plaintext",
	text: "plaintext",
	txt: "plaintext",
};

function resolveLang(raw?: string): string | undefined {
	if (!raw) return undefined;
	const lower = raw.toLowerCase();
	const canonical = LANG_ALIASES[lower] ?? lower;
	// `getLanguage` returns undefined for unregistered languages — we use
	// that to fall back to plain text rather than letting highlight.js
	// throw on `highlight(code, { language: "??" })`.
	return hljs.getLanguage(canonical) ? canonical : undefined;
}

/**
 * Re-balance highlight.js output across line boundaries so each visual line
 * is one `<span class="hljs-line">…</span>`. The trick: any `<span>` that
 * was open across a `\n` must be closed before the line break and re-opened
 * after, otherwise the line wrapper would slice its content.
 *
 * Implementation walks the HTML once tracking a stack of open span attribute
 * strings. When we see `\n`, we close every open span, emit the line break,
 * start the next line wrapper, and re-emit the saved opens. Cost is O(N).
 */
function splitIntoLines(html: string): string[] {
	const lines: string[] = [];
	const openStack: string[] = []; // attribute strings of currently-open spans
	let current = "";
	let i = 0;
	while (i < html.length) {
		const ch = html[i];
		if (ch === "<") {
			// Look for the tag end. highlight.js output only emits `<span …>`
			// and `</span>` — no self-closing / nested tag types — so a
			// simple `indexOf(">")` suffices.
			const end = html.indexOf(">", i);
			if (end === -1) {
				// Malformed input; bail by treating remainder as literal.
				current += html.slice(i);
				break;
			}
			const tag = html.slice(i, end + 1);
			if (tag.startsWith("</")) {
				openStack.pop();
			} else {
				// Save just the attributes so we can re-emit on the next line.
				// e.g. `<span class="hljs-keyword">` → store `<span class="hljs-keyword">`.
				openStack.push(tag);
			}
			current += tag;
			i = end + 1;
		} else if (ch === "\n") {
			// Close every open span before the line break, push the line,
			// then re-open them on the next line so the colourisation
			// continues seamlessly.
			for (let s = openStack.length - 1; s >= 0; s--) current += "</span>";
			lines.push(current);
			current = openStack.join("");
			i++;
		} else {
			current += ch;
			i++;
		}
	}
	// Flush whatever's left on the final line (may have unclosed spans
	// because the source ended without a trailing `\n`). Close anything
	// still open to keep the markup balanced.
	for (let s = openStack.length - 1; s >= 0; s--) current += "</span>";
	lines.push(current);
	return lines;
}

export interface StaticHighlighterProps {
	code: string;
	language?: string;
	wrapLines?: boolean;
	showLineNumbers?: boolean;
	className?: string;
}

export const StaticHighlighter: FC<StaticHighlighterProps> = ({
	code,
	language,
	wrapLines = true,
	showLineNumbers = true,
	className,
}) => {
	// Highlight once per (code, language). React.memo on the parent (or this
	// component if needed) doesn't help by itself because the parent passes
	// new `code` strings during a streaming finalise — but once a message is
	// done the inputs are stable, so this useMemo absorbs every re-render
	// from unrelated state changes (theme toggle, wrap toggle, etc.).
	const linesHtml = useMemo(() => {
		const resolved = resolveLang(language);
		const raw = resolved
			? hljs.highlight(code, { language: resolved, ignoreIllegals: true })
					.value
			: // No registered language → render as plain text but still escape
				// HTML so we don't accidentally inject the user's code as markup.
				escapeHtml(code);
		return splitIntoLines(raw);
	}, [code, language]);

	return (
		<pre
			className={cn(
				"static-highlighter overflow-x-auto rounded-md text-[12.5px] leading-[1.55] font-mono",
        wrapLines && "whitespace-pre-wrap wrap-break-word",
				!wrapLines && "whitespace-pre",
				showLineNumbers && "static-highlighter--numbered",
				className,
			)}
		>
			<code className="hljs">
				{linesHtml.map((html, i) => (
					<span
						// Line index is the only stable key — splice/reorder isn't a
						// concern because the whole array reruns when `code` changes.
						// biome-ignore lint/suspicious/noArrayIndexKey: positional
						key={i}
						className="static-highlighter__line"
						data-line={i + 1}
						// highlight.js output is structurally simple (`<span class>`
						// wrappers) and balanced by `splitIntoLines`. Safe by audit.
						dangerouslySetInnerHTML={{ __html: html || " " }}
					/>
				))}
			</code>
		</pre>
	);
};

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}
