import {
	ClearOutlined,
	FolderOpenOutlined,
	ReloadOutlined,
	SyncOutlined,
} from "@ant-design/icons";
import {
	Button,
	Empty,
	Popconfirm,
	Select,
	Space,
	Spin,
	Tag,
	Tooltip,
	message,
} from "antd";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { LazyLog, ScrollFollow } from "@melloware/react-logviewer";
import { type LogFileInfo, appService } from "../../services/appService";
import { ErrorState } from "./SettingSection";
import "@melloware/react-logviewer/style.css";

const AUTO_REFRESH_INTERVAL = 5000;
const LOG_TAIL_LINES = 100;

export const LogViewer: React.FC = () => {
	const { t } = useTranslation();
	const [logFiles, setLogFiles] = useState<LogFileInfo[]>([]);
	const [selectedFile, setSelectedFile] = useState<string>("");
	const [logContent, setLogContent] = useState<string>("");
	const [loading, setLoading] = useState(false);
	const [autoRefresh, setAutoRefresh] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const refreshTimerRef = useRef<number | null>(null);

	const loadLogFiles = useCallback(async () => {
		try {
			const files = await appService.listLogFiles();
			setLogFiles(files);
			if (files.length > 0 && !selectedFile) {
				setSelectedFile(files[0].path);
			}
			setError(null);
		} catch {
			setError(
				t("loadLogFilesError", "Failed to load log files", { ns: "settings" }),
			);
		}
	}, [selectedFile, t]);

	const loadLogs = useCallback(async () => {
		if (!selectedFile) return;

		setLoading(true);
		try {
			const rawContent = await appService.getLogs(selectedFile, LOG_TAIL_LINES);
			setLogContent(rawContent);
			setError(null);
		} catch {
			setError(t("loadLogsError", "Failed to load logs", { ns: "settings" }));
		} finally {
			setLoading(false);
		}
	}, [selectedFile, t]);

	useEffect(() => {
		loadLogFiles();
	}, [loadLogFiles]);

	useEffect(() => {
		if (selectedFile) {
			loadLogs();
		}
	}, [selectedFile, loadLogs]);

	useEffect(() => {
		if (autoRefresh && selectedFile) {
			refreshTimerRef.current = window.setInterval(
				loadLogs,
				AUTO_REFRESH_INTERVAL,
			);
		}
		return () => {
			if (refreshTimerRef.current) {
				clearInterval(refreshTimerRef.current);
				refreshTimerRef.current = null;
			}
		};
	}, [autoRefresh, selectedFile, loadLogs]);

	const handleClearLogs = async () => {
		try {
			await appService.clearLogs();
			message.success(
				t("clearLogsSuccess", "Logs cleared", { ns: "settings" }),
			);
			setLogContent("");
			await loadLogFiles();
		} catch (e) {
			message.error(
				t("clearLogsError", "Failed to clear logs", { ns: "settings" }),
			);
		}
	};

	const handleOpenLogsFolder = async () => {
		try {
			const logsPath = await appService.getLogsPath();
			await appService.openPath(logsPath);
		} catch (e) {
			message.error(
				t("openLogsFolderError", "Failed to open logs folder", {
					ns: "settings",
				}),
			);
		}
	};

	const formatFileSize = (bytes: number): string => {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	};

	return (
		<div className="space-y-4">
			{error && (
				<ErrorState
					message={error}
					onRetry={() => {
						loadLogFiles();
						loadLogs();
					}}
					loading={loading}
				/>
			)}

			<div className="flex items-center gap-4 flex-wrap">
				<Select
					value={selectedFile}
					onChange={setSelectedFile}
					placeholder={t("selectLogFile", "Select log file", {
						ns: "settings",
					})}
					className="min-w-[300px]"
					size="large"
					options={logFiles.map((file) => ({
						value: file.path,
						label: (
							<span className="flex items-center justify-between">
								<span>{file.name}</span>
								<Tag className="ml-2">{formatFileSize(file.size)}</Tag>
							</span>
						),
					}))}
				/>

				<Space>
					<Tooltip
						title={
							autoRefresh
								? t("disableAutoRefresh", "Disable auto-refresh", {
										ns: "settings",
									})
								: t("enableAutoRefresh", "Enable auto-refresh", {
										ns: "settings",
									})
						}
					>
						<Button
							icon={<SyncOutlined spin={autoRefresh} />}
							onClick={() => setAutoRefresh(!autoRefresh)}
							type={autoRefresh ? "primary" : "default"}
							size="large"
							className="!rounded-xl"
						/>
					</Tooltip>

					<Button
						icon={<ReloadOutlined />}
						onClick={loadLogs}
						loading={loading}
						size="large"
						className="!rounded-xl"
					>
						{t("refresh", "Refresh", { ns: "settings" })}
					</Button>

					<Button
						icon={<FolderOpenOutlined />}
						onClick={handleOpenLogsFolder}
						size="large"
						className="!rounded-xl"
					>
						{t("openFolder", "Open Folder", { ns: "settings" })}
					</Button>

					<Popconfirm
						title={t("confirmClearLogs", "Clear all log files?", {
							ns: "settings",
						})}
						onConfirm={handleClearLogs}
						okText={t("confirm", "Confirm", { ns: "common" })}
						cancelText={t("cancel", "Cancel", { ns: "common" })}
					>
						<Button
							icon={<ClearOutlined />}
							danger
							size="large"
							className="!rounded-xl"
						>
							{t("clearLogs", "Clear Logs", { ns: "settings" })}
						</Button>
					</Popconfirm>
				</Space>
			</div>

			<div className="relative">
				{loading && !logContent && (
					<div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-slate-800/80 z-10 rounded-xl">
						<Spin tip="Loading..." />
					</div>
				)}

				<div className="rounded-xl overflow-hidden" style={{ height: 500 }}>
					{logContent ? (
						<ScrollFollow
							startFollowing={autoRefresh}
							render={({ follow, onScroll }) => (
								<LazyLog
									text={logContent}
									follow={follow}
									onScroll={onScroll}
									style={{ height: 500 }}
									containerStyle={{
										backgroundColor: "#0f172a",
										fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
										fontSize: 12,
									}}
									lineClassName="text-slate-100"
									highlight={[]}
									selectableLines
								/>
							)}
						/>
					) : (
						<div className="h-full flex items-center justify-center bg-slate-900">
							<Empty
								description={t("noLogs", "No logs available", {
									ns: "settings",
								})}
								className="[&_.ant-empty-description]:!text-slate-400"
							/>
						</div>
					)}
				</div>
			</div>
		</div>
	);
};
