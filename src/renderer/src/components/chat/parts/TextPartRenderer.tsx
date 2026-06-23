import { memo } from "react";
import type { TextMessagePart } from "@super-client/shared-types/chat";
import { Markdown, StreamingMarkdown } from "../../Markdown";

export interface TextPartRendererProps {
	part: TextMessagePart;
	streaming?: boolean;
}

export const TextPartRenderer = memo(function TextPartRenderer({
	part,
	streaming = false,
}: TextPartRendererProps) {
	if (streaming) {
		return <StreamingMarkdown fallbackContent={part.content} />;
	}

	return <Markdown content={part.content} />;
});

