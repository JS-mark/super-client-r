import {
	CheckCircleOutlined,
	CheckOutlined,
	ClockCircleOutlined,
	CloseCircleOutlined,
	CloseOutlined,
	DownOutlined,
	ExclamationCircleOutlined,
	LoadingOutlined,
	RightOutlined,
	ToolOutlined,
} from "@ant-design/icons";
import { Button, theme } from "antd";
import type * as React from "react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import JsonView from "react18-json-view";
import "react18-json-view/src/style.css";
import type { Message } from "../../stores/chatStore";
import { useThemeStore } from "../../stores/themeStore";

const { useToken } = theme;

/**
 * Strip MCP server prefix from tool name.
 * e.g. "scp-file-system__list_directory" -> "list_directory"
 */
function formatToolName(name: string): { server: string | null; tool: string } {
	const idx = name.indexOf("__");
	if (idx > 0) {
		return { server: name.slice(0, idx), tool: name.slice(idx + 2) };
	}
	return { server: null, tool: name };
}

/**
 * Map server prefix to environment type for badge display.
 */
function getEnvType(
	server: string | null,
): "sandbox" | "local" | "network" | "browser" | "external" {
	if (!server) return "external";
	if (server.startsWith("scp-python") || server.startsWith("scp-javascript"))
		return "sandbox";
	if (server.startsWith("scp-file-system") || server.startsWith("scp-nodejs"))
		return "local";
	if (server.startsWith("scp-fetch") || server.startsWith("scp-image"))
		return "network";
	if (server.startsWith("mcp-browser")) return "browser";
	return "external";
}

const ENV_COLORS: Record<
	string,
	{ light: string; dark: string; text: string; darkText: string }
> = {
	sandbox: {
		light: "#e6f7e6",
		dark: "#1a3a1a",
		text: "#389e0d",
		darkText: "#73d13d",
	},
	local: {
		light: "#fff7e6",
		dark: "#3a2e1a",
		text: "#d48806",
		darkText: "#ffc53d",
	},
	network: {
		light: "#e6f4ff",
		dark: "#1a2a3a",
		text: "#0958d9",
		darkText: "#4096ff",
	},
	browser: {
		light: "#f9f0ff",
		dark: "#2a1a3a",
		text: "#722ed1",
		darkText: "#b37feb",
	},
	external: {
		light: "#f5f5f5",
		dark: "#2a2a2a",
		text: "#595959",
		darkText: "#8c8c8c",
	},
};

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

	const isEmpty =
		parsed === null ||
		parsed === undefined ||
		(typeof parsed === "object" && Object.keys(parsed as object).length === 0);

	const handleToggle = useCallback(() => setExpanded((v) => !v), []);

	if (isEmpty) return null;

	return (
		<div style={{ fontSize: 12 }}>
			<div
				onClick={handleToggle}
				className="flex items-center gap-1.5 cursor-pointer select-none"
				style={{
					color: token.colorTextTertiary,
					marginBottom: expanded ? 4 : 0,
				}}
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
							fontFamily:
								'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
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
							fontFamily:
								'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
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
	awaiting_approval: <ExclamationCircleOutlined style={{ fontSize: 12 }} />,
	success: <CheckCircleOutlined style={{ fontSize: 12 }} />,
	error: <CloseCircleOutlined style={{ fontSize: 12 }} />,
};

const STATUS_COLOR: Record<string, (token: Record<string, string>) => string> =
	{
		pending: (t) => t.colorTextTertiary,
		awaiting_approval: (t) => t.colorWarning,
		success: (t) => t.colorSuccess,
		error: (t) => t.colorError,
	};

export const ToolCallCard: React.FC<{
	toolCall: NonNullable<Message["toolCall"]>;
	onApproval?: (toolCallId: string, approved: boolean) => void;
}> = ({ toolCall, onApproval }) => {
	const { token } = useToken();
	const { t } = useTranslation("chat");
	const isDark = useThemeStore((s) => s.actualTheme) === "dark";
	const { server, tool } = useMemo(
		() => formatToolName(toolCall.name),
		[toolCall.name],
	);
	const statusColor = (STATUS_COLOR[toolCall.status] || STATUS_COLOR.pending)(
		token as unknown as Record<string, string>,
	);

	const envType = useMemo(() => getEnvType(server), [server]);
	const envColors = ENV_COLORS[envType];

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
					borderBottom: `1px solid ${token.colorBorderSecondary}`,
					backgroundColor: token.colorFillQuaternary,
				}}
			>
				<span style={{ color: statusColor }}>
					{STATUS_ICON[toolCall.status] || (
						<ToolOutlined style={{ fontSize: 12 }} />
					)}
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
				{/* Environment badge */}
				<span
					style={{
						fontSize: 10,
						padding: "0 5px",
						borderRadius: 3,
						lineHeight: "16px",
						fontWeight: 500,
						backgroundColor: isDark ? envColors.dark : envColors.light,
						color: isDark ? envColors.darkText : envColors.text,
					}}
				>
					{t(`toolCall.env.${envType}`)}
				</span>
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
					label={t("toolCall.input")}
					value={toolCall.input}
					defaultExpanded={false}
					dark={isDark}
				/>

				{/* Loading indicator when pending */}
				{toolCall.status === "pending" && (
					<div className="flex flex-col gap-1.5" style={{ marginTop: 2 }}>
						<div
							className="flex items-center gap-1.5"
							style={{
								color: token.colorTextTertiary,
								fontSize: 11,
							}}
						>
							<LoadingOutlined spin style={{ fontSize: 11 }} />
							<span>{t("toolCall.executing")}</span>
						</div>
						<div className="tool-call-progress-bar" />
					</div>
				)}

				{/* Inline approval UI */}
				{toolCall.status === "awaiting_approval" && onApproval && (
					<div
						className="flex items-center justify-between gap-3 rounded-md px-3 py-2"
						style={{
							marginTop: 4,
							backgroundColor: token.colorWarningBg,
							border: `1px solid ${token.colorWarningBorder}`,
						}}
					>
						<span
							style={{
								fontSize: 12,
								color: token.colorWarning,
								fontWeight: 500,
							}}
						>
							<ExclamationCircleOutlined style={{ marginRight: 6 }} />
							{t("approval.title")}
						</span>
						<div className="flex items-center gap-2">
							<Button
								size="small"
								icon={<CloseOutlined />}
								onClick={() => onApproval(toolCall.id, false)}
							>
								{t("approval.reject")}
							</Button>
							<Button
								type="primary"
								size="small"
								icon={<CheckOutlined />}
								onClick={() => onApproval(toolCall.id, true)}
							>
								{t("approval.approve")}
							</Button>
						</div>
					</div>
				)}

				{toolCall.result !== undefined && (
					<JsonSection
						label={t("toolCall.result")}
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
							maxHeight: 300,
							overflowY: "auto",
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
