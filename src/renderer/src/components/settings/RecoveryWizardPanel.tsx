import {
	DownloadOutlined,
	ImportOutlined,
	ReloadOutlined,
	UndoOutlined,
} from "@ant-design/icons";
import { Button, Tag, Typography, theme } from "antd";
import type * as React from "react";
import { useTranslation } from "react-i18next";
import type {
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
}: RecoveryWizardPanelProps) {
	const { t } = useTranslation();
	const { token } = useToken();
	const recommendedStep = model.steps.find(
		(step) => step.id === model.recommendedStepId,
	);

	const primaryAction =
		model.recommendedStepId === "legacy" && !legacyImportDisabled ? (
			<Button
				type="primary"
				icon={<ImportOutlined />}
				loading={importing}
				onClick={onImportLegacy}
			>
				{t("settingsNav.recovery.wizard.importAction", "Import legacy chats", {
					ns: "settings",
				})}
			</Button>
		) : model.recommendedStepId === "exports" ? (
			<Button icon={<DownloadOutlined />} onClick={onExportDiagnostics}>
				{t(
					"settingsNav.recovery.wizard.diagnosticAction",
					"Export diagnostics",
					{ ns: "settings" },
				)}
			</Button>
		) : (
			<Button icon={<ReloadOutlined />} loading={loading} onClick={onRefresh}>
				{t("settingsNav.recovery.wizard.refreshAction", "Refresh status", {
					ns: "settings",
				})}
			</Button>
		);

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
				{primaryAction}
			</div>

			<div className="grid gap-2" data-testid="recovery-wizard-steps">
				{model.steps.map((step) => (
					<div
						key={step.id}
						className="flex items-center gap-2"
						data-testid="recovery-wizard-step"
						data-step={step.id}
						data-status={step.status}
					>
						<span style={{ color: token.colorTextSecondary }}>
							{STEP_ICON[step.id]}
						</span>
						<span className="flex-1 text-sm">
							{t(
								`settingsNav.recovery.wizard.steps.${step.id}`,
								STEP_LABEL[step.id],
								{ ns: "settings" },
							)}
							{typeof step.count === "number" ? ` (${step.count})` : ""}
						</span>
						<Tag color={statusColor(step)}>
							{t(
								`settingsNav.recovery.wizard.status.${step.status}`,
								step.status,
								{ ns: "settings" },
							)}
						</Tag>
						{recommendedStep?.id === step.id ? (
							<Tag>
								{t(
									"settingsNav.recovery.wizard.recommended",
									"Recommended",
									{ ns: "settings" },
								)}
							</Tag>
						) : null}
					</div>
				))}
			</div>
		</div>
	);
}
