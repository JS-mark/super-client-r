import {
	CheckOutlined,
	CloseOutlined,
	DeleteOutlined,
	PlusOutlined,
	ReloadOutlined,
} from "@ant-design/icons";
import type {
	PlanCancelDecision,
	PlanCard as PlanCardData,
	PlanDecision as PlanDecisionPayload,
	PlanExecuteDecision,
	PlanRegenerateDecision,
	PlanStep,
} from "@super-client/shared-types/plan-execute";
import { Button, Input, Tag, theme } from "antd";
import type * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { createPlanDecisionPayload } from "@/lib/planExecute";
import { cn } from "@/lib/utils";

const { TextArea } = Input;
const { useToken } = theme;

export type PlanDecisionHandler = (decision: PlanDecisionPayload) => void;

export interface EditableStepDraft {
	id: string;
	title: string;
	description: string;
	status?: PlanStep["status"];
	expectedFiles?: string[];
}

export interface PlanCardProps {
	plan: PlanCardData;
	compact?: boolean;
	disabled?: boolean;
	className?: string;
	onExecute?: (decision: PlanExecuteDecision) => void;
	onCancel?: (decision: PlanCancelDecision) => void;
	onRegenerate?: (decision: PlanRegenerateDecision) => void;
}

interface PlanDecisionProps {
	disabled?: boolean;
	canSubmit: boolean;
	onExecute?: () => void;
	onCancel?: () => void;
	onRegenerate?: () => void;
}

export function createEditableStepDrafts(steps: PlanStep[]): EditableStepDraft[] {
	return steps.map((step) => ({
		id: step.id,
		title: step.title,
		description: step.description ?? "",
		status: step.status,
		expectedFiles: step.expectedFiles ? [...step.expectedFiles] : undefined,
	}));
}

export function createPlanStepsFromDrafts(
	drafts: EditableStepDraft[],
): PlanStep[] {
	return drafts.map((draft, index) => ({
		id: draft.id || `step-${index + 1}`,
		title: draft.title.trim(),
		description: draft.description.trim() || undefined,
		status: draft.status,
		expectedFiles: draft.expectedFiles ? [...draft.expectedFiles] : undefined,
	}));
}

export function buildPlanDecisionFromDrafts(
	plan: PlanCardData,
	action: PlanDecisionPayload["action"],
	drafts: EditableStepDraft[],
	extras?: { reason?: string; instructions?: string },
): PlanDecisionPayload {
	const editedSteps = createPlanStepsFromDrafts(drafts);
	const trimmedReason = extras?.reason?.trim();
	const trimmedInstructions = extras?.instructions?.trim();

	return createPlanDecisionPayload(plan, {
		action,
		editedSteps: action === "cancel" ? undefined : editedSteps,
		reason: trimmedReason ? trimmedReason : undefined,
		instructions:
			action === "cancel" || !trimmedInstructions
				? undefined
				: trimmedInstructions,
	});
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isPlanStepLike(value: unknown): value is PlanStep {
	return (
		isRecord(value) &&
		typeof value.id === "string" &&
		typeof value.title === "string"
	);
}

function isPlanCardData(value: unknown): value is PlanCardData {
	return (
		isRecord(value) &&
		typeof value.id === "string" &&
		typeof value.version === "number" &&
		typeof value.sourceTurnId === "string" &&
		typeof value.goal === "string" &&
		Array.isArray(value.steps) &&
		value.steps.every(isPlanStepLike)
	);
}

function readPlanCandidate(value: unknown): PlanCardData | null {
	if (isPlanCardData(value)) return value;
	if (!isRecord(value)) return null;

	const candidates = [
		value.plan,
		value.planCard,
		value.card,
		value.data,
		value.value,
	];
	for (const candidate of candidates) {
		if (isPlanCardData(candidate)) return candidate;
	}
	return null;
}

export function getPlanCardFromPart(part: unknown): PlanCardData | null {
	if (!isRecord(part)) return null;
	if (part.type === "plan") return readPlanCandidate(part);
	if (part.type === "data") return readPlanCandidate(part.value);
	return readPlanCandidate(part);
}

export function isPendingPlanDecisionPart(part: unknown): boolean {
	if (!getPlanCardFromPart(part) || !isRecord(part)) return false;
	return (
		part.state === "requires-approval" ||
		part.status === "requires-approval" ||
		part.status === "pending-decision" ||
		part.pendingDecision === true ||
		part.requiresDecision === true
	);
}

export function PlanCard({
	plan,
	compact = false,
	disabled = false,
	className,
	onExecute,
	onCancel,
	onRegenerate,
}: PlanCardProps) {
	const { token } = useToken();
	const { t } = useTranslation("chat");
	const [stepDrafts, setStepDrafts] = useState<EditableStepDraft[]>(() =>
		createEditableStepDrafts(plan.steps),
	);
	const [reasonText, setReasonText] = useState("");
	const [instructionsText, setInstructionsText] = useState("");
	const planIdentityKey = `${plan.id}:${plan.version}:${plan.sourceTurnId}`;

	useEffect(() => {
		setStepDrafts(createEditableStepDrafts(plan.steps));
		setReasonText("");
		setInstructionsText("");
	}, [planIdentityKey]);

	const canSubmit = useMemo(
		() =>
			stepDrafts.length > 0 &&
			stepDrafts.every((step) => step.title.trim().length > 0),
		[stepDrafts],
	);

	const updateStep = useCallback(
		(index: number, patch: Partial<EditableStepDraft>) => {
			setStepDrafts((current) =>
				current.map((step, stepIndex) =>
					stepIndex === index ? { ...step, ...patch } : step,
				),
			);
		},
		[],
	);

	const removeStep = useCallback((index: number) => {
		setStepDrafts((current) =>
			current.length <= 1
				? current
				: current.filter((_, stepIndex) => stepIndex !== index),
		);
	}, []);

	const addStep = useCallback(() => {
		setStepDrafts((current) => [
			...current,
			{
				id: `step-${current.length + 1}`,
				title: "",
				description: "",
			},
		]);
	}, []);

	const handleExecute = useCallback(() => {
		if (!canSubmit) return;
		const decision = buildPlanDecisionFromDrafts(plan, "execute", stepDrafts, {
			reason: reasonText,
			instructions: instructionsText,
		}) as PlanExecuteDecision;
		onExecute?.(decision);
	}, [canSubmit, onExecute, plan, stepDrafts, reasonText, instructionsText]);

	const handleCancel = useCallback(() => {
		const decision = buildPlanDecisionFromDrafts(plan, "cancel", stepDrafts, {
			reason: reasonText,
		}) as PlanCancelDecision;
		onCancel?.(decision);
	}, [onCancel, plan, stepDrafts, reasonText]);

	const handleRegenerate = useCallback(() => {
		if (!canSubmit) return;
		const decision = buildPlanDecisionFromDrafts(
			plan,
			"regenerate",
			stepDrafts,
			{ reason: reasonText, instructions: instructionsText },
		) as PlanRegenerateDecision;
		onRegenerate?.(decision);
	}, [
		canSubmit,
		onRegenerate,
		plan,
		stepDrafts,
		reasonText,
		instructionsText,
	]);

	// Card-level keyboard handler: Enter → Execute (or Cancel if execute is
	// unavailable), Cmd/Ctrl+Enter → force Execute, Esc → Cancel. We intentionally
	// skip when the event originates from a textarea/input so the step-title and
	// step-description fields keep their native Enter/Escape behaviour.
	const handleCardKeyDown = useCallback(
		(event: React.KeyboardEvent<HTMLElement>) => {
			if (event.nativeEvent.isComposing) return;
			const target = event.target as HTMLElement | null;
			const tag = target?.tagName?.toLowerCase();
			const insideEditable =
				tag === "textarea" ||
				tag === "input" ||
				target?.isContentEditable === true;

			if (event.key === "Escape") {
				if (insideEditable) return;
				if (onCancel) {
					event.preventDefault();
					handleCancel();
				}
				return;
			}

			if (event.key !== "Enter") return;
			if (event.shiftKey) return;
			const withModifier = event.metaKey || event.ctrlKey;
			if (insideEditable && !withModifier) return;

			event.preventDefault();
			if (onExecute && canSubmit && !disabled) {
				handleExecute();
			} else if (onCancel && !disabled) {
				handleCancel();
			}
		},
		[
			canSubmit,
			disabled,
			handleCancel,
			handleExecute,
			onCancel,
			onExecute,
		],
	);

	return (
		<section
			className={cn("my-2 overflow-hidden rounded-lg border", className)}
			tabIndex={-1}
			onKeyDown={handleCardKeyDown}
			style={{
				borderColor: token.colorBorder,
				backgroundColor: token.colorBgContainer,
			}}
		>
			<header
				className="flex flex-col gap-2 border-b px-4 py-3"
				style={{
					borderColor: token.colorBorderSecondary,
					backgroundColor: token.colorFillQuaternary,
				}}
			>
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0">
						<div
							className="text-sm font-semibold"
							style={{ color: token.colorText }}
						>
							{t("planCard.title", { defaultValue: "Plan" })}
						</div>
						<h3
							className="m-0 mt-1 text-base font-semibold leading-snug"
							style={{ color: token.colorText }}
						>
							{plan.goal}
						</h3>
					</div>
					<Tag className="shrink-0" color="blue">
						v{plan.version}
					</Tag>
				</div>
				{plan.summary && (
					<p
						className="m-0 text-sm leading-6"
						style={{ color: token.colorTextSecondary }}
					>
						{plan.summary}
					</p>
				)}
			</header>

			<div className={cn("flex flex-col gap-3 px-4 py-3", compact && "gap-2")}>
				<div className="flex items-center justify-between gap-3">
					<div
						className="text-xs font-semibold uppercase tracking-wide"
						style={{ color: token.colorTextTertiary }}
					>
						{t("planCard.steps", { defaultValue: "Steps" })}
					</div>
					<Button
						size="small"
						icon={<PlusOutlined />}
						disabled={disabled}
						onClick={addStep}
					>
						{t("planCard.addStep", { defaultValue: "Add step" })}
					</Button>
				</div>

				<div className="flex flex-col gap-2">
					{stepDrafts.map((step, index) => (
						<div
							key={`${step.id}-${index}`}
							className="rounded-md border p-3"
							style={{
								borderColor: token.colorBorderSecondary,
								backgroundColor: token.colorFillQuaternary,
							}}
						>
							<div className="flex items-start gap-3">
								<span
									className="mt-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-semibold"
									style={{
										backgroundColor: token.colorBgContainer,
										color: token.colorTextSecondary,
									}}
								>
									{index + 1}
								</span>
								<div className="min-w-0 flex-1 space-y-2">
									<Input
										aria-label={t("planCard.stepTitle", {
											defaultValue: "Step title",
										})}
										value={step.title}
										disabled={disabled}
										placeholder={t("planCard.stepTitlePlaceholder", {
											defaultValue: "Describe the step",
										})}
										onChange={(event) =>
											updateStep(index, { title: event.target.value })
										}
									/>
									<TextArea
										aria-label={t("planCard.stepDescription", {
											defaultValue: "Step description",
										})}
										value={step.description}
										disabled={disabled}
										autoSize={{ minRows: 2, maxRows: 4 }}
										placeholder={t("planCard.stepDescriptionPlaceholder", {
											defaultValue: "Optional implementation notes",
										})}
										onChange={(event) =>
											updateStep(index, { description: event.target.value })
										}
									/>
									{step.expectedFiles && step.expectedFiles.length > 0 && (
										<div className="flex flex-wrap gap-1">
											{step.expectedFiles.map((file) => (
												<Tag key={file}>{file}</Tag>
											))}
										</div>
									)}
								</div>
								<Button
									aria-label={t("planCard.removeStep", {
										defaultValue: "Remove step",
									})}
									size="small"
									icon={<DeleteOutlined />}
									disabled={disabled || stepDrafts.length <= 1}
									onClick={() => removeStep(index)}
								/>
							</div>
						</div>
					))}
				</div>

				<PlanMetadata plan={plan} />

				<div className="flex flex-col gap-2">
					<label
						className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide"
						style={{ color: token.colorTextTertiary }}
					>
						{t("planCard.reasonLabel", {
							defaultValue: "Reason (optional)",
						})}
						<Input
							aria-label={t("planCard.reasonLabel", {
								defaultValue: "Reason (optional)",
							})}
							value={reasonText}
							maxLength={120}
							disabled={disabled}
							placeholder={t("planCard.reasonPlaceholder", {
								defaultValue: "Short note about this decision",
							})}
							onChange={(event) => setReasonText(event.target.value)}
						/>
					</label>
					{(onExecute || onRegenerate) && (
						<label
							className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide"
							style={{ color: token.colorTextTertiary }}
						>
							{t("planCard.instructionsLabel", {
								defaultValue: "Additional instructions (optional)",
							})}
							<TextArea
								aria-label={t("planCard.instructionsLabel", {
									defaultValue: "Additional instructions (optional)",
								})}
								value={instructionsText}
								autoSize={{ minRows: 2, maxRows: 4 }}
								disabled={disabled}
								placeholder={t("planCard.instructionsPlaceholder", {
									defaultValue:
										"Extra guidance passed to the execute/regenerate turn",
								})}
								onChange={(event) => setInstructionsText(event.target.value)}
							/>
						</label>
					)}
				</div>
			</div>

			<PlanDecision
				disabled={disabled}
				canSubmit={canSubmit}
				onExecute={onExecute ? handleExecute : undefined}
				onCancel={onCancel ? handleCancel : undefined}
				onRegenerate={onRegenerate ? handleRegenerate : undefined}
			/>
		</section>
	);
}

export function PlanDecision({
	disabled = false,
	canSubmit,
	onExecute,
	onCancel,
	onRegenerate,
}: PlanDecisionProps) {
	const { token } = useToken();
	const { t } = useTranslation("chat");
	const submitDisabled = disabled || !canSubmit;

	return (
		<footer
			className="flex flex-wrap items-center justify-end gap-2 border-t px-4 py-3"
			style={{
				borderColor: token.colorBorderSecondary,
				backgroundColor: token.colorFillQuaternary,
			}}
		>
			{onCancel && (
				<Button
					icon={<CloseOutlined />}
					disabled={disabled}
					onClick={onCancel}
				>
					{t("planCard.cancel", { defaultValue: "Cancel" })}
				</Button>
			)}
			{onRegenerate && (
				<Button
					icon={<ReloadOutlined />}
					disabled={submitDisabled}
					onClick={onRegenerate}
				>
					{t("planCard.regenerate", { defaultValue: "Regenerate" })}
				</Button>
			)}
			{onExecute && (
				<Button
					type="primary"
					icon={<CheckOutlined />}
					disabled={submitDisabled}
					onClick={onExecute}
				>
					{t("planCard.execute", { defaultValue: "Execute" })}
				</Button>
			)}
		</footer>
	);
}

function PlanMetadata({ plan }: { plan: PlanCardData }) {
	const { token } = useToken();
	const { t } = useTranslation("chat");
	const sections: Array<{ label: string; items: React.ReactNode[] }> = [];

	if (plan.expectedChangedFiles?.length) {
		sections.push({
			label: t("planCard.expectedFiles", {
				defaultValue: "Expected files",
			}),
			items: plan.expectedChangedFiles.map((file) => (
				<span key={`${file.operation}-${file.path}`}>
					{file.operation}: {file.path}
				</span>
			)),
		});
	}

	if (plan.requiredApprovals?.length) {
		sections.push({
			label: t("planCard.approvals", { defaultValue: "Approvals" }),
			items: plan.requiredApprovals.map((approval) => (
				<span key={approval.id}>{approval.title}</span>
			)),
		});
	}

	if (plan.risks?.length) {
		sections.push({
			label: t("planCard.risks", { defaultValue: "Risks" }),
			items: plan.risks,
		});
	}

	if (plan.suggestedSubagents?.length) {
		sections.push({
			label: t("planCard.suggestedSubagents", {
				defaultValue: "Suggested subagents",
			}),
			items: plan.suggestedSubagents.map((subagent) => (
				<span key={subagent.id}>
					<span style={{ fontWeight: 600 }}>{subagent.name}</span>
					{subagent.task ? ` — ${subagent.task}` : null}
					{subagent.reason ? ` (${subagent.reason})` : null}
				</span>
			)),
		});
	}

	if (sections.length === 0) return null;

	return (
		<div className="grid gap-2 md:grid-cols-3">
			{sections.map((section) => (
				<div
					key={section.label}
					className="rounded-md border p-2"
					style={{ borderColor: token.colorBorderSecondary }}
				>
					<div
						className="mb-1 text-xs font-semibold"
						style={{ color: token.colorTextTertiary }}
					>
						{section.label}
					</div>
					<div
						className="flex flex-col gap-1 text-xs leading-5"
						style={{ color: token.colorTextSecondary }}
					>
						{section.items.map((item, index) => (
							<div key={index} className="min-w-0 break-words">
								{item}
							</div>
						))}
					</div>
				</div>
			))}
		</div>
	);
}
