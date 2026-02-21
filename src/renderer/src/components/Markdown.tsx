import type { ComponentProps } from "@ant-design/x-markdown";
import { XMarkdown } from "@ant-design/x-markdown";
import { type FC, useCallback, useMemo, useRef } from "react";
import "@ant-design/x-markdown/es/XMarkdown/index.css";
import { cn } from "../lib/utils";
import { MermaidChart } from "./MermaidChart";
import { CopyButton } from "./markdown/CopyButton";
import { SyntaxHighlighter } from "./markdown/SyntaxHighlighter";

interface MarkdownProps {
	content: string;
	className?: string;
	streaming?: boolean;
}

function extractTextContent(node: unknown): string {
	if (!node || typeof node !== "object") return "";
	const n = node as { type?: string; data?: string; children?: unknown[] };
	if (n.type === "text" && typeof n.data === "string") return n.data;
	if (Array.isArray(n.children)) {
		return n.children.map(extractTextContent).join("");
	}
	return "";
}

// PreBlock is a pass-through: CodeBlock handles its own container for block code
// (SyntaxHighlighter / MermaidChart each provide their own wrapper with header + copy button)
const PreBlock: FC<ComponentProps> = ({ children }) => {
	return <>{children}</>;
};

const CodeBlock: FC<ComponentProps> = ({
	lang,
	block,
	streamStatus,
	domNode,
	children,
	...props
}) => {
	if (block && lang === "mermaid") {
		const code = extractTextContent(domNode);
		return <MermaidChart code={code} streaming={streamStatus === "loading"} />;
	}

	if (block) {
		const code = extractTextContent(domNode);
		return (
			<SyntaxHighlighter
				code={code}
				language={lang}
				streaming={streamStatus === "loading"}
			/>
		);
	}

	return <code {...props}>{children}</code>;
};

const BlockquoteBlock: FC<ComponentProps> = ({
	children,
	...props
}) => {
	const quoteRef = useRef<HTMLQuoteElement>(null);

	const getText = useCallback(() => quoteRef.current?.textContent ?? "", []);

	return (
		<div className="group/bq relative">
			<blockquote ref={quoteRef} {...props}>
				{children}
			</blockquote>
			<div className="absolute top-2 right-2 opacity-0 group-hover/bq:opacity-100 transition-opacity duration-200">
				<CopyButton getText={getText} />
			</div>
		</div>
	);
};

const TableBlock: FC<ComponentProps> = ({ children, ...props }) => {
	const tableRef = useRef<HTMLTableElement>(null);

	const getText = useCallback(() => {
		const table = tableRef.current;
		if (!table) return "";
		const rows = table.querySelectorAll("tr");
		return Array.from(rows)
			.map((row) =>
				Array.from(row.querySelectorAll("th, td"))
					.map((cell) => cell.textContent?.trim() ?? "")
					.join("\t"),
			)
			.join("\n");
	}, []);

	return (
		<div className="group/table relative">
			<table ref={tableRef} {...props}>
				{children}
			</table>
			<div className="absolute top-2 right-2 opacity-0 group-hover/table:opacity-100 transition-opacity duration-200">
				<CopyButton getText={getText} />
			</div>
		</div>
	);
};

const markdownComponents: Record<string, FC<ComponentProps>> = {
	code: CodeBlock,
	pre: PreBlock,
	blockquote: BlockquoteBlock,
	table: TableBlock,
};

export const Markdown: FC<MarkdownProps> = ({
	content,
	className,
	streaming = false,
}) => {
	const streamingConfig = useMemo(
		() =>
			streaming
				? {
					hasNextChunk: true,
					enableAnimation: true,
					animationConfig: {
						fadeDuration: 150,
						easing: "ease-out",
					},
				}
				: undefined,
		[streaming],
	);

	return (
		<div className={cn("markdown-content", className)}>
			<XMarkdown
				content={content}
				openLinksInNewTab
				components={markdownComponents}
				streaming={streamingConfig}
			/>
		</div>
	);
};
