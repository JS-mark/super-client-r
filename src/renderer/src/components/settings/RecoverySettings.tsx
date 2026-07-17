import {
	CopyOutlined,
	DownloadOutlined,
	ImportOutlined,
	LinkOutlined,
	ReloadOutlined,
	UndoOutlined,
} from "@ant-design/icons";
import { Alert, Button, Empty, Tag, Typography, message, theme } from "antd";
import { LiteList as List } from "@/components/ui/LiteList";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SessionMeta } from "@super-client/shared-types/project";
import { toRedactedPathLabel } from "@/lib/privacyDisplay";
import { buildRecoveryWizardModel } from "@/lib/recoveryWizard";
import { diagnosticExportService } from "../../services/diagnosticExportService";
import { fileActionService } from "../../services/fileActionService";
import { sessionArchiveService } from "../../services/sessionArchiveService";
import { useChatStore } from "../../stores/chatStore";
import { useProjectStore } from "../../stores/projectStore";
import { useSessionListStore } from "../../stores/sessionListStore";
import { ArchivedProjectsPanel } from "./ArchivedProjectsPanel";
import { RecoveryWizardPanel } from "./RecoveryWizardPanel";
import { SettingSection } from "./SettingSection";

const { Text } = Typography;
const { useToken } = theme;

interface OrphanProject {
	projectId: string;
	cwd: string;
	sessionCount: number;
}

interface LegacyImportInfo {
	count: number;
	alreadyImported: boolean;
	legacyDir: string;
}

type SessionExportStatus = "current" | "deleted" | "tombstoned" | "visible";

interface SessionExportRow {
	id: string;
	name: string;
	projectId: string | null;
	updatedAt?: number;
	messageCount?: number;
	status: SessionExportStatus;
}

interface SessionExportFeedback {
	type: "success" | "error";
	kind: "session" | "project" | "diagnostic";
	targetId: string;
	exportDir?: string;
}

function isFeedbackFor(
	feedback: SessionExportFeedback | null,
	kind: SessionExportFeedback["kind"],
): feedback is SessionExportFeedback {
	return feedback?.kind === kind;
}

function sessionRowFromMeta(meta: SessionMeta): SessionExportRow {
	return {
		id: meta.id,
		name: meta.name || meta.preview || meta.id,
		projectId: meta.projectId,
		updatedAt: meta.updatedAt,
		messageCount: meta.messageCount,
		status: meta.tombstone
			? "tombstoned"
			: meta.deletedAt
				? "deleted"
				: "visible",
	};
}

function getSessionStatusColor(status: SessionExportStatus): string {
	if (status === "current") return "blue";
	if (status === "deleted") return "orange";
	if (status === "tombstoned") return "red";
	return "default";
}

export function RecoverySettings() {
	const { t } = useTranslation();
	const { token } = useToken();
	const projects = useProjectStore((s) => s.projects);
	const loadProjects = useProjectStore((s) => s.load);
	const conversations = useChatStore((s) => s.conversations);
	const currentConversationId = useChatStore((s) => s.currentConversationId);
	const casualSessions = useSessionListStore((s) => s.casual);
	const sessionsByProject = useSessionListStore((s) => s.byProject);
	const archivedCount = useMemo(
		() => projects.filter((project) => project.archived).length,
		[projects],
	);
	const sessionExportRows = useMemo(() => {
		const rowsById = new Map<string, SessionExportRow>();
		for (const meta of [
			...casualSessions,
			...Object.values(sessionsByProject).flat(),
		]) {
			rowsById.set(meta.id, sessionRowFromMeta(meta));
		}
		for (const conversation of conversations) {
			const existing = rowsById.get(conversation.id);
			const row: SessionExportRow = {
				id: conversation.id,
				name: conversation.name || conversation.preview || conversation.id,
				projectId:
					conversation.workspaceId && conversation.workspaceId !== "default"
						? conversation.workspaceId
						: null,
				updatedAt: conversation.updatedAt,
				messageCount: conversation.messageCount,
				status:
					conversation.id === currentConversationId
						? "current"
						: (existing?.status ?? "visible"),
			};
			rowsById.set(conversation.id, {
				...row,
				status:
					existing?.status === "deleted" || existing?.status === "tombstoned"
						? existing.status
						: row.status,
			});
		}
		return [...rowsById.values()].sort((a, b) => {
			if (a.id === currentConversationId) return -1;
			if (b.id === currentConversationId) return 1;
			return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
		});
	}, [casualSessions, conversations, currentConversationId, sessionsByProject]);
	const [orphans, setOrphans] = useState<OrphanProject[]>([]);
	const [legacyInfo, setLegacyInfo] = useState<LegacyImportInfo | null>(null);
	const [loading, setLoading] = useState(false);
	const [importing, setImporting] = useState(false);
	const [restoringId, setRestoringId] = useState<string | null>(null);
	const [exportingSessionId, setExportingSessionId] = useState<string | null>(
		null,
	);
	const [exportingProjectId, setExportingProjectId] = useState<string | null>(
		null,
	);
	const [exportingDiagnostic, setExportingDiagnostic] = useState(false);
	const [exportFeedback, setExportFeedback] =
		useState<SessionExportFeedback | null>(null);
	const recoveryWizardModel = useMemo(
		() =>
			buildRecoveryWizardModel({
				archivedCount,
				orphanCount: orphans.length,
				legacyCount: legacyInfo?.count ?? 0,
				legacyAlreadyImported: legacyInfo?.alreadyImported ?? false,
				exportableProjectCount: projects.length,
				exportableSessionCount: sessionExportRows.length,
			}),
		[
			archivedCount,
			legacyInfo?.alreadyImported,
			legacyInfo?.count,
			orphans.length,
			projects.length,
			sessionExportRows.length,
		],
	);

	const refreshRecoveryStatus = useCallback(async () => {
		setLoading(true);
		try {
			const [orphanResult, legacyResult] = await Promise.all([
				window.electron.projects.listOrphans(),
				window.electron.legacyData.detect(),
			]);
			if (orphanResult.success && orphanResult.data) {
				setOrphans(orphanResult.data);
			}
			if (legacyResult.success && legacyResult.data) {
				setLegacyInfo(legacyResult.data);
			}
		} catch (error) {
			console.warn("[RecoverySettings] refresh failed:", error);
			message.error(
				t(
					"settingsNav.recovery.refreshError",
					"Failed to refresh recovery status",
					{
						ns: "settings",
					},
				),
			);
		} finally {
			setLoading(false);
		}
	}, [t]);

	useEffect(() => {
		void refreshRecoveryStatus();
	}, [refreshRecoveryStatus]);

	const handleRestoreOrphan = useCallback(
		async (projectId: string) => {
			setRestoringId(projectId);
			try {
				const result = await window.electron.projects.restoreOrphan(projectId);
				if (!result.success || !result.data) {
					throw new Error(result.error ?? "restoreOrphan failed");
				}
				await loadProjects();
				await refreshRecoveryStatus();
				message.success(
					t("settingsNav.recovery.orphanRestoreSuccess", "Project restored", {
						ns: "settings",
					}),
				);
			} catch (error) {
				console.warn("[RecoverySettings] orphan restore failed:", error);
				message.error(
					t("settingsNav.recovery.orphanRestoreError", "Restore failed", {
						ns: "settings",
					}),
				);
			} finally {
				setRestoringId(null);
			}
		},
		[loadProjects, refreshRecoveryStatus, t],
	);

	const handleImportLegacy = useCallback(async () => {
		setImporting(true);
		try {
			const result = await window.electron.legacyData.importAll();
			if (!result.success || !result.data) {
				throw new Error(result.error ?? "legacy import failed");
			}
			await useChatStore.getState().loadConversations();
			await refreshRecoveryStatus();
			const { imported, skipped, failures } = result.data;
			if (failures.length > 0) {
				message.warning(
					t(
						"settingsNav.recovery.importPartial",
						"Imported {{imported}}, skipped {{skipped}}, failed {{failed}}.",
						{
							ns: "settings",
							imported,
							skipped,
							failed: failures.length,
						},
					),
				);
			} else {
				message.success(
					t(
						"settingsNav.recovery.importSuccess",
						"Imported {{count}} legacy chats",
						{
							ns: "settings",
							count: imported,
						},
					),
				);
			}
		} catch (error) {
			message.error(
				error instanceof Error
					? error.message
					: t("settingsNav.recovery.importError", "Import failed", {
							ns: "settings",
						}),
			);
		} finally {
			setImporting(false);
		}
	}, [refreshRecoveryStatus, t]);

	const legacyImportDisabled =
		!legacyInfo || legacyInfo.alreadyImported || legacyInfo.count === 0;

	const handleCopyPath = useCallback(
		async (path: string) => {
			const result = await fileActionService.copyPath(path);
			if (result.success) {
				message.success(
					t("settingsNav.recovery.pathCopied", "Full path copied", {
						ns: "settings",
					}),
				);
				return;
			}
			message.error(
				result.error ??
					t("settingsNav.recovery.copyPathError", "Failed to copy path", {
						ns: "settings",
					}),
			);
		},
		[t],
	);

	const renderExportFeedback = useCallback(
		(feedback: SessionExportFeedback) => (
			<Alert
				type={feedback.type === "success" ? "success" : "error"}
				showIcon
				message={
					feedback.type === "success"
						? feedback.kind === "project"
							? t(
									"settingsNav.recovery.projectExportSuccessTitle",
									"Project archive ready",
									{ ns: "settings" },
								)
							: feedback.kind === "diagnostic"
								? t(
										"settingsNav.recovery.diagnosticExportSuccessTitle",
										"Diagnostic export ready",
										{ ns: "settings" },
									)
								: t(
										"settingsNav.recovery.sessionExportSuccessTitle",
										"Session archive ready",
										{ ns: "settings" },
									)
						: feedback.kind === "project"
							? t(
									"settingsNav.recovery.projectExportErrorTitle",
									"Project export failed",
									{ ns: "settings" },
								)
							: feedback.kind === "diagnostic"
								? t(
										"settingsNav.recovery.diagnosticExportErrorTitle",
										"Diagnostic export failed",
										{ ns: "settings" },
									)
								: t(
										"settingsNav.recovery.sessionExportErrorTitle",
										"Session export failed",
										{ ns: "settings" },
									)
				}
				description={
					feedback.type === "success" && feedback.exportDir ? (
						<div className="flex flex-col gap-1">
							<div className="flex flex-wrap items-center gap-2">
								<code>{toRedactedPathLabel(feedback.exportDir)}</code>
								<Button
									type="link"
									icon={<CopyOutlined />}
									onClick={() => handleCopyPath(feedback.exportDir ?? "")}
								>
									{t("settingsNav.recovery.copyFullPath", "Copy full path", {
										ns: "settings",
									})}
								</Button>
							</div>
							{feedback.kind === "session" || feedback.kind === "project" ? (
								<Text type="secondary" className="text-xs">
									{t(
										"settingsNav.recovery.archiveContentNotice",
										"This archive includes app-managed session metadata only by default. JSONL chat transcripts, attachments, tool payloads and the real project directory are excluded unless chat content is explicitly requested.",
										{ ns: "settings" },
									)}
								</Text>
							) : null}
						</div>
					) : (
						t(
							"settingsNav.recovery.sessionExportErrorDesc",
							"The archive service did not return a usable export directory. Try again after refreshing recovery status.",
							{ ns: "settings" },
						)
					)
				}
			/>
		),
		[handleCopyPath, t],
	);

	const handleExportSession = useCallback(
		async (sessionId: string) => {
			setExportingSessionId(sessionId);
			setExportFeedback(null);
			try {
				const result = await sessionArchiveService.exportArchive(sessionId);
				if (!result.success || !result.data?.exportDir) {
					setExportFeedback({ type: "error", kind: "session", targetId: sessionId });
					message.error(
						t(
							"settingsNav.recovery.sessionExportError",
							"Session export failed. No archive was created.",
							{ ns: "settings" },
						),
					);
					return;
				}
				setExportFeedback({
					type: "success",
					kind: "session",
					targetId: sessionId,
					exportDir: result.data.exportDir,
				});
				message.success(
					t(
						"settingsNav.recovery.sessionExportSuccess",
						"Session archive ready at {{exportDir}}",
						{
							ns: "settings",
							exportDir: toRedactedPathLabel(result.data.exportDir),
						},
					),
				);
			} catch (error) {
				console.warn("[RecoverySettings] session export failed:", error);
				setExportFeedback({ type: "error", kind: "session", targetId: sessionId });
				message.error(
					t(
						"settingsNav.recovery.sessionExportError",
						"Session export failed. No archive was created.",
						{ ns: "settings" },
					),
				);
			} finally {
				setExportingSessionId(null);
			}
		},
		[t],
	);

	const handleExportProject = useCallback(
		async (projectId: string) => {
			setExportingProjectId(projectId);
			setExportFeedback(null);
			try {
				const result =
					await sessionArchiveService.exportProjectArchive(projectId);
				if (!result.success || !result.data?.exportDir) {
					setExportFeedback({ type: "error", kind: "project", targetId: projectId });
					message.error(
						t(
							"settingsNav.recovery.projectExportError",
							"Project export failed. No archive was created.",
							{ ns: "settings" },
						),
					);
					return;
				}
				setExportFeedback({
					type: "success",
					kind: "project",
					targetId: projectId,
					exportDir: result.data.exportDir,
				});
				message.success(
					t(
						"settingsNav.recovery.projectExportSuccess",
						"Project archive ready at {{exportDir}}",
						{
							ns: "settings",
							exportDir: toRedactedPathLabel(result.data.exportDir),
						},
					),
				);
			} catch (error) {
				console.warn("[RecoverySettings] project export failed:", error);
				setExportFeedback({ type: "error", kind: "project", targetId: projectId });
				message.error(
					t(
						"settingsNav.recovery.projectExportError",
						"Project export failed. No archive was created.",
						{ ns: "settings" },
					),
				);
			} finally {
				setExportingProjectId(null);
			}
		},
		[t],
	);

	const handleExportDiagnostic = useCallback(async () => {
		setExportingDiagnostic(true);
		setExportFeedback(null);
		try {
			const result = await diagnosticExportService.export();
			if (!result.success || !result.data?.exportDir) {
				setExportFeedback({
					type: "error",
					kind: "diagnostic",
					targetId: "diagnostic",
				});
				message.error(
					t(
						"settingsNav.recovery.diagnosticExportError",
						"Diagnostic export failed. No archive was created.",
						{ ns: "settings" },
					),
				);
				return;
			}
			setExportFeedback({
				type: "success",
				kind: "diagnostic",
				targetId: "diagnostic",
				exportDir: result.data.exportDir,
			});
			message.success(
				t(
					"settingsNav.recovery.diagnosticExportSuccess",
					"Diagnostic export ready at {{exportDir}}",
					{
						ns: "settings",
						exportDir: toRedactedPathLabel(result.data.exportDir),
					},
				),
			);
		} catch (error) {
			console.warn("[RecoverySettings] diagnostic export failed:", error);
			setExportFeedback({
				type: "error",
				kind: "diagnostic",
				targetId: "diagnostic",
			});
			message.error(
				t(
					"settingsNav.recovery.diagnosticExportError",
					"Diagnostic export failed. No archive was created.",
					{ ns: "settings" },
				),
			);
		} finally {
			setExportingDiagnostic(false);
		}
	}, [t]);

	return (
		<div className="space-y-5">
			<SettingSection
				title={t("settingsNav.projectRecovery", "Project Recovery", {
					ns: "settings",
				})}
			>
				<div className="space-y-4">
					<div className="flex items-start justify-between gap-4">
						<div>
							<p
								className="text-sm m-0"
								style={{ color: token.colorTextSecondary }}
							>
								{t(
									"settingsNav.recovery.description",
									"Recover project visibility and imported session access without deleting files.",
									{ ns: "settings" },
								)}
							</p>
							<div className="flex flex-wrap gap-2 mt-3">
								<Tag color="blue">
									{t(
										"settingsNav.recovery.archiveStatus",
										"{{count}} archived",
										{
											ns: "settings",
											count: archivedCount,
										},
									)}
								</Tag>
								<Tag color={orphans.length > 0 ? "orange" : "default"}>
									{t(
										"settingsNav.recovery.orphanStatus",
										"{{count}} orphaned",
										{
											ns: "settings",
											count: orphans.length,
										},
									)}
								</Tag>
								<Tag color={legacyInfo?.count ? "gold" : "default"}>
									{t(
										"settingsNav.recovery.importStatus",
										"{{count}} legacy chats",
										{
											ns: "settings",
											count: legacyInfo?.count ?? 0,
										},
									)}
								</Tag>
							</div>
						</div>
						<Button
							icon={<ReloadOutlined />}
							loading={loading}
							onClick={refreshRecoveryStatus}
						>
							{t("refresh", "Refresh", { ns: "settings" })}
						</Button>
					</div>

					<Alert
						type="info"
						showIcon
						message={t(
							"settingsNav.recovery.safeModeTitle",
							"Safe recovery only",
							{ ns: "settings" },
						)}
						description={t(
							"settingsNav.recovery.safeModeDesc",
							"This entry exposes archive restore, orphan relink and legacy import status. Physical delete and full backup migration are not available here.",
							{ ns: "settings" },
						)}
					/>

					<RecoveryWizardPanel
						model={recoveryWizardModel}
						loading={loading}
						importing={importing}
						legacyImportDisabled={legacyImportDisabled}
						onRefresh={refreshRecoveryStatus}
						onImportLegacy={handleImportLegacy}
						onExportDiagnostics={handleExportDiagnostic}
					/>
				</div>
			</SettingSection>

			<SettingSection
				title={t("settingsNav.recovery.archivedTitle", "Archived Projects", {
					ns: "settings",
				})}
			>
				<div className="space-y-3">
					<Text type="secondary" className="block text-sm">
						{t(
							"settingsNav.recovery.archivedDesc",
							"Archived projects are hidden from the sidebar. Restoring only changes visibility; sessions stay in place.",
							{ ns: "settings" },
						)}
					</Text>
					<ArchivedProjectsPanel />
				</div>
			</SettingSection>

			<SettingSection
				title={t(
					"settingsNav.recovery.orphanTitle",
					"Orphan Project Directories",
					{ ns: "settings" },
				)}
			>
				<div className="space-y-3">
					<Text type="secondary" className="block text-sm">
						{t(
							"settingsNav.recovery.orphanDesc",
							"Orphans are project storage directories that are no longer listed in the registry. Restore re-registers them when the saved path still matches.",
							{ ns: "settings" },
						)}
					</Text>
					{orphans.length === 0 ? (
						<Empty
							image={Empty.PRESENTED_IMAGE_SIMPLE}
							description={t(
								"settingsNav.recovery.noOrphans",
								"No orphan projects found",
								{
									ns: "settings",
								},
							)}
							className="py-4"
						/>
					) : (
						<List
							bordered
							dataSource={orphans}
							renderItem={(orphan) => (
								<List.Item
									actions={[
										<Button
											key="copy"
											type="link"
											icon={<CopyOutlined />}
											onClick={() => handleCopyPath(orphan.cwd)}
										>
											{t("settingsNav.recovery.copyFullPath", "Copy full path", {
												ns: "settings",
											})}
										</Button>,
										<Button
											key="restore"
											type="link"
											icon={<UndoOutlined />}
											loading={restoringId === orphan.projectId}
											onClick={() => handleRestoreOrphan(orphan.projectId)}
										>
											{t("settingsNav.recovery.restore", "Restore", {
												ns: "settings",
											})}
										</Button>,
									]}
								>
									<List.Item.Meta
										title={<code>{orphan.projectId}</code>}
										description={
											<div className="flex flex-col gap-0.5 text-xs">
												<code style={{ color: token.colorTextSecondary }}>
													{toRedactedPathLabel(orphan.cwd)}
												</code>
												<span style={{ color: token.colorTextTertiary }}>
													{t(
														"settingsNav.recovery.sessionCount",
														"{{count}} sessions",
														{
															ns: "settings",
															count: orphan.sessionCount,
														},
													)}
												</span>
											</div>
										}
									/>
								</List.Item>
							)}
						/>
					)}
				</div>
			</SettingSection>

			<SettingSection
				title={t("settingsNav.recovery.projectExportTitle", "Project Export", {
					ns: "settings",
				})}
			>
				<div className="space-y-3">
					<Text type="secondary" className="block text-sm">
						{t(
							"settingsNav.recovery.projectExportDesc",
							"Export project metadata, settings and app-managed project sessions. The archive is created under app user data and does not copy the project directory.",
							{ ns: "settings" },
						)}
					</Text>
					{isFeedbackFor(exportFeedback, "project")
						? renderExportFeedback(exportFeedback)
						: null}
					{projects.length === 0 ? (
						<Empty
							image={Empty.PRESENTED_IMAGE_SIMPLE}
							description={t(
								"settingsNav.recovery.noExportableProjects",
								"No projects are currently available to export",
								{ ns: "settings" },
							)}
							className="py-4"
						/>
					) : (
						<List
							bordered
							dataSource={projects}
							rowKey="id"
							renderItem={(project) => (
								<List.Item
									actions={[
										<Button
											key="copy"
											type="link"
											icon={<CopyOutlined />}
											onClick={() => handleCopyPath(project.cwd)}
										>
											{t(
												"settingsNav.recovery.copyFullPath",
												"Copy full path",
												{ ns: "settings" },
											)}
										</Button>,
										<Button
											key="export"
											type="link"
											icon={<DownloadOutlined />}
											loading={exportingProjectId === project.id}
											onClick={() => handleExportProject(project.id)}
										>
											{t(
												"settingsNav.recovery.exportProject",
												"Export project",
												{ ns: "settings" },
											)}
										</Button>,
									]}
								>
									<List.Item.Meta
										title={
											<span className="flex items-center gap-2 min-w-0">
												<span className="truncate">{project.name}</span>
												{project.archived ? (
													<Tag>
														{t(
															"settingsNav.recovery.projectStatus.archived",
															"Archived",
															{ ns: "settings" },
														)}
													</Tag>
												) : null}
											</span>
										}
										description={
											<div className="flex flex-col gap-0.5 text-xs">
												<code style={{ color: token.colorTextSecondary }}>
													{toRedactedPathLabel(project.cwd)}
												</code>
												<span style={{ color: token.colorTextTertiary }}>
													{t(
														"settingsNav.recovery.projectExportMeta",
														"{{count}} app-managed sessions",
														{
															ns: "settings",
															count:
																sessionsByProject[project.id]?.length ?? 0,
														},
													)}
												</span>
											</div>
										}
									/>
								</List.Item>
							)}
						/>
					)}
				</div>
			</SettingSection>

			<SettingSection
				title={t("settingsNav.recovery.sessionExportTitle", "Session Export", {
					ns: "settings",
				})}
			>
				<div className="space-y-3">
					<Text type="secondary" className="block text-sm">
						{t(
							"settingsNav.recovery.sessionExportDesc",
							"Export a current, visible or recoverable session archive from app-managed storage.",
							{ ns: "settings" },
						)}
					</Text>
					{isFeedbackFor(exportFeedback, "session")
						? renderExportFeedback(exportFeedback)
						: null}
					{sessionExportRows.length === 0 ? (
						<Empty
							image={Empty.PRESENTED_IMAGE_SIMPLE}
							description={t(
								"settingsNav.recovery.noExportableSessions",
								"No sessions are currently available to export",
								{ ns: "settings" },
							)}
							className="py-4"
						/>
					) : (
						<List
							bordered
							dataSource={sessionExportRows}
							rowKey="id"
							renderItem={(session) => (
								<List.Item
									actions={[
										<Button
											key="export"
											type="link"
											icon={<DownloadOutlined />}
											loading={exportingSessionId === session.id}
											onClick={() => handleExportSession(session.id)}
										>
											{t("settingsNav.recovery.exportSession", "Export", {
												ns: "settings",
											})}
										</Button>,
									]}
								>
									<List.Item.Meta
										title={
											<span className="flex items-center gap-2 min-w-0">
												<span className="truncate">{session.name}</span>
												<Tag color={getSessionStatusColor(session.status)}>
													{t(
														`settingsNav.recovery.sessionStatus.${session.status}`,
														session.status,
														{ ns: "settings" },
													)}
												</Tag>
											</span>
										}
										description={
											<div className="flex flex-col gap-0.5 text-xs">
												<code style={{ color: token.colorTextSecondary }}>
													{session.id}
												</code>
												<span style={{ color: token.colorTextTertiary }}>
													{t(
														"settingsNav.recovery.sessionExportMeta",
														"{{count}} messages · {{project}}",
														{
															ns: "settings",
															count: session.messageCount ?? 0,
															project:
																session.projectId ??
																t(
																	"settingsNav.recovery.casualSession",
																	"casual",
																	{ ns: "settings" },
																),
														},
													)}
												</span>
											</div>
										}
									/>
								</List.Item>
							)}
						/>
					)}
				</div>
			</SettingSection>

			<SettingSection
				title={t("settingsNav.recovery.importTitle", "Import", {
					ns: "settings",
				})}
			>
				<div className="flex items-center justify-between gap-4">
					<div className="min-w-0">
						<Text type="secondary" className="block text-sm">
							{t(
								"settingsNav.recovery.importDesc",
								"Legacy chat import keeps the old data and imports accessible chats into the current session store.",
								{ ns: "settings" },
							)}
						</Text>
						{legacyInfo?.legacyDir && (
							<div className="flex flex-wrap items-center gap-2 mt-1">
								<code
									className="block text-xs truncate"
									style={{ color: token.colorTextTertiary }}
								>
									{toRedactedPathLabel(legacyInfo.legacyDir)}
								</code>
								<Button
									type="link"
									icon={<CopyOutlined />}
									onClick={() => handleCopyPath(legacyInfo.legacyDir)}
								>
									{t("settingsNav.recovery.copyFullPath", "Copy full path", {
										ns: "settings",
									})}
								</Button>
							</div>
						)}
					</div>
					<Button
						type="primary"
						icon={<ImportOutlined />}
						loading={importing}
						disabled={legacyImportDisabled}
						onClick={handleImportLegacy}
					>
						{t("settingsNav.recovery.importButton", "Import Legacy Chats", {
							ns: "settings",
						})}
					</Button>
				</div>
			</SettingSection>

			<SettingSection
				title={t("settingsNav.recovery.coverageTitle", "Current Coverage", {
					ns: "settings",
				})}
			>
				<List
					bordered
					dataSource={[
						{
							key: "tombstone",
							label: t("settingsNav.recovery.tombstoneLabel", "Tombstones", {
								ns: "settings",
							}),
							status: t("settingsNav.recovery.statusTracked", "Tracked", {
								ns: "settings",
							}),
							description: t(
								"settingsNav.recovery.tombstoneDesc",
								"Session tombstones are retained by storage after soft delete; Settings does not expose physical delete.",
								{ ns: "settings" },
							),
						},
						{
							key: "relink",
							label: t("settingsNav.recovery.relinkLabel", "Relink", {
								ns: "settings",
							}),
							status: t("settingsNav.recovery.statusLimited", "Limited", {
								ns: "settings",
							}),
							description: t(
								"settingsNav.recovery.relinkDesc",
								"Available today through orphan restore when the stored path and project id still match.",
								{ ns: "settings" },
							),
						},
						{
							key: "backup",
							label: t("settingsNav.recovery.backupLabel", "Backup / Export", {
								ns: "settings",
							}),
							status: t(
								"settingsNav.recovery.statusAvailable",
								"Available",
								{
									ns: "settings",
								},
							),
							description: t(
								"settingsNav.recovery.backupDesc",
								"Session, project and diagnostic exports are available here. Full migration bundles remain a follow-up.",
								{ ns: "settings" },
							),
						},
					]}
					renderItem={(item) => (
						<List.Item>
							<List.Item.Meta
								avatar={<LinkOutlined />}
								title={
									<span className="flex items-center gap-2">
										<span>{item.label}</span>
										<Tag>{item.status}</Tag>
									</span>
								}
								description={item.description}
							/>
						</List.Item>
					)}
				/>
				<div className="mt-3">
					{isFeedbackFor(exportFeedback, "diagnostic") ? (
						<div className="mb-3">{renderExportFeedback(exportFeedback)}</div>
					) : null}
					<Button
						icon={<DownloadOutlined />}
						loading={exportingDiagnostic}
						onClick={handleExportDiagnostic}
					>
						{t(
							"settingsNav.recovery.exportDiagnostics",
							"Export diagnostics",
							{ ns: "settings" },
						)}
					</Button>
				</div>
			</SettingSection>
		</div>
	);
}
