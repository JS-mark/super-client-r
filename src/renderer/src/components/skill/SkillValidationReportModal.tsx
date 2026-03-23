import {
	CheckCircleOutlined,
	CloseCircleOutlined,
	ExclamationCircleOutlined,
	WarningOutlined,
} from "@ant-design/icons";
import { Button, Collapse, Modal, Tag } from "antd";
import type * as React from "react";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";

interface ValidationIssue {
	code: string;
	severity: "error" | "warning";
	category:
		| "structural"
		| "content"
		| "compatibility"
		| "consistency"
		| "security";
	messageKey: string;
	messageParams?: Record<string, string | number>;
	fallbackMessage: string;
}

interface SkillValidationResult {
	valid: boolean;
	issues: ValidationIssue[];
	errorCount: number;
	warningCount: number;
	manifest: unknown | null;
}

interface SkillValidationReportModalProps {
	result: SkillValidationResult | null;
	open: boolean;
	onClose: () => void;
	onConfirmInstall: () => void;
	installing: boolean;
}

const CATEGORY_ORDER = [
	"structural",
	"content",
	"compatibility",
	"consistency",
	"security",
] as const;

export const SkillValidationReportModal: React.FC<
	SkillValidationReportModalProps
> = ({ result, open, onClose, onConfirmInstall, installing }) => {
	const { t } = useTranslation("skills");

	const groupedIssues = useMemo(() => {
		if (!result) return {};
		const groups: Record<string, ValidationIssue[]> = {};
		for (const issue of result.issues) {
			if (!groups[issue.category]) {
				groups[issue.category] = [];
			}
			groups[issue.category].push(issue);
		}
		return groups;
	}, [result]);

	const renderIssueMessage = useCallback(
		(issue: ValidationIssue) => {
			const translated = t(`validation.${issue.code}`, {
				...issue.messageParams,
				defaultValue: "",
			});
			return translated || issue.fallbackMessage;
		},
		[t],
	);

	if (!result) return null;

	const { errorCount, warningCount, valid } = result;
	const hasWarnings = warningCount > 0;

	const collapseItems = CATEGORY_ORDER.filter(
		(cat) => groupedIssues[cat]?.length,
	).map((cat) => ({
		key: cat,
		label: (
			<span className="flex items-center gap-2">
				<span>{t(`validation.category.${cat}`)}</span>
				<Tag
					color={
						groupedIssues[cat]!.some((i) => i.severity === "error")
							? "error"
							: "warning"
					}
				>
					{groupedIssues[cat]!.length}
				</Tag>
			</span>
		),
		children: (
			<ul className="m-0 list-none p-0 space-y-2">
				{groupedIssues[cat]!.map((issue, idx) => (
					<li key={`${issue.code}-${idx}`} className="flex items-start gap-2">
						{issue.severity === "error" ? (
							<CloseCircleOutlined className="mt-0.5 text-red-500" />
						) : (
							<WarningOutlined className="mt-0.5 text-orange-500" />
						)}
						<span className="text-sm">{renderIssueMessage(issue)}</span>
					</li>
				))}
			</ul>
		),
	}));

	const renderFooter = () => {
		const buttons: React.ReactNode[] = [
			<Button key="close" onClick={onClose}>
				{t("actions.cancel", { ns: "common", defaultValue: "Cancel" })}
			</Button>,
		];

		if (valid && !hasWarnings) {
			buttons.push(
				<Button
					key="install"
					type="primary"
					loading={installing}
					onClick={onConfirmInstall}
				>
					{t("actions.install")}
				</Button>,
			);
		} else if (valid && hasWarnings) {
			buttons.push(
				<Button
					key="install"
					type="primary"
					className="bg-orange-500! border-orange-500! hover:bg-orange-600!"
					loading={installing}
					onClick={onConfirmInstall}
				>
					{t("validation.installAnyway")}
				</Button>,
			);
		}

		return buttons;
	};

	return (
		<Modal
			title={t("validation.title")}
			open={open}
			onCancel={onClose}
			footer={renderFooter()}
			width={560}
			destroyOnHidden={true}
			maskClosable={false}
		>
			<div className="space-y-4">
				{/* 状态摘要 */}
				<div className="flex items-center gap-2 rounded-lg p-3 bg-[var(--ant-color-fill-secondary)]">
					{valid && !hasWarnings && (
						<>
							<CheckCircleOutlined className="text-lg text-green-500" />
							<span className="text-sm">{t("validation.readyToInstall")}</span>
						</>
					)}
					{valid && hasWarnings && (
						<>
							<ExclamationCircleOutlined className="text-lg text-orange-500" />
							<span className="text-sm">
								{t("validation.hasWarnings", { count: warningCount })}
							</span>
						</>
					)}
					{!valid && (
						<>
							<CloseCircleOutlined className="text-lg text-red-500" />
							<span className="text-sm">
								{t("validation.hasErrors", { count: errorCount })}
							</span>
						</>
					)}
				</div>

				{/* Issue 详情 */}
				{collapseItems.length > 0 && (
					<Collapse
						items={collapseItems}
						defaultActiveKey={CATEGORY_ORDER.filter(
							(cat) => groupedIssues[cat]?.length,
						)}
						size="small"
					/>
				)}
			</div>
		</Modal>
	);
};
