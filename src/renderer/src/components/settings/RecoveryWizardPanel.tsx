import {
	DownloadOutlined,
	ImportOutlined,
	LeftOutlined,
	ReloadOutlined,
	RightOutlined,
	UndoOutlined,
} from "@ant-design/icons";
import { Button, Tag, Typography, theme } from "antd";
import { useEffect, useMemo, useState } from "react";
import type * as React from "react";
import { useTranslation } from "react-i18next";
import type {
	RecoveryWizardActionKind,
	RecoveryWizardModel,
	RecoveryWizardStep,
	RecoveryWizardStepId,
} from "@/lib/recoveryWizard";

const { Text } = Typography;
const { useToken } = theme;

interface RecoveryWizardPanelProps {
	model: RecoveryWizardModel;
	loading?: boolean;
	importing?: boolean;
	legacyImportDisabled?: boolean;
	onRefresh: () => void;
	onImportLegacy: () => void;
	onExportDiagnostics: () => void;
	/**
	 * Per-step remediation handlers. Wired by RecoverySettings so the panel
	 * stays a dumb view; the parent owns the IPC calls + error feedback.
	 */
	onRestoreArchived?: () => void;
	onRestoreOrphan?: () => void;
}

const STEP_ICON: Record<RecoveryWizardStepId, React.ReactNode> = {
	refresh: <ReloadOutlined />,
	archived: <UndoOutlined />,
	orphans: <UndoOutlined />,
	legacy: <ImportOutlined />,
	exports: <DownloadOutlined />,
};

const STEP_LABEL: Record<RecoveryWizardStepId, string> = {
	refresh: "Refresh recovery status",
	archived: "Restore archived projects",
	orphans: "Restore orphan projects",
	legacy: "Import legacy chats",
	exports: "Export backup metadata",
};

const DEFAULT_ACTION_LABEL: Record<RecoveryWizardActionKind, string> = {
	none: "",
	refresh: "Refresh status",
	"restore-archived": "Restore archived",
	"restore-orphan": "Restore orphan",
	"import-legacy": "Import legacy chats",
	"export-diagnostics": "Export diagnostics",
};

function statusColor(step: RecoveryWizardStep): string {
	if (step.status === "action") return "orange";
	if (step.status === "done") return "green";
	return "blue";
}

export function RecoveryWizardPanel({
	model,
	loading = false,
	importing = false,
	legacyImportDisabled = false,
	onRefresh,
	onImportLegacy,
	onExportDiagnostics,
	onRestoreArchived,
	onRestoreOrphan,
}: RecoveryWizardPanelProps) {
	const { t } = useTranslation();
	const { token } = useToken();

	// Wizard state machine (step-by-step, not flat). Seed on the recommended
	// step; reset whenever the model's recommendation changes (e.g. after a
	// refresh reveals new recoverable items).
	const [currentStepId, setCurrentStepId] = useState<RecoveryWizardStepId>(
		model.recommendedStepId,
	);
	useEffect(() => {
		setCurrentStepId(model.recommendedStepId);
	}, [model.recommendedStepId]);

	const stepIndex = useMemo(
		() => model.steps.findIndex((step) => step.id === currentStepId),
		[model.steps, currentStepId],
	);
	const currentStep = model.steps[stepIndex];
	const isFirst = stepIndex <= 0;
	const isLast = stepIndex >= model.steps.length - 1;
	const recommendedStep = model.steps.find(
		(step) => step.id === model.recommendedStepId,
	);

	// Resolve the current step's action handler + label from its actionKind.
	const actionDescriptor = useMemo((): {
		handler?: () => void;
		label: string;
		disabled?: boolean;
		loading?: boolean;
		icon: React.ReactNode;
		primary: boolean;
	} | null => {
		if (!currentStep || currentStep.actionKind === "none") return null;
		const label = t(
			`settingsNav.recovery.wizard.action.${currentStep.actionKind}`,
			currentStep.actionLabel ?? DEFAULT_ACTION_LABEL[currentStep.actionKind],
			{ ns: "settings" },
		);
		switch (currentStep.actionKind) {
			case "refresh":
				return {
					handler: onRefresh,
					label,
					loading,
					icon: <ReloadOutlined />,
					primary: false,
				};
			case "restore-archived":
				return onRestoreArchived
					? { handler: onRestoreArchived, label, icon: <UndoOutlined />, primary: true }
					: null;
			case "restore-orphan":
				return onRestoreOrphan
					? { handler: onRestoreOrphan, label, icon: <UndoOutlined />, primary: true }
					: null;
			case "import-legacy":
				return legacyImportDisabled
					? null
					: {
							handler: onImportLegacy,
							label,
							loading: importing,
							icon: <ImportOutlined />,
							primary: true,
						};
			case "export-diagnostics":
				return {
					handler: onExportDiagnostics,
					label,
					icon: <DownloadOutlined />,
					primary: false,
				};
			default:
				return null;
		}
	}, [
		currentStep,
		onRefresh,
		onRestoreArchived,
		onRestoreOrphan,
		onImportLegacy,
		onExportDiagnostics,
		loading,
		importing,
		legacyImportDisabled,
		t,
	]);

	return (
		<div
			className="space-y-3 rounded border p-3"
			style={{
				borderColor: token.colorBorderSecondary,
				background: token.colorBgContainer,
			}}
			data-testid="recovery-wizard-panel"
		>
			<div className="flex items-start justify-between gap-3">
				<div>
					<div className="font-medium">
						{t("settingsNav.recovery.wizard.title", "Recovery checklist", {
							ns: "settings",
						})}
					</div>
					<Text type="secondary" className="text-sm">
						{model.hasRecoveryAction
							? t(
									"settingsNav.recovery.wizard.recoveryHint",
									"Resolve recoverable items first, then export metadata if you need a backup or support bundle.",
									{ ns: "settings" },
								)
							: t(
									"settingsNav.recovery.wizard.backupHint",
									"No recoverable project issues are detected. Export metadata or diagnostics if you need a backup or support bundle.",
									{ ns: "settings" },
								)}
					</Text>
				</div>
			</div>

			{/* Current step (single, not the whole list) */}
			{currentStep ? (
				<div
					className="flex flex-col gap-2 rounded border p-3"
					style={{ borderColor: token.colorBorderSecondary }}
					data-testid="recovery-wizard-current-step"
					data-step={currentStep.id}
					data-status={currentStep.status}
				>
					<div className="flex items-center gap-2">
						<span style={{ color: token.colorTextSecondary }}>
							{STEP_ICON[currentStep.id]}
						</span>
						<span className="flex-1 text-sm font-medium">
							{t(
								`settingsNav.recovery.wizard.steps.${currentStep.id}`,
								STEP_LABEL[currentStep.id],
								{ ns: "settings" },
							)}
							{typeof currentStep.count === "number"
								? ` (${currentStep.count})`
								: ""}
						</span>
						<Tag color={statusColor(currentStep)}>
							{t(
								`settingsNav.recovery.wizard.status.${currentStep.status}`,
								currentStep.status,
								{ ns: "settings" },
							)}
						</Tag>
						{recommendedStep?.id === currentStep.id ? (
							<Tag>
								{t("settingsNav.recovery.wizard.recommended", "Recommended", {
									ns: "settings",
								})}
							</Tag>
						) : null}
					</div>
					{actionDescriptor ? (
						<div className="flex justify-end">
							<Button
								type={actionDescriptor.primary ? "primary" : "default"}
								icon={actionDescriptor.icon}
								loading={actionDescriptor.loading}
								onClick={actionDescriptor.handler}
								data-testid="recovery-wizard-step-action"
							>
								{actionDescriptor.label}
							</Button>
						</div>
					) : null}
				</div>
			) : null}

			{/* Prev / Next navigation */}
			<div className="flex items-center justify-between">
				<Button
					icon={<LeftOutlined />}
					disabled={isFirst}
					onClick={() =>
						setCurrentStepId(model.steps[Math.max(0, stepIndex - 1)].id)
					}
					data-testid="recovery-wizard-prev"
				>
					{t("settingsNav.recovery.wizard.prev", "Previous", {
						ns: "settings",
					})}
				</Button>
				<Text type="secondary" className="text-xs">
					{t(
						"settingsNav.recovery.wizard.stepIndicator",
						"Step {{current}} of {{total}}",
						{
							ns: "settings",
							current: stepIndex + 1,
							total: model.steps.length,
						},
					)}
				</Text>
				<Button
					disabled={isLast}
					onClick={() =>
						setCurrentStepId(
							model.steps[Math.min(model.steps.length - 1, stepIndex + 1)].id,
						)
					}
					data-testid="recovery-wizard-next"
				>
					{t("settingsNav.recovery.wizard.next", "Next", { ns: "settings" })}
					<RightOutlined />
				</Button>
			</div>
		</div>
	);
}
