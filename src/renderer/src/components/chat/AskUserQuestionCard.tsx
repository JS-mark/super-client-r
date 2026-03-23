import {
	CheckCircleOutlined,
	ForwardOutlined,
	QuestionCircleOutlined,
	SendOutlined,
} from "@ant-design/icons";
import { Button, Input, Tag, theme } from "antd";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Message } from "../../stores/chatStore";
import type {
	AskUserQuestionInput,
	AskUserQuestionItem,
} from "../../types/electron";

const { useToken } = theme;
const { TextArea } = Input;

/** Per-question answer state */
interface QuestionAnswer {
	selected: number[]; // option indices, -1 = "Other"
	otherText: string;
}

interface AskUserQuestionCardProps {
	toolCall: NonNullable<Message["toolCall"]>;
	onSubmit: (
		toolCallId: string,
		approved: boolean,
		updatedInput?: Record<string, unknown>,
	) => void;
}

/**
 * Parse AskUserQuestion tool input safely
 */
function parseQuestions(
	input: Record<string, unknown>,
): AskUserQuestionItem[] | null {
	const questions = (input as unknown as AskUserQuestionInput).questions;
	if (!Array.isArray(questions) || questions.length === 0) return null;
	return questions;
}

/**
 * Custom radio/checkbox dot component
 */
const SelectionDot: React.FC<{
	selected: boolean;
	multi: boolean;
	color: string;
	borderColor: string;
}> = ({ selected, multi, color, borderColor }) => (
	<span
		style={{
			display: "inline-flex",
			alignItems: "center",
			justifyContent: "center",
			width: 16,
			height: 16,
			borderRadius: multi ? 3 : "50%",
			border: `1.5px solid ${selected ? color : borderColor}`,
			flexShrink: 0,
			marginTop: 2,
			transition: "all 0.15s",
		}}
	>
		{selected && (
			<span
				style={{
					display: "block",
					width: multi ? 8 : 8,
					height: multi ? 8 : 8,
					borderRadius: multi ? 1.5 : "50%",
					backgroundColor: color,
				}}
			/>
		)}
	</span>
);

/**
 * Interactive question card rendered when AI calls AskUserQuestion tool.
 * Replaces ToolCallCard for this specific tool.
 */
export const AskUserQuestionCard: React.FC<AskUserQuestionCardProps> = ({
	toolCall,
	onSubmit,
}) => {
	const { token } = useToken();
	const { t } = useTranslation("chat");

	const questions = useMemo(
		() => parseQuestions(toolCall.input),
		[toolCall.input],
	);

	// Build initial answers map
	const [answers, setAnswers] = useState<Map<number, QuestionAnswer>>(() => {
		const m = new Map<number, QuestionAnswer>();
		if (questions) {
			for (let i = 0; i < questions.length; i++) {
				m.set(i, { selected: [], otherText: "" });
			}
		}
		return m;
	});

	const isInteractive = toolCall.status === "awaiting_approval";
	const isCompleted =
		toolCall.status === "pending" || toolCall.status === "success";
	const isSkipped = toolCall.status === "error";

	const handleToggleOption = useCallback(
		(qIdx: number, optIdx: number, multiSelect: boolean) => {
			if (!isInteractive) return;
			setAnswers((prev) => {
				const next = new Map(prev);
				const current = next.get(qIdx) || {
					selected: [],
					otherText: "",
				};
				if (multiSelect) {
					const idx = current.selected.indexOf(optIdx);
					const selected =
						idx >= 0
							? current.selected.filter((i) => i !== optIdx)
							: [...current.selected, optIdx];
					next.set(qIdx, { ...current, selected });
				} else {
					next.set(qIdx, { ...current, selected: [optIdx] });
				}
				return next;
			});
		},
		[isInteractive],
	);

	const handleOtherTextChange = useCallback(
		(qIdx: number, text: string) => {
			if (!isInteractive) return;
			setAnswers((prev) => {
				const next = new Map(prev);
				const current = next.get(qIdx) || {
					selected: [],
					otherText: "",
				};
				next.set(qIdx, { ...current, otherText: text });
				return next;
			});
		},
		[isInteractive],
	);

	const handleSubmit = useCallback(() => {
		if (!questions) return;
		const answersPayload: Record<string, string> = {};
		for (const [qIdx, ans] of answers.entries()) {
			const q = questions[qIdx];
			if (!q) continue;
			if (ans.selected.includes(-1)) {
				// "Other" selected
				answersPayload[q.question] = ans.otherText;
			} else {
				answersPayload[q.question] = ans.selected
					.map((i) => q.options[i]?.label)
					.filter(Boolean)
					.join(", ");
			}
		}
		onSubmit(toolCall.id, true, { answers: answersPayload });
	}, [questions, answers, onSubmit, toolCall.id]);

	const handleSkip = useCallback(() => {
		onSubmit(toolCall.id, false);
	}, [onSubmit, toolCall.id]);

	// Check if at least one question has a selection
	const hasAnySelection = useMemo(() => {
		for (const ans of answers.values()) {
			if (ans.selected.length > 0) return true;
		}
		return false;
	}, [answers]);

	if (!questions) return null;

	// Read-only summary for completed state
	const renderSummary = () => {
		if (isSkipped) {
			return (
				<div
					className="flex items-center gap-1.5 px-3 py-2"
					style={{ color: token.colorTextTertiary, fontSize: 12 }}
				>
					<ForwardOutlined style={{ fontSize: 11 }} />
					{t("askUserQuestion.skipped")}
				</div>
			);
		}
		if (isCompleted && toolCall.result) {
			const result = toolCall.result as {
				answers?: Record<string, string>;
			};
			if (result.answers) {
				return (
					<div className="px-3 py-2 flex flex-col gap-1">
						<div
							className="flex items-center gap-1.5"
							style={{
								color: token.colorSuccess,
								fontSize: 12,
								fontWeight: 500,
							}}
						>
							<CheckCircleOutlined style={{ fontSize: 11 }} />
							{t("askUserQuestion.answered")}
						</div>
						{Object.entries(result.answers).map(([q, a]) => (
							<div
								key={q}
								style={{ fontSize: 12, lineHeight: 1.6 }}
							>
								<span
									style={{
										color: token.colorTextSecondary,
										fontWeight: 500,
									}}
								>
									{q}
								</span>
								<span
									style={{
										color: token.colorTextTertiary,
										margin: "0 6px",
									}}
								>
									&rarr;
								</span>
								<span style={{ color: token.colorText }}>
									{a || "—"}
								</span>
							</div>
						))}
					</div>
				);
			}
		}
		return null;
	};

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
				<QuestionCircleOutlined
					style={{ fontSize: 13, color: token.colorSuccess }}
				/>
				<span
					style={{
						fontSize: 12,
						fontWeight: 600,
						color: token.colorText,
					}}
				>
					{t("askUserQuestion.title")}
				</span>
			</div>

			{/* Body */}
			{isInteractive ? (
				<div className="px-3 py-3 flex flex-col gap-4">
					{questions.map((q, qIdx) => (
						<div key={q.question} className="flex flex-col gap-2">
							{/* Divider between questions */}
							{qIdx > 0 && (
								<div
									style={{
										borderTop: `1px solid ${token.colorBorderSecondary}`,
										marginBottom: 4,
									}}
								/>
							)}
							{/* Header tag */}
							<Tag
								style={{
									fontSize: 11,
									lineHeight: "20px",
									borderRadius: 4,
									width: "fit-content",
								}}
							>
								{q.header}
							</Tag>
							{/* Question text */}
							<div
								style={{
									fontSize: 13,
									fontWeight: 600,
									color: token.colorText,
									lineHeight: 1.5,
								}}
							>
								{q.question}
							</div>
							{/* Options */}
							<div className="flex flex-col gap-1">
								{q.options.map((opt, optIdx) => {
									const isSelected = (
										answers.get(qIdx)?.selected || []
									).includes(optIdx);
									return (
										<div
											key={opt.label}
											className="flex gap-2.5 rounded-md px-2.5 py-2 cursor-pointer"
											style={{
												backgroundColor: isSelected
													? `${token.colorSuccessBg}`
													: "transparent",
												border: `1px solid ${isSelected ? token.colorSuccessBorder : "transparent"}`,
												transition: "all 0.15s",
											}}
											onClick={() =>
												handleToggleOption(
													qIdx,
													optIdx,
													q.multiSelect,
												)
											}
										>
											<SelectionDot
												selected={isSelected}
												multi={q.multiSelect}
												color={token.colorSuccess}
												borderColor={
													token.colorBorder
												}
											/>
											<div className="flex flex-col gap-0.5 min-w-0">
												<span
													style={{
														fontSize: 13,
														fontWeight: 500,
														color: token.colorText,
														lineHeight: 1.4,
													}}
												>
													{opt.label}
												</span>
												{opt.description && (
													<span
														style={{
															fontSize: 11,
															color: token.colorTextTertiary,
															lineHeight: 1.4,
														}}
													>
														{opt.description}
													</span>
												)}
											</div>
										</div>
									);
								})}
								{/* "Other" option */}
								{(() => {
									const isOtherSelected = (
										answers.get(qIdx)?.selected || []
									).includes(-1);
									return (
										<div className="flex flex-col gap-1.5">
											<div
												className="flex gap-2.5 rounded-md px-2.5 py-2 cursor-pointer"
												style={{
													backgroundColor:
														isOtherSelected
															? `${token.colorSuccessBg}`
															: "transparent",
													border: `1px solid ${isOtherSelected ? token.colorSuccessBorder : "transparent"}`,
													transition: "all 0.15s",
												}}
												onClick={() =>
													handleToggleOption(
														qIdx,
														-1,
														q.multiSelect,
													)
												}
											>
												<SelectionDot
													selected={isOtherSelected}
													multi={q.multiSelect}
													color={token.colorSuccess}
													borderColor={
														token.colorBorder
													}
												/>
												<span
													style={{
														fontSize: 13,
														fontWeight: 500,
														color: token.colorText,
														lineHeight: 1.4,
													}}
												>
													{t(
														"askUserQuestion.other",
													)}
												</span>
											</div>
											{isOtherSelected && (
												<div
													style={{
														paddingLeft: 28,
													}}
												>
													<TextArea
														size="small"
														autoSize={{
															minRows: 2,
															maxRows: 4,
														}}
														placeholder={t(
															"askUserQuestion.otherPlaceholder",
														)}
														value={
															answers.get(qIdx)
																?.otherText ||
															""
														}
														onChange={(e) =>
															handleOtherTextChange(
																qIdx,
																e.target.value,
															)
														}
														style={{
															fontSize: 12,
														}}
													/>
												</div>
											)}
										</div>
									);
								})()}
							</div>
						</div>
					))}
				</div>
			) : (
				renderSummary()
			)}

			{/* Footer actions */}
			{isInteractive && (
				<div
					className="flex items-center justify-end gap-2 px-3 py-2"
					style={{
						borderTop: `1px solid ${token.colorBorderSecondary}`,
					}}
				>
					<Button
						size="small"
						icon={<ForwardOutlined />}
						onClick={handleSkip}
					>
						{t("askUserQuestion.skip")}
					</Button>
					<Button
						type="primary"
						size="small"
						icon={<SendOutlined />}
						disabled={!hasAnySelection}
						onClick={handleSubmit}
						style={{
							backgroundColor: hasAnySelection
								? token.colorSuccess
								: undefined,
							borderColor: hasAnySelection
								? token.colorSuccess
								: undefined,
						}}
					>
						{t("askUserQuestion.submit")}
					</Button>
				</div>
			)}
		</div>
	);
};
