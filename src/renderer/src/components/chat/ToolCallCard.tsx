import {
	CheckCircleOutlined,
	CheckOutlined,
	ClockCircleOutlined,
	CloseCircleOutlined,
	CloseOutlined,
	DownOutlined,
	ExclamationCircleOutlined,
	KeyOutlined,
	LoadingOutlined,
	RightOutlined,
	ToolOutlined,
} from "@ant-design/icons";
import { App, Tooltip, theme } from "antd";
import type * as React from "react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import JsonView from "react18-json-view";
import "react18-json-view/src/style.css";
import { runtimeService } from "../../services/runtimeService";
import { useChatStore } from "../../stores/chatStore";
import type { Message } from "../../stores/chatStore";
import { useThemeStore } from "../../stores/themeStore";
import { ApprovalDecisionCard } from "./ApprovalDecisionCard";

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
 *
 * `builtin` is the new category for the @scp/agent-builtins MCP server
 * (Read/Write/Edit/Bash/Grep/Glob/WebFetch/Task) so the renderer can
 * distinguish first-party agent tools from user-installed MCP servers.
 */
function getEnvType(
	server: string | null,
): "sandbox" | "local" | "network" | "browser" | "builtin" | "external" {
	if (!server) return "external";
	if (server.startsWith("scp-agent-builtins")) return "builtin";
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
	builtin: {
		light: "#e6f7ff",
		dark: "#1a2e3a",
		text: "#1677ff",
		darkText: "#69b1ff",
	},
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
	const preview = JSON.stringify(parsed);

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
						<Tooltip title={preview} mouseEnterDelay={0.35}>
							<span
								className="truncate"
								style={{
									color: token.colorTextTertiary,
									fontSize: 11,
									fontFamily:
										'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
									maxWidth: 420,
									minWidth: 0,
								}}
							>
								{preview}
							</span>
						</Tooltip>
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
	compact?: boolean;
	onApproval?: (
		toolCallId: string,
		approved: boolean,
		updatedInput?: Record<string, unknown>,
		updatedPermissions?: Array<Record<string, unknown>>,
	) => void;
}> = ({ toolCall, compact = false, onApproval }) => {
	const { token } = useToken();
	const { t } = useTranslation("chat");
	const { message } = App.useApp();
	const isDark = useThemeStore((s) => s.actualTheme) === "dark";
	const [approvalChoice, setApprovalChoice] = useState<
		"allow_once" | "allow_session"
	>("allow_once");
	const conversationId = useChatStore((s) => s.currentConversationId);
	const { server, tool } = useMemo(
		() => formatToolName(toolCall.name),
		[toolCall.name],
	);

	const handleAllowForSession = useCallback(async () => {
		if (!conversationId) return;
		try {
			const res = await runtimeService.addGrant(conversationId, {
				operationType: `tool:${toolCall.name}`,
				scope: "session",
			});
			if (res.success) {
				message.success(t("approval.grantAdded"));
			} else {
				message.error(res.error || t("approval.grantFailed"));
			}
		} catch (err) {
			message.error(
				err instanceof Error ? err.message : t("approval.grantFailed"),
			);
		}
		onApproval?.(toolCall.id, true, undefined, toolCall.approval?.suggestions);
	}, [
		conversationId,
		toolCall.id,
		toolCall.name,
		toolCall.approval?.suggestions,
		onApproval,
		message,
		t,
	]);
	const handleApprovalConfirm = useCallback(() => {
		if (approvalChoice === "allow_session") {
			void handleAllowForSession();
			return;
		}
		onApproval?.(toolCall.id, true);
	}, [approvalChoice, handleAllowForSession, onApproval, toolCall.id]);
	const handleApprovalReject = useCallback(() => {
		onApproval?.(toolCall.id, false);
	}, [onApproval, toolCall.id]);
	const statusColor = (STATUS_COLOR[toolCall.status] || STATUS_COLOR.pending)(
		token as unknown as Record<string, string>,
	);

	const envType = useMemo(() => getEnvType(server), [server]);
	const envColors = ENV_COLORS[envType];
	const approvalOptions = useMemo(
		() => [
				{
					value: "allow_once",
					label: t("approval.allowOnce", t("approval.approve")),
					description: t("approval.allowOnceDesc"),
				},
				{
					value: "allow_session",
					label: t("approval.allowSession"),
					description: t("approval.allowSessionDesc"),
					disabled: !conversationId,
				},
			],
			[conversationId, t],
		);
		const approvalDescription = useMemo(() => {
			if (toolCall.approval?.title || toolCall.approval?.description) {
				return (
					<div>
						{toolCall.approval?.title && (
							<div style={{ fontWeight: 600, color: token.colorText }}>
								{toolCall.approval.title}
							</div>
						)}
						{toolCall.approval?.description && (
							<div style={{ marginTop: toolCall.approval.title ? 2 : 0 }}>
								{toolCall.approval.description}
							</div>
						)}
					</div>
				);
			}
			return t("approval.description");
		}, [
			t,
			token.colorText,
			toolCall.approval?.description,
			toolCall.approval?.title,
		]);

	if (toolCall.status === "awaiting_approval" && onApproval) {
		return (
				<ApprovalDecisionCard
					icon={<ExclamationCircleOutlined />}
					title={toolCall.approval?.displayName || tool}
					description={approvalDescription}
					options={approvalOptions}
					value={approvalChoice}
					onChange={(value) =>
						setApprovalChoice(value as "allow_once" | "allow_session")
					}
					rejectLabel={t("approval.reject")}
					rejectIcon={<CloseOutlined />}
					onReject={handleApprovalReject}
					confirmLabel={t("approval.confirm")}
					confirmIcon={
						approvalChoice === "allow_session" ? (
							<KeyOutlined />
						) : (
							<CheckOutlined />
					)
					}
					onConfirm={handleApprovalConfirm}
					tone="warning"
					density={compact ? "compact" : "default"}
					maxWidth={compact ? 520 : undefined}
			>
				<div className="flex items-center gap-2">
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
				</div>
				<JsonSection
					label={t("toolCall.input")}
					value={toolCall.input}
					defaultExpanded={false}
					maxHeight={compact ? 160 : undefined}
					dark={isDark}
				/>
			</ApprovalDecisionCard>
		);
	}

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
					{toolCall.approval?.displayName || tool}
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
				{(toolCall.approval?.title || toolCall.approval?.description) && (
					<div
						className="rounded-md px-3 py-2"
						style={{
							backgroundColor: token.colorFillQuaternary,
							border: `1px solid ${token.colorBorderSecondary}`,
						}}
					>
						{toolCall.approval?.title && (
							<div
								style={{
									fontSize: 12,
									fontWeight: 600,
									color: token.colorText,
									lineHeight: 1.5,
								}}
							>
								{toolCall.approval.title}
							</div>
						)}
						{toolCall.approval?.description && (
							<div
								style={{
									fontSize: 12,
									color: token.colorTextSecondary,
									lineHeight: 1.5,
									marginTop: toolCall.approval.title ? 2 : 0,
								}}
							>
								{toolCall.approval.description}
							</div>
						)}
					</div>
				)}
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
