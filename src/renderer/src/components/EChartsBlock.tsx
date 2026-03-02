import { theme } from "antd";
import ReactEChartsCore from "echarts-for-react/lib/core";
import * as echarts from "echarts/core";
import { BarChart, CandlestickChart, LineChart, PieChart } from "echarts/charts";
import {
	DataZoomComponent,
	GridComponent,
	LegendComponent,
	MarkLineComponent,
	MarkPointComponent,
	TitleComponent,
	ToolboxComponent,
	TooltipComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { useCallback, useMemo, type FC } from "react";
import { CopyButton } from "./markdown/CopyButton";

echarts.use([
	LineChart,
	BarChart,
	CandlestickChart,
	PieChart,
	GridComponent,
	TooltipComponent,
	TitleComponent,
	LegendComponent,
	ToolboxComponent,
	DataZoomComponent,
	MarkLineComponent,
	MarkPointComponent,
	CanvasRenderer,
]);

const { useToken } = theme;

interface EChartsBlockProps {
	code: string;
	streaming?: boolean;
}

export const EChartsBlock: FC<EChartsBlockProps> = ({
	code,
	streaming = false,
}) => {
	const { token } = useToken();

	const getCode = useCallback(() => code, [code]);

	const parsed = useMemo(() => {
		if (streaming) return { ok: false as const, error: "" };
		try {
			const option = JSON.parse(code);
			return { ok: true as const, option };
		} catch (e) {
			return {
				ok: false as const,
				error: e instanceof Error ? e.message : String(e),
			};
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

	if (!parsed.ok) {
		return (
			<div className="rounded-lg overflow-hidden">
				<div
					className="px-3 py-1.5 text-xs font-medium"
					style={{
						backgroundColor: token.colorErrorBg,
						color: token.colorError,
					}}
				>
					ECharts Error: {parsed.error}
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

	// Apply theme-aware defaults
	const option = {
		...parsed.option,
		backgroundColor: "transparent",
	};

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
					ECharts
				</span>
				<CopyButton getText={getCode} />
			</div>
			<div className="px-2 py-4">
				<ReactEChartsCore
					echarts={echarts}
					option={option}
					style={{ height: 400, width: "100%" }}
					notMerge
					lazyUpdate
				/>
			</div>
		</div>
	);
};
