import { Button, theme } from "antd";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

export interface ArtifactDiffPreviewProps {
	diffPreview: string;
	/**
	 * Initial expanded state. Defaults to false.
	 */
	defaultExpanded?: boolean;
}

/**
 * Renders the {@link ArtifactDiffPreviewProps.diffPreview} string for a
 * change-origin ArtifactLibraryItem in the Artifacts section of the
 * CodexEnvironmentInspector. Collapsed shows an expand toggle; expanded shows
 * the diff text in a scrollable monospace container. Empty/whitespace-only
 * input renders an inert placeholder (defensive — the parent filters these).
 *
 * Rendering is local-only; diffPreview may contain real paths or code and must
 * never be telemetry-logged or external-sent.
 */
export function ArtifactDiffPreview({
	diffPreview,
	defaultExpanded = false,
}: ArtifactDiffPreviewProps) {
	const { t } = useTranslation("chat");
	const { token } = theme.useToken();
	const [expanded, setExpanded] = useState<boolean>(defaultExpanded);

	const handleToggle = useCallback(() => {
		setExpanded((prev) => !prev);
	}, []);

	const trimmed = diffPreview.trim();
	if (trimmed.length === 0) {
		return (
			<div
				data-testid="artifact-diff-preview"
				data-expanded="false"
				style={{
					fontSize: 11,
					color: token.colorTextTertiary,
					padding: "2px 0",
				}}
			>
				{t("artifacts.diff.empty", "无差异内容")}
			</div>
		);
	}

	return (
		<div
			data-testid="artifact-diff-preview"
			data-expanded={expanded ? "true" : "false"}
			className="flex flex-col"
			style={{ padding: "2px 0" }}
		>
			<Button
				type="link"
				size="small"
				onClick={handleToggle}
				style={{ padding: 0, fontSize: 11, alignSelf: "flex-start" }}
				aria-expanded={expanded}
			>
				{expanded
					? t("artifacts.diff.collapse", "折叠")
					: t("artifacts.diff.expand", "展开")}
			</Button>
			{expanded && (
				<pre
					style={{
						marginTop: 4,
						marginBottom: 0,
						padding: "6px 8px",
						maxHeight: 240,
						overflow: "auto",
						fontFamily:
							"ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
						fontSize: 11,
						lineHeight: 1.5,
						whiteSpace: "pre",
						color: token.colorText,
						backgroundColor: token.colorFillQuaternary,
						border: `1px solid ${token.colorBorderSecondary}`,
						borderRadius: token.borderRadiusSM,
					}}
				>
					{diffPreview}
				</pre>
			)}
		</div>
	);
}

export default ArtifactDiffPreview;
