import { theme } from "antd";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { CopyButton } from "./markdown/CopyButton";

const { useToken } = theme;

interface MermaidChartProps {
	code: string;
	streaming?: boolean;
}

export const MermaidChart: React.FC<MermaidChartProps> = ({
	code,
	streaming = false,
}) => {
	const { token } = useToken();
	const containerRef = useRef<HTMLDivElement>(null);
	const uniqueId = useId().replace(/:/g, "_");
	const [svg, setSvg] = useState<string>("");
	const [error, setError] = useState<string>("");
	const prevCodeRef = useRef<string>("");

	const renderChart = useCallback(
		async (chartCode: string) => {
			if (!chartCode.trim() || streaming) return;
			if (chartCode === prevCodeRef.current) return;
			prevCodeRef.current = chartCode;

			try {
				const mermaid = (await import("mermaid")).default;
				mermaid.initialize({
					startOnLoad: false,
					theme: "default",
					fontFamily: token.fontFamily,
					securityLevel: "loose",
				});
				const { svg: renderedSvg } = await mermaid.render(
					`mermaid_${uniqueId}`,
					chartCode.trim(),
				);
				setSvg(renderedSvg);
				setError("");
			} catch (e) {
				setError(e instanceof Error ? e.message : String(e));
				setSvg("");
			}
		},
		[streaming, uniqueId, token.fontFamily],
	);

	useEffect(() => {
		renderChart(code);
	}, [code, renderChart]);

	const getCode = useCallback(() => code, [code]);

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

	if (error) {
		return (
			<div className="rounded-lg overflow-hidden">
				<div
					className="px-3 py-1.5 text-xs font-medium"
					style={{
						backgroundColor: token.colorErrorBg,
						color: token.colorError,
					}}
				>
					Mermaid Error
				</div>
				<pre
					className="p-4 overflow-x-auto text-sm m-0"
					style={{
						backgroundColor: token.colorFillQuaternary,
						color: token.colorTextSecondary,
					}}
				>
					<code>{code}</code>
				</pre>
			</div>
		);
	}

	if (!svg) {
		return (
			<div
				className="flex items-center justify-center py-8 rounded-lg"
				style={{ backgroundColor: token.colorFillQuaternary }}
			>
				<div
					className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin"
					style={{
						borderColor: token.colorPrimary,
						borderTopColor: "transparent",
					}}
				/>
			</div>
		);
	}

	return (
		<div
			className="rounded-lg overflow-hidden"
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
					Mermaid
				</span>
				<CopyButton getText={getCode} />
			</div>
			<div
				ref={containerRef}
				className="flex justify-center overflow-x-auto py-4 px-2"
				// biome-ignore lint/security/noDangerouslySetInnerHtml: mermaid SVG output
				dangerouslySetInnerHTML={{ __html: svg }}
			/>
		</div>
	);
};
