import type * as React from "react";
import { Button, Radio, Tooltip, theme } from "antd";

const { useToken } = theme;

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
	maxWidth,
	density = "default",
}: ApprovalDecisionCardProps) {
	const { token } = useToken();
	const compact = density === "compact";
	const resolvedMaxWidth = maxWidth ?? (compact ? 520 : 560);
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

	return (
		<div
			className="my-2 overflow-hidden"
			style={{
				border: `1px solid ${token.colorBorderSecondary}`,
				backgroundColor: token.colorBgContainer,
				maxWidth: resolvedMaxWidth,
				borderRadius: compact ? 12 : 10,
				boxShadow: compact ? token.boxShadowTertiary : token.boxShadowSecondary,
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
							}}
						>
							{rejectLabel}
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
		</div>
	);
}
