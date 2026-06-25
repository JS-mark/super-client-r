import { DownOutlined, UpOutlined } from "@ant-design/icons";
import {
	bracketMatching,
	defaultHighlightStyle,
	foldGutter,
	syntaxHighlighting,
} from "@codemirror/language";
import { EditorState, type Extension } from "@codemirror/state";
import {
	EditorView,
	highlightSpecialChars,
	lineNumbers,
} from "@codemirror/view";
import {
	type LanguageName,
	loadLanguage,
} from "@uiw/codemirror-extensions-langs";
import { vscodeDark, vscodeLight } from "@uiw/codemirror-theme-vscode";
import { theme } from "antd";
import {
	type FC,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { cn } from "../../lib/utils";
import { useThemeStore } from "../../stores/themeStore";
import { CopyButton } from "./CopyButton";

const { useToken } = theme;

const COLLAPSED_MAX_HEIGHT = 300;

// Markdown fence names → @uiw/codemirror-extensions-langs keys.
const LANG_ALIASES: Record<string, LanguageName> = {
	python: "py",
	typescript: "ts",
	javascript: "js",
	typescriptreact: "tsx",
	javascriptreact: "jsx",
	shell: "bash",
	zsh: "bash",
	"c#": "cs",
	"objective-c": "m",
	objc: "m",
	golang: "go",
	rust: "rs",
	ruby: "rb",
	kotlin: "kt",
	haskell: "hs",
	erlang: "erl",
	powershell: "ps1",
	plaintext: "text",
};

function resolveLangName(language: string): LanguageName {
	const lower = language.toLowerCase();
	return (LANG_ALIASES[lower] ?? lower) as LanguageName;
}

interface SyntaxHighlighterProps {
	code: string;
	language?: string;
	streaming?: boolean;
	showChrome?: boolean;
	showLineNumbers?: boolean;
	wrapLines?: boolean;
	trimCode?: boolean;
	className?: string;
}

export const SyntaxHighlighter: FC<SyntaxHighlighterProps> = ({
	code,
	language,
	streaming = false,
	showChrome = true,
	showLineNumbers = true,
	wrapLines = true,
	trimCode = true,
	className,
}) => {
	const { token } = useToken();
	const actualTheme = useThemeStore((s) => s.actualTheme);
	const [collapsed, setCollapsed] = useState(true);
	const [overflows, setOverflows] = useState(false);
	const wrapperRef = useRef<HTMLDivElement>(null);
	const editorRef = useRef<HTMLDivElement>(null);
	const viewRef = useRef<EditorView | null>(null);

	const getCode = useCallback(() => code, [code]);
	const displayLang = language || "code";

	const handleToggle = useCallback(() => {
		setCollapsed((prev) => !prev);
	}, []);

	// Build all extensions ourselves – bypasses @uiw/react-codemirror entirely.
	const extensions = useMemo(() => {
		const exts: Extension[] = [
			// Theme (includes EditorView.theme + syntaxHighlighting with highlight style)
			actualTheme === "dark" ? vscodeDark : vscodeLight,
			// Fallback highlight style for any token the theme misses
			syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
			highlightSpecialChars(),
			bracketMatching(),
			// Read-only
			EditorState.readOnly.of(true),
			EditorView.editable.of(false),
		];

		if (wrapLines) {
			exts.push(EditorView.lineWrapping);
		}

		if (showLineNumbers) {
			exts.push(lineNumbers());
			exts.push(
				foldGutter({
					markerDOM(open) {
						const span = document.createElement("span");
						span.className = `cm-fold-marker ${open ? "cm-fold-open" : "cm-fold-closed"}`;
						span.textContent = open ? "\u25BE" : "\u25B8";
						return span;
					},
				}),
			);
		}

		// Language parser (provides tokens for highlighting + fold ranges)
		if (language) {
			const langName = resolveLangName(language);
			const langExt = loadLanguage(langName);
			if (langExt) exts.push(langExt);
		}

		return exts;
	}, [language, actualTheme, showLineNumbers, wrapLines]);

	// Create / destroy EditorView directly (no @uiw wrapper)
	useEffect(() => {
		const container = editorRef.current;
		if (!container) return;

		const view = new EditorView({
			state: EditorState.create({
				doc: trimCode ? code.trim() : code,
				extensions,
			}),
			parent: container,
		});

		viewRef.current = view;

		// Measure overflow after view renders
		requestAnimationFrame(() => {
			if (wrapperRef.current) {
				setOverflows(wrapperRef.current.scrollHeight > COLLAPSED_MAX_HEIGHT);
			}
		});

		return () => {
			view.destroy();
			viewRef.current = null;
		};
		// extensions 变化时重建 view；streaming 变化时触发首次创建
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [extensions, streaming, trimCode]);

	// Update document content without recreating the view
	useEffect(() => {
		const view = viewRef.current;
		if (!view) return;

		const newDoc = trimCode ? code.trim() : code;
		const currentDoc = view.state.doc.toString();
		if (newDoc !== currentDoc) {
			view.dispatch({
				changes: { from: 0, to: currentDoc.length, insert: newDoc },
			});
			// Re-measure overflow
			requestAnimationFrame(() => {
				if (wrapperRef.current) {
					setOverflows(wrapperRef.current.scrollHeight > COLLAPSED_MAX_HEIGHT);
				}
			});
		}
	}, [code, streaming, trimCode]);

	if (streaming) {
		return (
			<pre
				className={cn(
					"overflow-x-auto rounded-lg p-4 text-sm",
					!wrapLines && "whitespace-pre",
					className,
				)}
				style={{
					backgroundColor: showChrome ? token.colorFillQuaternary : "transparent",
					color: token.colorTextSecondary,
				}}
			>
				<code>{code}</code>
			</pre>
		);
	}

	const isCollapsed = showChrome && overflows && collapsed;

	return (
		<div
			className={cn(
				"code-block-cm overflow-hidden",
				showChrome && "my-4 rounded-lg",
				className,
			)}
			style={{
				backgroundColor: showChrome ? token.colorFillQuaternary : "transparent",
			}}
		>
			{showChrome && (
				<div
					className="flex items-center justify-between px-3 py-1.5"
					style={{ backgroundColor: token.colorFillTertiary }}
				>
					<span
						className="text-xs font-medium"
						style={{ color: token.colorTextSecondary }}
					>
						{displayLang}
					</span>
					<CopyButton getText={getCode} />
				</div>
			)}
			<div
				ref={wrapperRef}
				className="relative overflow-hidden"
				style={{
					maxHeight: isCollapsed ? COLLAPSED_MAX_HEIGHT : undefined,
				}}
			>
				<div ref={editorRef} />
				{isCollapsed && (
					<div
						className="absolute bottom-0 left-0 right-0 h-16 pointer-events-none"
						style={{
							background: `linear-gradient(transparent, ${token.colorFillQuaternary})`,
						}}
					/>
				)}
			</div>
			{showChrome && overflows && (
				<div
					className="flex items-center justify-center py-1.5 cursor-pointer select-none transition-colors duration-150"
					style={{
						color: token.colorTextTertiary,
						backgroundColor: token.colorFillTertiary,
					}}
					onClick={handleToggle}
					onKeyDown={(e) => {
						if (e.key === "Enter" || e.key === " ") handleToggle();
					}}
				>
					{collapsed ? (
						<span className="text-xs flex items-center gap-1">
							<DownOutlined style={{ fontSize: 10 }} />
							Expand
						</span>
					) : (
						<span className="text-xs flex items-center gap-1">
							<UpOutlined style={{ fontSize: 10 }} />
							Collapse
						</span>
					)}
				</div>
			)}
		</div>
	);
};
