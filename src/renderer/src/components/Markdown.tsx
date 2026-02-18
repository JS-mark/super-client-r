import type * as React from "react";
import { XMarkdown } from "@ant-design/x-markdown";
import "@ant-design/x-markdown/es/XMarkdown/index.css";
import { cn } from "../lib/utils";

interface MarkdownProps {
	content: string;
	className?: string;
	streaming?: boolean;
}

export const Markdown: React.FC<MarkdownProps> = ({
	content,
	className,
	streaming = false,
}) => {
	return (
		<div className={cn("markdown-content", className)}>
			<XMarkdown
				content={content}
				openLinksInNewTab
				streaming={
					streaming
						? {
								hasNextChunk: true,
								enableAnimation: true,
								animationConfig: {
									fadeDuration: 150,
									easing: "ease-out",
								},
							}
						: undefined
				}
			/>
		</div>
	);
};
