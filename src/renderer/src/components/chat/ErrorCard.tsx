/**
 * ErrorCard — Inline card surfacing a failed LLM stream request.
 *
 * Renders the structured `LLMErrorContext` attached to a message whose
 * `type === "error"` (set by `useChatMessageStore.markMessageAsError`).
 *
 * Sections:
 *   - Header:   red icon + parsed provider error message (or SDK message),
 *               with a small chip for HTTP status code when available.
 *   - Meta:     model / preset / apiFormat / endpoint / provider code rows.
 *   - Query:    collapsible — the user prompt that triggered the failure.
 *   - Body:     collapsible — raw response body snippet (engineer detail).
 *   - Footer:   Retry + Copy Details buttons.
 *
 * Why a dedicated card (vs. the old `message.error()` toast):
 *   The bare SDK string ("Forbidden") buries the actionable diagnostic —
 *   wrong baseUrl, wrong apiFormat, exhausted free quota, wrong model id.
 *   Surfacing the (preset, apiFormat, baseUrl, model, statusCode,
 *   providerErrorCode/Message, responseBody) tuple turns a head-scratch
 *   into an obvious "oh, wrong URL/model/quota" diagnosis.
 */

import {
	CloseCircleOutlined,
	CopyOutlined,
	DownOutlined,
	ReloadOutlined,
	RightOutlined,
} from "@ant-design/icons";
import { App, Button, Tag, Tooltip, theme } from "antd";
import type * as React from "react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Message } from "@super-client/shared-types/chat";
import type { LLMErrorContext } from "@super-client/shared-types/chat";
import type { TFunction } from "i18next";
import { useThemeStore } from "../../stores/themeStore";

const { useToken } = theme;

interface ErrorCardProps {
	message: Message;
	onRetry?: (messageId: string) => void;
}

/**
 * Compose a single fenced block summary of the error for clipboard / bug
 * reports. Mirrors the shape of `formatLLMErrorMessage` but keeps things
 * multi-line so it stays human-readable when pasted.
 */
function buildCopyPayload(
	summary: string,
	ctx: LLMErrorContext | undefined,
	query: string | undefined,
	fallbackModel: string | undefined,
	fallbackPreset: string | undefined,
): string {
	const lines: string[] = [];
	lines.push(`Error: ${summary}`);
	if (ctx?.providerErrorCode) lines.push(`Code: ${ctx.providerErrorCode}`);
	if (ctx?.statusCode !== undefined) lines.push(`HTTP: ${ctx.statusCode}`);
	const model = ctx?.model ?? fallbackModel;
	const preset = ctx?.preset ?? fallbackPreset;
	if (model) lines.push(`Model: ${model}`);
	if (preset) lines.push(`Provider: ${preset}`);
	if (ctx?.apiFormat) lines.push(`API format: ${ctx.apiFormat}`);
	if (ctx?.endpointUrl) lines.push(`Endpoint: ${ctx.endpointUrl}`);
	if (ctx?.baseUrl) lines.push(`Base URL: ${ctx.baseUrl}`);
	if (query) lines.push("", "Query:", query);
	if (ctx?.responseBodySnippet)
		lines.push("", "Response body:", ctx.responseBodySnippet);
	if (ctx?.stack) lines.push("", "Stack:", ctx.stack);
	return lines.join("\n");
}

interface MetaRow {
	labelKey: string;
	value: string;
	monospace?: boolean;
}

/**
 * Build the meta-row list. Prefers `errorContext` fields (main-process
 * authoritative) and falls back to `Message.metadata` (the model the
 * renderer attempted to use just before the failure) so rows always
 * populate even when the error path didn't produce a full errorContext.
 */
function buildMetaRows(
	ctx: LLMErrorContext | undefined,
	fallback: NonNullable<Message["metadata"]> | undefined,
	t: TFunction,
): MetaRow[] {
	const rows: MetaRow[] = [];
	const model = ctx?.model ?? fallback?.model;
	const preset = ctx?.preset ?? fallback?.providerPreset;
	const providerName = fallback?.providerName;
	const apiFormat = ctx?.apiFormat;

	if (model)
		rows.push({
			labelKey: t("errorCard.fields.model", "模型", { ns: "chat" }),
			value: model,
			monospace: true,
		});
	if (preset || providerName)
		rows.push({
			labelKey: t("errorCard.fields.provider", "服务商", { ns: "chat" }),
			value: [preset, providerName].filter(Boolean).join(" · "),
		});
	if (apiFormat)
		rows.push({
			labelKey: t("errorCard.fields.apiFormat", "API 格式", { ns: "chat" }),
			value: apiFormat,
		});
	if (ctx?.endpointUrl)
		rows.push({
			labelKey: t("errorCard.fields.endpoint", "请求地址", { ns: "chat" }),
			value: ctx.endpointUrl,
			monospace: true,
		});
	if (ctx?.baseUrl && !ctx.endpointUrl)
		rows.push({
			labelKey: t("errorCard.fields.endpoint", "请求地址", { ns: "chat" }),
			value: ctx.baseUrl,
			monospace: true,
		});
	if (ctx?.providerErrorCode)
		rows.push({
			labelKey: t("errorCard.fields.code", "错误代码", { ns: "chat" }),
			value: ctx.providerErrorCode,
			monospace: true,
		});
	return rows;
}

export function ErrorCard({ message: msg, onRetry }: ErrorCardProps) {
	const { t } = useTranslation();
	const { token } = useToken();
	const { message: notify } = App.useApp();
	const isDark = useThemeStore((s) => s.actualTheme === "dark");

	const ctx = msg.metadata?.errorContext;
	const query = msg.metadata?.errorQuery;
	const summary = msg.metadata?.errorSummary ?? msg.content ?? "";
	const meta = msg.metadata;

	// Prefer the parsed business-error message — it tells the user *why*
	// (e.g. "The free quota has been exhausted"). Fall back to the enriched
	// summary that LLMService produced, which already includes status / model
	// when no parsed body is available.
	const headline = ctx?.providerErrorMessage || summary;

	const [queryOpen, setQueryOpen] = useState(false);
	const [bodyOpen, setBodyOpen] = useState(false);
	const [stackOpen, setStackOpen] = useState(false);

	const metaRows = useMemo(() => buildMetaRows(ctx, meta, t), [ctx, meta, t]);

	const handleRetry = useCallback(() => {
		onRetry?.(msg.id);
	}, [onRetry, msg.id]);

	const handleCopy = useCallback(() => {
		const payload = buildCopyPayload(
			headline,
			ctx,
			query,
			meta?.model,
			meta?.providerPreset,
		);
		navigator.clipboard.writeText(payload).then(
			() =>
				notify.success(
					t("errorCard.copied", "已复制到剪贴板", { ns: "chat" }),
				),
			() =>
				notify.error(
					t("errorCard.copyFailed", "复制失败", { ns: "chat" }),
				),
		);
	}, [headline, ctx, query, meta?.model, meta?.providerPreset, notify, t]);

	const danger = isDark ? "#ff7875" : "#ff4d4f";
	const bg = isDark ? "rgba(255,77,79,0.08)" : "rgba(255,77,79,0.05)";
	const border = isDark ? "rgba(255,77,79,0.35)" : "rgba(255,77,79,0.30)";
	// Renamed from `meta` to avoid shadowing the message-metadata `meta`
	// declared above; this is the muted text colour used by helper rows.
	const metaColor = token.colorTextSecondary;
	const codeBg = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)";

	return (
		<>
			{/*
			 * Scoped style override: the AI Bubble's `.ant-bubble-content`
			 * is `display: inline-block` (shrink-to-fit for short replies),
			 * so `width: 100%` on a child evaluates to 0. Use a `:has`
			 * selector to switch the specific bubble containing this
			 * ErrorCard to `display: block`, which lets the card fill the
			 * natural chat column width without overflowing into the
			 * sidebar / next pane (which `100vw` arithmetic can't avoid).
			 * Targets the closest ancestor matching `.ant-bubble-content`.
			 * Chromium ≥ 105 supports `:has`; Electron's bundled Chromium
			 * is far past that.
			 */}
			<style>{`.ant-bubble-content:has([data-error-card-id="${msg.id}"]){display:block!important;width:100%!important;}`}</style>
			<div
				data-error-card-id={msg.id}
				style={{
					width: "100%",
					// Cap the lower bound so the card always has room for
					// the meta grid + buttons even when the chat column is
					// unusually narrow (split layouts, popout windows).
					minWidth: 500,
					border: `1px solid ${border}`,
					borderRadius: token.borderRadiusLG,
					background: bg,
					padding: 12,
					boxSizing: "border-box",
				}}
			>
			{/* Header — title/headline on the left, status chip + action
				 icons on the right. Action icons (retry / copy) are icon-
				 only by default; the i18n label only surfaces on hover via
				 Tooltip, so the chrome stays compact. */}
				<div
					style={{
						display: "flex",
						alignItems: "flex-start",
						gap: 10,
						marginBottom:
							metaRows.length ||
							query ||
							ctx?.responseBodySnippet ||
							ctx?.stack
								? 10
								: 0,
					}}
				>
					<CloseCircleOutlined
						style={{ color: danger, fontSize: 18, marginTop: 2, flexShrink: 0 }}
					/>
					<div style={{ flex: 1, minWidth: 0 }}>
						<div
							style={{
								fontWeight: 600,
								color: danger,
								wordBreak: "break-word",
								lineHeight: 1.4,
							}}
						>
							{t("errorCard.title", "请求失败", { ns: "chat" })}
						</div>
						<div
							style={{
								marginTop: 2,
								color: token.colorText,
								fontSize: 13,
								wordBreak: "break-word",
								lineHeight: 1.5,
							}}
						>
							{headline}
						</div>
					</div>
					<div
						style={{
							display: "flex",
							alignItems: "center",
							gap: 6,
							flexShrink: 0,
						}}
					>
						{ctx?.statusCode !== undefined && (
							<Tag color="red" style={{ marginInlineEnd: 0 }}>
								HTTP {ctx.statusCode}
							</Tag>
						)}
						{onRetry && (
							<Tooltip title={t("errorCard.retry", "重试", { ns: "chat" })}>
								<Button
									size="small"
									type="text"
									danger
									icon={<ReloadOutlined />}
									onClick={handleRetry}
									aria-label={t("errorCard.retry", "重试", { ns: "chat" })}
								/>
							</Tooltip>
						)}
						<Tooltip
							title={t("errorCard.copyDetails", "复制详情", { ns: "chat" })}
						>
							<Button
								size="small"
								type="text"
								icon={<CopyOutlined />}
								onClick={handleCopy}
								aria-label={t("errorCard.copyDetails", "复制详情", {
									ns: "chat",
								})}
							/>
						</Tooltip>
					</div>
				</div>

			{/* Meta rows */}
			{metaRows.length > 0 && (
				<div
					style={{
						display: "grid",
						gridTemplateColumns: "max-content 1fr",
						gap: "4px 12px",
						fontSize: 12,
						marginBottom: 10,
					}}
				>
					{metaRows.map((row) => (
						<MetaLine key={row.labelKey} row={row} meta={metaColor} />
					))}
				</div>
			)}

			{/* Original query (collapsible) */}
			{query && (
				<Collapsible
					open={queryOpen}
					onToggle={() => setQueryOpen((v) => !v)}
					label={t("errorCard.query", "触发的请求", { ns: "chat" })}
					meta={metaColor}
				>
					<pre
						style={{
							margin: 0,
							padding: 8,
							background: codeBg,
							borderRadius: token.borderRadiusSM,
							fontSize: 12,
							lineHeight: 1.5,
							whiteSpace: "pre-wrap",
							wordBreak: "break-word",
							maxHeight: 240,
							overflow: "auto",
						}}
					>
						{query}
					</pre>
				</Collapsible>
			)}

			{/* Response body snippet (collapsible) */}
				{ctx?.responseBodySnippet && (
					<Collapsible
						open={bodyOpen}
						onToggle={() => setBodyOpen((v) => !v)}
						label={t("errorCard.responseBody", "原始响应", { ns: "chat" })}
						meta={metaColor}
					>
						<pre
							style={{
								margin: 0,
								padding: 8,
								background: codeBg,
								borderRadius: token.borderRadiusSM,
								fontSize: 12,
								lineHeight: 1.5,
								whiteSpace: "pre-wrap",
								wordBreak: "break-word",
								maxHeight: 240,
								overflow: "auto",
								fontFamily:
									"ui-monospace, SFMono-Regular, Menlo, monospace",
							}}
						>
							{ctx.responseBodySnippet}
						</pre>
					</Collapsible>
				)}

				{/* Error stack (collapsible) — surfaces the JS Error stack
				    propagated through `LLMErrorContext.stack`. Useful for
				    transport / SDK failures that don't have a structured
				    response body. */}
				{ctx?.stack && (
					<Collapsible
						open={stackOpen}
						onToggle={() => setStackOpen((v) => !v)}
						label={t("errorCard.stack", "错误堆栈", { ns: "chat" })}
						meta={metaColor}
					>
						<pre
							style={{
								margin: 0,
								padding: 8,
								background: codeBg,
								borderRadius: token.borderRadiusSM,
								fontSize: 11,
								lineHeight: 1.5,
								whiteSpace: "pre-wrap",
								wordBreak: "break-word",
								maxHeight: 320,
								overflow: "auto",
								fontFamily:
									"ui-monospace, SFMono-Regular, Menlo, monospace",
							}}
						>
							{ctx.stack}
						</pre>
					</Collapsible>
				)}
				</div>
			</>
		);
	}

function MetaLine({ row, meta }: { row: MetaRow; meta: string }) {
	return (
		<>
			<div style={{ color: meta, alignSelf: "center" }}>{row.labelKey}</div>
			<div
				style={{
					color: meta,
					wordBreak: "break-all",
					fontFamily: row.monospace
						? "ui-monospace, SFMono-Regular, Menlo, monospace"
						: undefined,
				}}
			>
				{row.value}
			</div>
		</>
	);
}

function Collapsible({
	open,
	onToggle,
	label,
	meta,
	children,
}: {
	open: boolean;
	onToggle: () => void;
	label: string;
	meta: string;
	children: React.ReactNode;
}) {
	return (
		<div style={{ marginBottom: 8 }}>
			<button
				type="button"
				onClick={onToggle}
				style={{
					all: "unset",
					cursor: "pointer",
					display: "inline-flex",
					alignItems: "center",
					gap: 4,
					fontSize: 12,
					color: meta,
					padding: "2px 0",
				}}
			>
				{open ? <DownOutlined /> : <RightOutlined />}
				{label}
			</button>
			{open && <div style={{ marginTop: 6 }}>{children}</div>}
		</div>
	);
}
