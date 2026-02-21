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
}

export const SyntaxHighlighter: FC<SyntaxHighlighterProps> = ({
  code,
  language,
  streaming = false,
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
      // UI features
      lineNumbers(),
      highlightSpecialChars(),
      bracketMatching(),
      // Line wrapping (auto word-wrap)
      EditorView.lineWrapping,
      // Custom fold gutter
      foldGutter({
        markerDOM(open) {
          const span = document.createElement("span");
          span.className = `cm-fold-marker ${open ? "cm-fold-open" : "cm-fold-closed"}`;
          span.textContent = open ? "\u25BE" : "\u25B8";
          return span;
        },
      }),
      // Read-only
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
    ];

    // Language parser (provides tokens for highlighting + fold ranges)
    if (language) {
      const langName = resolveLangName(language);
      const langExt = loadLanguage(langName);
      if (langExt) exts.push(langExt);
    }

    return exts;
  }, [language, actualTheme]);

  // Create / destroy EditorView directly (no @uiw wrapper)
  useEffect(() => {
    const container = editorRef.current;
    if (!container) return;

    const view = new EditorView({
      state: EditorState.create({
        doc: code.trim(),
        extensions,
      }),
      parent: container,
    });

    viewRef.current = view;

    // Measure overflow after view renders
    requestAnimationFrame(() => {
      if (wrapperRef.current) {
        setOverflows(
          wrapperRef.current.scrollHeight > COLLAPSED_MAX_HEIGHT,
        );
      }
    });

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // extensions 变化时重建 view；streaming 变化时触发首次创建
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extensions, streaming]);

  // Update document content without recreating the view
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const newDoc = code.trim();
    const currentDoc = view.state.doc.toString();
    if (newDoc !== currentDoc) {
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: newDoc },
      });
      // Re-measure overflow
      requestAnimationFrame(() => {
        if (wrapperRef.current) {
          setOverflows(
            wrapperRef.current.scrollHeight > COLLAPSED_MAX_HEIGHT,
          );
        }
      });
    }
  }, [code, streaming]);

  if (streaming) {
    return (
      <pre
        className="rounded-lg p-4 overflow-x-auto text-sm"
        style={{
          backgroundColor: token.colorFillQuaternary,
          color: token.colorTextSecondary,
        }}
      >
        <code>{code}</code>
      </pre>
    );
  }

  const isCollapsed = overflows && collapsed;

  return (
    <div
      className="code-block-cm rounded-lg overflow-hidden my-4"
      style={{ backgroundColor: token.colorFillQuaternary }}
    >
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
      {overflows && (
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
