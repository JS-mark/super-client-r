import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import type * as React from "react";
import { cn } from "../lib/utils";

interface MarkdownProps {
	content: string;
	className?: string;
}

export const Markdown: React.FC<MarkdownProps> = ({ content, className }) => {
	return (
		<div className={cn("markdown prose  max-w-none", className)}>
			<ReactMarkdown
				remarkPlugins={[remarkGfm]}
				rehypePlugins={[rehypeHighlight, rehypeRaw]}
				components={{
					// Custom code block styling
					pre: ({ node, ...props }) => (
						<pre
							className="!bg-gray-100  !p-4 !rounded-lg !overflow-x-auto"
							{...props}
						/>
					),
					code: ({ node, className, children, ...props }) => {
						const isInline = !className?.includes("language-");
						if (isInline) {
							return (
								<code
									className="!bg-gray-100  !px-1.5 !py-0.5 !rounded !text-sm !font-mono"
									{...props}
								>
									{children}
								</code>
							);
						}
						return (
							<code className={cn(className, "!text-sm !font-mono")} {...props}>
								{children}
							</code>
						);
					},
					// Custom link styling
					a: ({ node, ...props }) => (
						<a
							className="!text-blue-500 hover:!text-blue-600 !underline !transition-colors"
							target="_blank"
							rel="noopener noreferrer"
							{...props}
						/>
					),
					// Custom blockquote styling
					blockquote: ({ node, ...props }) => (
						<blockquote
							className="!border-l-4 !border-blue-500 !pl-4 !italic !my-4 !text-gray-600 "
							{...props}
						/>
					),
					// Custom table styling
					table: ({ node, ...props }) => (
						<div className="!overflow-x-auto !my-4">
							<table
								className="!min-w-full !border-collapse !border !border-gray-200 "
								{...props}
							/>
						</div>
					),
					thead: ({ node, ...props }) => (
						<thead
							className="!bg-gray-50 "
							{...props}
						/>
					),
					tbody: ({ node, ...props }) => (
						<tbody className="!divide-y !divide-gray-200 " {...props} />
					),
					tr: ({ node, ...props }) => (
						<tr
							className="!hover:bg-gray-50  !transition-colors"
							{...props}
						/>
					),
					th: ({ node, ...props }) => (
						<th
							className="!px-4 !py-2 !text-left !font-semibold !border !border-gray-200 "
							{...props}
						/>
					),
					td: ({ node, ...props }) => (
						<td
							className="!px-4 !py-2 !border !border-gray-200 "
							{...props}
						/>
					),
					// Custom list styling
					ul: ({ node, ...props }) => (
						<ul className="!list-disc !pl-6 !my-2" {...props} />
					),
					ol: ({ node, ...props }) => (
						<ol className="!list-decimal !pl-6 !my-2" {...props} />
					),
					li: ({ node, ...props }) => (
						<li className="!my-1" {...props} />
					),
					// Custom heading styling
					h1: ({ node, ...props }) => (
						<h1 className="!text-2xl !font-bold !mt-6 !mb-4" {...props} />
					),
					h2: ({ node, ...props }) => (
						<h2 className="!text-xl !font-bold !mt-5 !mb-3" {...props} />
					),
					h3: ({ node, ...props }) => (
						<h3 className="!text-lg !font-semibold !mt-4 !mb-2" {...props} />
					),
					h4: ({ node, ...props }) => (
						<h4 className="!text-base !font-semibold !mt-3 !mb-2" {...props} />
					),
					// Custom paragraph styling
					p: ({ node, ...props }) => (
						<p className="!my-2" {...props} />
					),
					// Custom hr styling
					hr: ({ node, ...props }) => (
						<hr className="!my-6 !border-gray-200 " {...props} />
					),
					// Custom image styling
					img: ({ node, ...props }) => (
						<img
							className="!rounded-lg !max-w-full !h-auto !my-4"
							{...props}
						/>
					),
				}}
			>
				{content}
			</ReactMarkdown>
		</div>
	);
};