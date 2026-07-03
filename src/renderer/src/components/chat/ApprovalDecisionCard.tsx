import type * as React from "react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Button, Radio, Tag, Tooltip, theme } from "antd";
import { useTranslation } from "react-i18next";

const { useToken } = theme;

// Tick at 1s — the visible `(Ns)` badge only renders whole seconds, and the
// progress bar uses a matching `transition: width 1s linear` so the browser
// interpolates between ticks without us having to setState more often.
// The earlier 250ms cadence caused a 4Hz re-render storm on every mounted
// approval card (and inserted a fresh `<style>` tag with a `:has()` rule
// each tick) — see the perf investigation in
// `docs/code-review-2026-06-25.md`. Display still uses `Math.ceil` so the
// badge starts at the full requested second (`20s … 1s … fire`).
const COUNTDOWN_TICK_MS = 1000;

export interface ApprovalDecisionOption {
	value: string;
	label: React.ReactNode;
	description?: React.ReactNode;
	disabled?: boolean;
}

interface ApprovalDecisionCardProps {
	icon?: React.ReactNode;
	title: React.ReactNode;
	description?: React.ReactNode;
	children?: React.ReactNode;
	footer?: React.ReactNode;
	options?: ApprovalDecisionOption[];
	value?: string;
	onChange?: (value: string) => void;
	confirmLabel?: React.ReactNode;
	confirmIcon?: React.ReactNode;
	confirmDanger?: boolean;
	confirmDisabled?: boolean;
	onConfirm?: () => void;
	rejectLabel?: React.ReactNode;
	rejectIcon?: React.ReactNode;
	rejectDisabled?: boolean;
	onReject?: () => void;
	tone?: "default" | "warning" | "success";
	maxWidth?: number;
	density?: "default" | "compact";
	/**
	 * When true the card grows to fill its container instead of capping at
	 * `maxWidth`. Used by tool-approval prompts so they feel like a prominent
	 * inline interrupt rather than a small confirmation pill. Has no effect
	 * on `AskUserQuestionCard`, which keeps the old, narrower look.
	 */
	fullWidth?: boolean;
	/**
	 * Optional dismiss handler invoked when the user presses Escape on the
	 * card while nothing editable is focused. When undefined the card ignores
	 * Escape, matching prior behaviour.
	 */
	onDismiss?: () => void;
	/**
	 * Optional auto-reject countdown in milliseconds. The reject button shows
	 * a `(Ns)` suffix and a thin progress bar slides across the card's bottom.
	 * On expiry we invoke `onAutoReject` (or fall back to `onReject`). Hovering
	 * over the card pauses the countdown so the user has time to read; leaving
	 * resumes from where it paused. Pass `0` / `undefined` to disable.
	 */
	autoRejectAfterMs?: number;
	onAutoReject?: () => void;
	/**
	 * Optional badge shown above the primary content indicating the approval
	 * request originated from a subagent (via the internal `Task` tool). Uses
	 * the muted "default" AntD Tag colour so it reads as auxiliary metadata,
	 * not as another action.
	 *
	 * Phase 4 Round 7 MVP: the prop plumbing lives here so tests can pin
	 * behaviour with a fixture, but end-to-end wiring from the transcript
	 * (i.e. mapping `Message.toolCall.subagentRunId` → this prop) is a
	 * follow-up batch; today's `ToolCallCard` passes `undefined` unless the
	 * caller explicitly threads it through.
	 */
	subagentSource?: {
		profileName?: string;
		taskGoal?: string;
		subagentRunId: string;
	};
}

export function ApprovalDecisionCard({
	icon,
	title,
	description,
	children,
	footer,
	options,
	value,
	onChange,
	confirmLabel,
	confirmIcon,
	confirmDanger,
	confirmDisabled,
	onConfirm,
	rejectLabel,
	rejectIcon,
	rejectDisabled,
	onReject,
	tone = "default",
	// Accepted for backwards compat with call sites (ToolCallCard, AskUserQuestionCard)
	// but no longer used internally — the card now flexes via `fullWidth` and the
	// scoped `:has()` style override below. Prefixed with `_` so lint stops
	// warning while keeping the public prop in place until all callers are updated.
	maxWidth: _maxWidth,
	density = "default",
	fullWidth = true,
	onDismiss,
	autoRejectAfterMs,
	onAutoReject,
	subagentSource,
}: ApprovalDecisionCardProps) {
	const { token } = useToken();
	const { t } = useTranslation("chat");
	const compact = density === "compact";
	// ── Auto-reject countdown ──────────────────────────────────────────────
	const countdownEnabled =
		typeof autoRejectAfterMs === "number" && autoRejectAfterMs > 0;
	const [remainingMs, setRemainingMs] = useState(autoRejectAfterMs ?? 0);
	const [paused, setPaused] = useState(false);
	const firedRef = useRef(false);

	// Callbacks live in refs so the interval effect doesn't have to list them
	// as deps. Without this, parent re-renders (which happen on every
	// streaming chunk) would pass fresh function identities, tearing down +
	// recreating setInterval before any tick fires — that's what caused the
	// earlier "countdown stuck until you click" bug.
	const onRejectRef = useRef(onReject);
	const onAutoRejectRef = useRef(onAutoReject);
	useEffect(() => {
		onRejectRef.current = onReject;
		onAutoRejectRef.current = onAutoReject;
	}, [onReject, onAutoReject]);

	// Reset on autoRejectAfterMs change (or on enable). Resetting both the
	// display and the fired guard here is the only state mutation needed —
	// the ticking effect below is purely a side-effect with no setState in
	// its setup path (we deferred all state writes into the interval
	// callback to avoid render-loop interactions with the parent).
	useEffect(() => {
		if (!countdownEnabled) return;
		firedRef.current = false;
		setRemainingMs(autoRejectAfterMs ?? 0);
	}, [autoRejectAfterMs, countdownEnabled]);

	// Single ticking effect. Decrements `remainingMs` by COUNTDOWN_TICK_MS
	// every tick via the functional setter, so we don't capture stale
	// `remainingMs` in a closure and don't have to list it as a dep (which
	// would tear down the interval on every tick). When `remainingMs` reaches
	// 0 the next render of the side-effect effect below fires the callback.
	useEffect(() => {
		if (!countdownEnabled || paused) return;
		const id = window.setInterval(() => {
			setRemainingMs((prev) => {
				if (prev <= COUNTDOWN_TICK_MS) return 0;
				return prev - COUNTDOWN_TICK_MS;
			});
		}, COUNTDOWN_TICK_MS);
		return () => window.clearInterval(id);
	}, [countdownEnabled, paused]);

	// Fire onAutoReject (or onReject) exactly once when remainingMs hits 0.
	// Split out so the ticking effect stays a pure "decrement on a timer";
	// putting the callback inside the setter is a React side-effect smell.
	useEffect(() => {
		if (!countdownEnabled) return;
		if (remainingMs > 0) return;
		if (firedRef.current) return;
		firedRef.current = true;
		(onAutoRejectRef.current ?? onRejectRef.current)?.();
	}, [countdownEnabled, remainingMs]);

	// Card-level keyboard: Enter → confirm (approve once), Shift+Enter → reject,
	// Escape → optional dismiss. We skip when the event originates inside an
	// editable target so text fields within the card retain their native
	// behaviour.
	const handleCardKeyDown = useCallback(
		(event: React.KeyboardEvent<HTMLDivElement>) => {
			if (event.nativeEvent.isComposing) return;
			const target = event.target as HTMLElement | null;
			const tag = target?.tagName?.toLowerCase();
			const insideEditable =
				tag === "textarea" ||
				tag === "input" ||
				target?.isContentEditable === true;
			if (insideEditable) return;

			if (event.key === "Escape") {
				if (onDismiss) {
					event.preventDefault();
					onDismiss();
				}
				return;
			}

			if (event.key !== "Enter") return;

			if (event.shiftKey) {
				if (onReject && !rejectDisabled) {
					event.preventDefault();
					onReject();
				}
				return;
			}

			if (onConfirm && !confirmDisabled) {
				event.preventDefault();
				onConfirm();
			}
		},
		[
			confirmDisabled,
			onConfirm,
			onDismiss,
			onReject,
			rejectDisabled,
		],
	);

	const totalMs = autoRejectAfterMs ?? 0;
	const remainingSec =
		countdownEnabled && remainingMs > 0
			? Math.max(1, Math.ceil(remainingMs / 1000))
			: 0;
	const progressPct =
		countdownEnabled && totalMs > 0
			? Math.max(0, Math.min(100, (remainingMs / totalMs) * 100))
			: 0;

	const toneColor =
		tone === "warning"
			? token.colorWarning
			: tone === "success"
				? token.colorSuccess
				: token.colorText;
	const toneBg =
		tone === "warning"
			? token.colorWarningBg
			: tone === "success"
				? token.colorSuccessBg
				: token.colorFillQuaternary;
	const toneBorder =
		tone === "warning"
			? token.colorWarningBorder
			: tone === "success"
				? token.colorSuccessBorder
				: token.colorBorderSecondary;

	// Stable per-instance id used by the scoped `:has` escape rule below.
	// React's `useId` gives us a deterministic value across renders so the
	// style tag and the data-attribute stay in sync.
	const rawId = useId();
	const escapeId = useMemo(
		() => rawId.replace(/[^a-zA-Z0-9_-]/g, "_"),
		[rawId],
	);
	// Memoised so the `<style>` tag's text node identity doesn't churn on
	// every parent re-render (and so it isn't rebuilt every countdown tick).
	// `useId` is stable for the lifetime of the component, so this string is
	// effectively computed once.
	const fullWidthStyle = useMemo(
		() =>
			`.ant-bubble:has([data-approval-card-id="${escapeId}"]) > .ant-bubble-body{flex:1!important;min-width:0!important;}\n` +
			`.ant-bubble-content:has([data-approval-card-id="${escapeId}"]){display:block!important;width:100%!important;max-width:none!important;margin:0!important;}`,
		[escapeId],
	);

	return (
		<>
			{fullWidth && (
				// Scoped style escape — same trick `ErrorCard.tsx` uses.
				// The antd-x bubble chain that bites us when we want a wide
				// card is THREE layers, not just one, and lifting only the
				// innermost (`.ant-bubble-content`) is the trap I hit first:
				//
				//   .ant-bubble                    (display: flex, row)
				//     ├─ .ant-bubble-avatar
				//     └─ .ant-bubble-body          (flex item, default shrink-to-fit)
				//          └─ .ant-bubble-content  (display: inline-block from AI role,
				//                                   plus max-width: 56rem from
				//                                   `bubbleListStyles.content`)
				//
				// To fill the chat column we need all three lifted:
				//   1) `.ant-bubble-body` gets `flex: 1` so it stops sizing
				//      to its child and grows into the bubble row.
				//   2) `.ant-bubble-content` is forced to `display: block;
				//      width: 100%; max-width: none` so the 56rem cap and
				//      the inline-block shrink-to-fit are both undone.
				//   3) `min-width: 0` on the body is required for it to be
				//      allowed to shrink below its content's intrinsic min
				//      on narrow viewports — without it, CJK text without
				//      breakpoints would refuse to wrap.
				//
				// Targeted via :has() so only the bubble owning THIS card is
				// affected; siblings keep their normal shrink-to-fit chrome.
				// Chromium ≥105 supports :has; Electron's bundled Chromium
				// is well past that.
				<style>{fullWidthStyle}</style>
			)}
			<div
				data-approval-card-id={fullWidth ? escapeId : undefined}
				className="my-2 overflow-hidden relative"
				tabIndex={-1}
				onKeyDown={handleCardKeyDown}
				onMouseEnter={countdownEnabled ? () => setPaused(true) : undefined}
				onMouseLeave={countdownEnabled ? () => setPaused(false) : undefined}
				style={{
					// Outer chrome: border-only (no shadow). We use the stronger
					// `colorBorder` token here — without the previous shadow,
					// `colorBorderSecondary` looked too faint to separate the
					// card from the chat bubble background, especially in dark
					// mode. `colorBorder` is theme-aware (antd flips it to a
					// lighter grey in dark themes), so both modes stay legible.
					// Inner separators (header underline, option-row borders)
					// continue to use `colorBorderSecondary` so the visual
					// hierarchy "outer chrome stronger, inner divisions softer"
					// reads correctly.
					border: `1px solid ${token.colorBorder}`,
					backgroundColor: token.colorBgContainer,
					// `fullWidth` lets the card stretch to fill the bubble's
					// content area (whose 56rem cap is lifted by the `:has`
					// rule above). The `minWidth` keeps a sensible floor on
					// narrow viewports where the chat column itself is
					// smaller than 720px.
					...(fullWidth
						? {
								width: "100%",
							}
						: {}),
					borderRadius: compact ? 12 : 10,
				}}
			>
			<div
				className="flex items-center gap-2.5"
				style={{
					padding: compact ? "10px 14px" : "12px 16px",
					borderBottom: `1px solid ${token.colorBorderSecondary}`,
					background: `linear-gradient(180deg, ${token.colorFillQuaternary}, ${token.colorBgContainer})`,
				}}
			>
				{icon && (
					<span
						className="inline-flex items-center justify-center"
						style={{
							width: 22,
							height: 22,
							borderRadius: 6,
							color: toneColor,
							backgroundColor: toneBg,
							border: `1px solid ${toneBorder}`,
							flexShrink: 0,
						}}
					>
						{icon}
					</span>
				)}
				<span
					className="min-w-0 truncate"
					style={{
						fontSize: 14,
						fontWeight: 600,
						color: token.colorText,
						lineHeight: 1.35,
					}}
				>
					{title}
				</span>
			</div>

			<div
				className="flex flex-col"
				style={{
					padding: compact ? "12px 14px" : "14px 16px",
					gap: compact ? 10 : 12,
				}}
			>
				{subagentSource && (
					<div data-testid="approval-subagent-source">
						<Tag
							color="default"
							style={{ fontSize: 11, margin: 0 }}
						>
							{t("subagentSource.badge", "▲ From subagent: {{name}}", {
								name:
									subagentSource.profileName ||
									subagentSource.taskGoal ||
									subagentSource.subagentRunId,
							})}
						</Tag>
					</div>
				)}
				{description && (
					<div
						className="rounded-md"
						style={{
							padding: compact ? "8px 10px" : "10px 12px",
							backgroundColor: toneBg,
							border: `1px solid ${toneBorder}`,
							color: token.colorTextSecondary,
							fontSize: compact ? 12 : 13,
							lineHeight: 1.55,
						}}
					>
						{description}
					</div>
				)}
				{children}
				{options && options.length > 0 && (
					<Radio.Group
						value={value}
						onChange={(e) => onChange?.(e.target.value)}
						style={{ width: "100%" }}
					>
						<div className="flex flex-col gap-2">
							{options.map((option, index) => {
								const selected = value === option.value;
								const tooltipTitle = (
									<div>
										<div style={{ fontWeight: 600 }}>{option.label}</div>
										{option.description && (
											<div style={{ opacity: 0.78, marginTop: 2 }}>
												{option.description}
											</div>
										)}
									</div>
								);

								return (
									<div
										key={option.value}
										className="group flex items-center gap-3 min-w-0"
										style={{
											width: "100%",
											padding: compact ? "8px 10px" : "10px 12px",
											borderRadius: 8,
											border: `1px solid ${
												selected ? toneBorder : token.colorBorderSecondary
											}`,
											backgroundColor: selected
												? toneBg
												: token.colorFillQuaternary,
											cursor: option.disabled ? "not-allowed" : "pointer",
											opacity: option.disabled ? 0.52 : 1,
											transition:
												"background-color 160ms ease, border-color 160ms ease, transform 120ms ease",
										}}
										onClick={() => {
											if (!option.disabled) onChange?.(option.value);
										}}
									>
										<Radio
											value={option.value}
											disabled={option.disabled}
											style={{ flexShrink: 0, marginInlineEnd: 0 }}
										/>
										<span
											className="inline-flex items-center justify-center"
											style={{
												width: 22,
												height: 22,
												borderRadius: 6,
												backgroundColor: selected
													? token.colorBgContainer
													: token.colorFillSecondary,
												color: selected ? toneColor : token.colorTextTertiary,
												fontSize: 12,
												fontWeight: 600,
												fontVariantNumeric: "tabular-nums",
												flexShrink: 0,
											}}
										>
											{index + 1}
										</span>
										<div className="min-w-0 flex-1">
											<Tooltip title={tooltipTitle} mouseEnterDelay={0.35}>
												<div className="min-w-0">
													<div
														className="truncate"
														style={{
															color: token.colorText,
															fontSize: 13,
															fontWeight: 600,
															lineHeight: 1.35,
														}}
													>
														{option.label}
													</div>
													{option.description && (
														<div
															className="truncate"
															style={{
																color: token.colorTextTertiary,
																fontSize: 12,
																lineHeight: 1.4,
																marginTop: 2,
															}}
														>
															{option.description}
														</div>
													)}
												</div>
											</Tooltip>
										</div>
									</div>
								);
							})}
						</div>
					</Radio.Group>
				)}
			</div>

			{(footer || onConfirm || onReject) && (
				<div
					className="flex items-center justify-center gap-3 px-4 py-3"
					style={{
						padding: compact ? "10px 14px" : "12px 16px",
						borderTop: `1px solid ${token.colorBorderSecondary}`,
						backgroundColor: token.colorFillQuaternary,
					}}
				>
					{footer}
					{onReject && (
						<Button
							danger
							size="middle"
							icon={rejectIcon}
							disabled={rejectDisabled}
							onClick={onReject}
							style={{
								minWidth: compact ? 128 : 112,
								height: compact ? 34 : 36,
								fontWeight: 600,
								fontVariantNumeric: "tabular-nums",
							}}
						>
							{rejectLabel}
							{countdownEnabled && remainingSec > 0 && (
								<span style={{ marginInlineStart: 6, opacity: 0.72 }}>
									({remainingSec}s)
								</span>
							)}
						</Button>
					)}
					{onConfirm && (
						<Button
							type={confirmDanger ? "default" : "primary"}
							danger={confirmDanger}
							size="middle"
							icon={confirmIcon}
							disabled={confirmDisabled}
							onClick={onConfirm}
							style={{
								minWidth: compact ? 128 : 112,
								height: compact ? 34 : 36,
								fontWeight: 600,
							}}
						>
							{confirmLabel}
						</Button>
					)}
				</div>
			)}

			{countdownEnabled && (
				<>
					{/*
					  Thin progress bar at the very bottom edge — purely
					  decorative reinforcement of the `(Ns)` badge so the
					  countdown is perceptible even when the user's eyes are
					  on the description text. Width animates linearly with
					  the remaining ms; pauses on hover with the rest of the
					  countdown.
					*/}
					<div
						aria-hidden
						style={{
							position: "absolute",
							left: 0,
							right: 0,
							bottom: 0,
							height: 2,
							backgroundColor: token.colorFillQuaternary,
							overflow: "hidden",
							pointerEvents: "none",
						}}
					>
						<div
							style={{
								width: `${progressPct}%`,
								height: "100%",
								backgroundColor:
									tone === "warning"
										? token.colorWarning
										: tone === "success"
											? token.colorSuccess
											: token.colorPrimary,
								// Transition duration matches the tick cadence
								// (`COUNTDOWN_TICK_MS`) so the browser linearly
								// interpolates the bar between ticks and it
								// looks continuous rather than stepping. We
								// kill the transition while paused so it
								// doesn't slide a phantom tick on resume.
								transition: paused
									? "none"
									: `width ${COUNTDOWN_TICK_MS}ms linear`,
								opacity: paused ? 0.55 : 1,
							}}
						/>
					</div>
					{/*
					  Live region for screen readers — `polite` so it doesn't
					  interrupt, but periodically announces the remaining
					  time. We only emit at whole-second changes via
					  `remainingSec` to avoid spam.
					*/}
					<span
						role="status"
						aria-live="polite"
						style={{
							position: "absolute",
							width: 1,
							height: 1,
							padding: 0,
							margin: -1,
							overflow: "hidden",
							clip: "rect(0,0,0,0)",
							whiteSpace: "nowrap",
							border: 0,
						}}
					>
						{paused
							? "Countdown paused"
							: remainingSec > 0
								? `Auto-reject in ${remainingSec} seconds`
								: "Auto-reject triggered"}
					</span>
				</>
			)}
		</div>
		</>
	);
}
