import {
	CheckCircleOutlined,
	ForwardOutlined,
	LeftOutlined,
	QuestionCircleOutlined,
	RightOutlined,
	SendOutlined,
} from "@ant-design/icons";
import { Button, Input, Tag, theme } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Message } from "../../stores/chatStore";
import type {
	AskUserQuestionInput,
	AskUserQuestionItem,
} from "../../types/electron";
import { ApprovalDecisionCard } from "./ApprovalDecisionCard";

const { useToken } = theme;
const { TextArea } = Input;

/** Per-question answer state */
export interface QuestionAnswer {
	selected: number[]; // option indices, -1 = "Other"
	otherText: string;
}

interface AskUserQuestionCardProps {
	toolCall: NonNullable<Message["toolCall"]>;
	compact?: boolean;
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

export function isAskUserQuestionComplete(
	questions: AskUserQuestionItem[] | null,
	answers: Map<number, QuestionAnswer>,
): boolean {
	if (!questions) return false;
	for (let i = 0; i < questions.length; i++) {
		const ans = answers.get(i);
		if (!ans || ans.selected.length === 0) return false;
		if (ans.selected.includes(-1) && !ans.otherText.trim()) {
			return false;
		}
	}
	return true;
}

export function buildAskUserQuestionOutput(
	questions: AskUserQuestionItem[],
	answers: Map<number, QuestionAnswer>,
): { questions: AskUserQuestionItem[]; answers: Record<string, string> } {
	const answersPayload: Record<string, string> = {};
	for (const [qIdx, ans] of answers.entries()) {
		const q = questions[qIdx];
		if (!q) continue;
		if (ans.selected.includes(-1)) {
			answersPayload[q.question] = ans.otherText;
		} else {
			answersPayload[q.question] = ans.selected
				.map((i) => q.options[i]?.label)
				.filter(Boolean)
				.join(", ");
		}
	}
	return { questions, answers: answersPayload };
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
	compact = false,
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

	// Pagination state. With a single question this collapses to the legacy
	// single-page layout. With 2+ questions the user pages through one at a
	// time — easier to focus and matches Stitch/Linear-style multi-step
	// pickers. We clamp the page to the question count when `questions`
	// (or its length) changes so a late-arriving streaming update never
	// strands the user on a non-existent page.
	const totalPages = questions?.length ?? 0;
	const [currentPage, setCurrentPage] = useState(0);
	useEffect(() => {
		if (totalPages === 0) return;
		setCurrentPage((p) => Math.min(p, totalPages - 1));
	}, [totalPages]);

	const isInteractive = toolCall.status === "awaiting_approval";
	const isWaiting = toolCall.status === "pending" && !toolCall.result;
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
		onSubmit(toolCall.id, true, buildAskUserQuestionOutput(questions, answers));
	}, [questions, answers, onSubmit, toolCall.id]);

	const handleSkip = useCallback(() => {
		onSubmit(toolCall.id, false);
	}, [onSubmit, toolCall.id]);

	const canSubmit = useMemo(() => {
		return isAskUserQuestionComplete(questions, answers);
	}, [answers, questions]);

	/** Is the question at `idx` answered well enough to advance? Mirrors the
	 *  per-question rule inside `isAskUserQuestionComplete`. */
	const isQuestionAnswered = useCallback(
		(idx: number): boolean => {
			const ans = answers.get(idx);
			if (!ans || ans.selected.length === 0) return false;
			if (ans.selected.includes(-1) && !ans.otherText.trim()) return false;
			return true;
		},
		[answers],
	);

	const isLastPage = currentPage >= totalPages - 1;
	const handlePrev = useCallback(() => {
		setCurrentPage((p) => Math.max(0, p - 1));
	}, []);
	const handleNext = useCallback(() => {
		setCurrentPage((p) => Math.min(totalPages - 1, p + 1));
	}, [totalPages]);

	if (!questions) return null;

	// Read-only summary for completed state. Resilient to any single field
	// going missing:
	//   - Questions come from `toolCall.input.questions` (always preserved
	//     by shallow-merge in `updateMessageToolCall` — the original
	//     `tool_call` event populated it).
	//   - Answers come from `toolCall.result.answers` (set by
	//     `respondToApproval`'s optimistic update and re-affirmed by the
	//     main-process `tool_result` event). We also accept a raw
	//     `Record<string, string>` result for forward-compat.
	// Falls back to "answered (no detail)" rather than rendering nothing,
	// so the chat history always tells the user something happened here.
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
		if (!isCompleted) return null;

		// Best-effort answers map. Priority order:
		//   1. `toolCall.approval.userAnswers` — written by the renderer at
		//      submit time. Survives every `tool_result` / `tool_error`
		//      shallow-overwrite because none of them touch `approval`.
		//   2. `toolCall.result.answers` — canonical payload echoed by the
		//      main process. May arrive empty in some IPC paths.
		//   3. Bare `Record<string, string>` result — defensive forward-compat.
		// Falls through to {} so empty answers still render the question
		// list with placeholders (better than a blank card body).
		let answersMap: Record<string, string> = {};
		const approvalAnswers = toolCall.approval?.userAnswers;
		if (
			approvalAnswers &&
			typeof approvalAnswers === "object" &&
			Object.keys(approvalAnswers).length > 0
		) {
			answersMap = approvalAnswers;
		} else {
			const rawResult = toolCall.result;
			if (rawResult && typeof rawResult === "object") {
				// `user_answers` is the new envelope toolAdapter returns to
				// the model; `answers` is the legacy/pre-fix shape. Accept
				// either so a tool message stored on disk before the schema
				// change still renders.
				const r = rawResult as {
					answers?: unknown;
					user_answers?: unknown;
				};
				const candidate = r.user_answers ?? r.answers;
				if (
					candidate &&
					typeof candidate === "object" &&
					!Array.isArray(candidate)
				) {
					answersMap = candidate as Record<string, string>;
				} else {
					// `result` itself is the answers map (rare; defensive)
					const allStrings = Object.values(
						rawResult as Record<string, unknown>,
					).every((v) => typeof v === "string");
					if (allStrings) {
						answersMap = rawResult as Record<string, string>;
					}
				}
			}
		}

		// Render order follows the original questions so multi-question
		// summaries match the on-card sequence the user just saw.
		const rows = questions.map((q) => ({
			question: q.question,
			answer: answersMap[q.question],
		}));

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
				{rows.map(({ question, answer }) => (
					<div key={question} style={{ fontSize: 12, lineHeight: 1.6 }}>
						<span
							style={{
								color: token.colorTextSecondary,
								fontWeight: 500,
							}}
						>
							{question}
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
							{answer && answer.trim()
								? answer
								: t("askUserQuestion.unanswered")}
						</span>
					</div>
				))}
			</div>
		);
	};

	return (
		<ApprovalDecisionCard
			icon={<QuestionCircleOutlined style={{ fontSize: 13 }} />}
			title={t("askUserQuestion.title")}
			tone="success"
			density={compact ? "compact" : "default"}
			maxWidth={compact ? 520 : undefined}
			footer={
				isInteractive ? (
					<>
						<Button
							size="small"
							icon={<ForwardOutlined />}
							onClick={handleSkip}
						>
							{t("askUserQuestion.skip")}
						</Button>
						{totalPages > 1 && (
							<Button
								size="small"
								icon={<LeftOutlined />}
								disabled={currentPage === 0}
								onClick={handlePrev}
							>
								{t("askUserQuestion.prev")}
							</Button>
						)}
						{totalPages > 1 && !isLastPage ? (
							<Button
								type="primary"
								size="small"
								onClick={handleNext}
								// Allow Next even when the current question isn't
								// answered yet — users may want to skim all questions
								// before committing. Submit (last page) still gates
								// on completeness via `canSubmit`.
							>
								{t("askUserQuestion.next")}
								<RightOutlined />
							</Button>
						) : (
							<Button
								type="primary"
								size="small"
								icon={<SendOutlined />}
								disabled={!canSubmit}
								onClick={handleSubmit}
								style={{
									backgroundColor: canSubmit ? token.colorSuccess : undefined,
									borderColor: canSubmit ? token.colorSuccess : undefined,
								}}
							>
								{t("askUserQuestion.submit")}
							</Button>
						)}
					</>
				) : undefined
			}
		>
			{isInteractive || isWaiting ? (
				<div className="flex flex-col gap-3">
					{/* Progress strip — only meaningful with 2+ questions. The
					    dots double as keyboard-free jump shortcuts so users
					    can revisit any prior answer without paging through. */}
					{totalPages > 1 && (
						<div
							className="flex items-center gap-2"
							style={{
								fontSize: 11,
								color: token.colorTextTertiary,
								lineHeight: 1.4,
							}}
						>
							<span style={{ fontVariantNumeric: "tabular-nums" }}>
								{t("askUserQuestion.progress", {
									current: currentPage + 1,
									total: totalPages,
								})}
							</span>
							<div className="flex items-center gap-1.5">
								{questions.map((q, idx) => {
									const answered = isQuestionAnswered(idx);
									const active = idx === currentPage;
									return (
										<button
											key={q.question}
											type="button"
											onClick={() => setCurrentPage(idx)}
											aria-label={`${q.header} (${idx + 1}/${totalPages})`}
											disabled={!isInteractive}
											style={{
												width: active ? 18 : 8,
												height: 8,
												borderRadius: 4,
												border: "none",
												padding: 0,
												backgroundColor: active
													? token.colorSuccess
													: answered
														? token.colorSuccessBorder
														: token.colorFillSecondary,
												cursor: isInteractive ? "pointer" : "default",
												transition: "all 0.15s",
											}}
										/>
									);
								})}
							</div>
						</div>
					)}

					{(() => {
						const q = questions[currentPage];
						if (!q) return null;
						const qIdx = currentPage;
						return (
							<div key={q.question} className="flex flex-col gap-2">
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
												cursor: isInteractive ? "pointer" : "default",
												opacity: isInteractive ? 1 : 0.72,
												transition: "all 0.15s",
											}}
											onClick={() =>
												handleToggleOption(qIdx, optIdx, q.multiSelect)
											}
										>
											<SelectionDot
												selected={isSelected}
												multi={q.multiSelect}
												color={token.colorSuccess}
												borderColor={token.colorBorder}
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
												{opt.preview && (
													<pre
														style={{
															margin: "4px 0 0",
															padding: "6px 8px",
															borderRadius: 4,
															whiteSpace: "pre-wrap",
															wordBreak: "break-word",
															backgroundColor: token.colorFillQuaternary,
															color: token.colorTextSecondary,
															fontSize: 11,
															lineHeight: 1.45,
															fontFamily:
																'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
														}}
													>
														{opt.preview}
													</pre>
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
													backgroundColor: isOtherSelected
														? `${token.colorSuccessBg}`
														: "transparent",
													border: `1px solid ${isOtherSelected ? token.colorSuccessBorder : "transparent"}`,
													cursor: isInteractive ? "pointer" : "default",
													opacity: isInteractive ? 1 : 0.72,
													transition: "all 0.15s",
												}}
												onClick={() =>
													handleToggleOption(qIdx, -1, q.multiSelect)
												}
											>
												<SelectionDot
													selected={isOtherSelected}
													multi={q.multiSelect}
													color={token.colorSuccess}
													borderColor={token.colorBorder}
												/>
												<span
													style={{
														fontSize: 13,
														fontWeight: 500,
														color: token.colorText,
														lineHeight: 1.4,
													}}
												>
													{t("askUserQuestion.other")}
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
														placeholder={t("askUserQuestion.otherPlaceholder")}
														value={answers.get(qIdx)?.otherText || ""}
														disabled={!isInteractive}
														onChange={(e) =>
															handleOtherTextChange(qIdx, e.target.value)
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
						);
					})()}
				</div>
			) : (
				renderSummary()
			)}
		</ApprovalDecisionCard>
	);
};
