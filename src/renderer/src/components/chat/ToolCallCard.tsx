import {
	CheckCircleOutlined,
	ClockCircleOutlined,
	CloseCircleOutlined,
	DownOutlined,
	LoadingOutlined,
	RightOutlined,
	ToolOutlined,
} from "@ant-design/icons";
import { theme } from "antd";
import type * as React from "react";
import { useMemo, useState } from "react";
import JsonView from "react18-json-view";
import "react18-json-view/src/style.css";
import type { Message } from "../../stores/chatStore";
import { useThemeStore } from "../../stores/themeStore";

const { useToken } = theme;

/**
 * Strip MCP server prefix from tool name.
 * e.g. "scp-file-system__list_directory" → "list_directory"
 */
function formatToolName(name: string): { server: string | null; tool: string } {
	const idx = name.indexOf("__");
	if (idx > 0) {
		return { server: name.slice(0, idx), tool: name.slice(idx + 2) };
	}
	return { server: null, tool: name };
}

/**
 * Ensure value is a JSON-compatible object for the viewer.
 * Strings that are valid JSON get parsed; other strings become { value: str }.
 */
function ensureObject(value: unknown): unknown {
	if (value === null || value === undefined) return {};
	if (typeof value === "string") {
		try {
			return JSON.parse(value);
		} catch {
			return { value };
		}
	}
	return value;
}

/**
 * Collapsible section with JsonView inside
 */
const JsonSection: React.FC<{
	label: string;
	value: unknown;
	defaultExpanded?: boolean;
	maxHeight?: number;
	dark: boolean;
}> = ({ label, value, defaultExpanded = false, maxHeight = 240, dark }) => {
	const { token } = useToken();
	const [expanded, setExpanded] = useState(defaultExpanded);
	const parsed = useMemo(() => ensureObject(value), [value]);

	const isEmpty = parsed === null || parsed === undefined
		|| (typeof parsed === "object" && Object.keys(parsed as object).length === 0);

	if (isEmpty) return null;

	return (
		<div style={{ fontSize: 12 }}>
			<div
				onClick={() => setExpanded(!expanded)}
				className="flex items-center gap-1.5 cursor-pointer select-none"
				style={{ color: token.colorTextTertiary, marginBottom: expanded ? 4 : 0 }}
			>
				{expanded ? (
					<DownOutlined style={{ fontSize: 9 }} />
				) : (
					<RightOutlined style={{ fontSize: 9 }} />
				)}
				<span style={{ fontSize: 11, fontWeight: 500 }}>{label}</span>
				{!expanded && (
					<span
						className="truncate"
						style={{
							color: token.colorTextQuaternary,
							fontSize: 11,
							fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
							maxWidth: 320,
						}}
					>
						{JSON.stringify(parsed).slice(0, 80)}
					</span>
				)}
			</div>
			{expanded && (
				<div
					style={{
						borderRadius: 6,
						maxHeight,
						overflowY: "auto",
						fontSize: 12,
					}}
				>
					<JsonView
						src={parsed}
						theme="default"
						dark={dark}
						enableClipboard
						collapsed={2}
						collapseStringsAfterLength={120}
						displaySize="collapsed"
						style={{
							background: "transparent",
							fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
							fontSize: 11,
							lineHeight: 1.5,
						}}
					/>
				</div>
			)}
		</div>
	);
};

const STATUS_ICON: Record<string, React.ReactNode> = {
	pending: <LoadingOutlined spin style={{ fontSize: 12 }} />,
	success: <CheckCircleOutlined style={{ fontSize: 12 }} />,
	error: <CloseCircleOutlined style={{ fontSize: 12 }} />,
};

const STATUS_COLOR: Record<string, (token: Record<string, string>) => string> = {
	pending: (t) => t.colorTextTertiary,
	success: (t) => t.colorSuccess,
	error: (t) => t.colorError,
};

export const ToolCallCard: React.FC<{
	toolCall: NonNullable<Message["toolCall"]>;
}> = ({ toolCall }) => {
	const { token } = useToken();
	const isDark = useThemeStore((s) => s.actualTheme) === "dark";
	const { server, tool } = useMemo(() => formatToolName(toolCall.name), [toolCall.name]);
	const statusColor = (STATUS_COLOR[toolCall.status] || STATUS_COLOR.pending)(token as unknown as Record<string, string>);

	return (
		<div
			className="my-2 rounded-lg overflow-hidden"
			style={{
				border: `1px solid ${token.colorBorderSecondary}`,
				backgroundColor: token.colorBgContainer,
				maxWidth: 560,
			}}
		>
			{/* Header */}
			<div
				className="flex items-center gap-2 px-3 py-2"
				style={{
					borderBottom:
						toolCall.status !== "pending" || Object.keys(toolCall.input).length > 0
							? `1px solid ${token.colorBorderSecondary}`
							: undefined,
					backgroundColor: token.colorFillQuaternary,
				}}
			>
				<span style={{ color: statusColor }}>
					{STATUS_ICON[toolCall.status] || <ToolOutlined style={{ fontSize: 12 }} />}
				</span>
				<span
					style={{
						fontSize: 12,
						fontWeight: 600,
						color: token.colorText,
						fontFamily:
							'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
					}}
				>
					{tool}
				</span>
				{server && (
					<span
						style={{
							fontSize: 10,
							color: token.colorTextQuaternary,
							padding: "0 4px",
							borderRadius: 3,
							backgroundColor: token.colorFillTertiary,
							lineHeight: "16px",
						}}
					>
						{server}
					</span>
				)}
				{toolCall.duration !== undefined && (
					<span
						className="ml-auto"
						style={{ color: token.colorTextQuaternary, fontSize: 11 }}
					>
						<ClockCircleOutlined style={{ marginRight: 3, fontSize: 10 }} />
						{toolCall.duration}ms
					</span>
				)}
			</div>

			{/* Body */}
			<div className="px-3 py-2 flex flex-col gap-1.5">
				<JsonSection
					label="Input"
					value={toolCall.input}
					defaultExpanded={false}
					dark={isDark}
				/>
				{toolCall.result !== undefined && (
					<JsonSection
						label="Result"
						value={toolCall.result}
						defaultExpanded={false}
						maxHeight={300}
						dark={isDark}
					/>
				)}
				{toolCall.error && (
					<div
						style={{
							background: token.colorErrorBg,
							color: token.colorError,
							borderRadius: 6,
							padding: "6px 10px",
							fontSize: 11,
							whiteSpace: "pre-wrap",
							wordBreak: "break-word",
							fontFamily:
								'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
						}}
					>
						{toolCall.error}
					</div>
				)}
			</div>
		</div>
	);
};
