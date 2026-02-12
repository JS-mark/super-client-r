/**
 * LogViewerToolbar - Filter controls for the log viewer
 */

import {
	ClearOutlined,
	ExportOutlined,
	ReloadOutlined,
	SortAscendingOutlined,
	SortDescendingOutlined,
} from "@ant-design/icons";
import {
	Button,
	DatePicker,
	Input,
	message,
	Popconfirm,
	Select,
	Space,
	Tooltip,
} from "antd";
import type React from "react";
import { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useLogViewerStore } from "../../stores/logViewerStore";

const { RangePicker } = DatePicker;

const LEVEL_OPTIONS = [
	{ value: "DEBUG", label: "DEBUG", color: "#8c8c8c" },
	{ value: "INFO", label: "INFO", color: "#1677ff" },
	{ value: "WARN", label: "WARN", color: "#fa8c16" },
	{ value: "ERROR", label: "ERROR", color: "#ff4d4f" },
];

export const LogViewerToolbar: React.FC = () => {
	const { t } = useTranslation("logviewer");
	const filters = useLogViewerStore((s) => s.filters);
	const sortOrder = useLogViewerStore((s) => s.sortOrder);
	const modules = useLogViewerStore((s) => s.modules);
	const isLoading = useLogViewerStore((s) => s.isLoading);
	const setFilters = useLogViewerStore((s) => s.setFilters);
	const setSortOrder = useLogViewerStore((s) => s.setSortOrder);
	const refresh = useLogViewerStore((s) => s.refresh);
	const clearLogs = useLogViewerStore((s) => s.clearLogs);
	const exportLogs = useLogViewerStore((s) => s.exportLogs);
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const handleKeywordChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const value = e.target.value;
			if (debounceRef.current) clearTimeout(debounceRef.current);
			debounceRef.current = setTimeout(() => {
				setFilters({ keyword: value });
			}, 300);
		},
		[setFilters],
	);

	const handleLevelChange = useCallback(
		(values: string[]) => {
			setFilters({ level: values });
		},
		[setFilters],
	);

	const handleModuleChange = useCallback(
		(values: string[]) => {
			setFilters({ module: values });
		},
		[setFilters],
	);

	const handleProcessChange = useCallback(
		(values: string[]) => {
			setFilters({ process: values });
		},
		[setFilters],
	);

	const handleTimeRangeChange = useCallback(
		(_: unknown, dateStrings: [string, string]) => {
			if (dateStrings[0] && dateStrings[1]) {
				setFilters({
					startTime: new Date(dateStrings[0]).getTime(),
					endTime: new Date(dateStrings[1]).getTime(),
				});
			} else {
				setFilters({ startTime: undefined, endTime: undefined });
			}
		},
		[setFilters],
	);

	const handleToggleSort = useCallback(() => {
		setSortOrder(sortOrder === "desc" ? "asc" : "desc");
	}, [sortOrder, setSortOrder]);

	const handleClear = useCallback(async () => {
		const result = await clearLogs();
		if (result.success) {
			message.success(t("clearSuccess"));
			refresh();
		} else {
			message.error(t("clearError"));
		}
	}, [clearLogs, refresh, t]);

	const handleExport = useCallback(async () => {
		const result = await exportLogs();
		if (result.success && result.count !== undefined) {
			message.success(t("exportSuccess", { count: result.count }));
		} else if (!result.success) {
			// User cancelled or error
		}
	}, [exportLogs, t]);

	return (
		<div className="flex flex-wrap items-center gap-2">
			{/* Keyword search */}
			<Input
				placeholder={t("keywordPlaceholder")}
				allowClear
				onChange={handleKeywordChange}
				defaultValue={filters.keyword}
				className="!w-52"
				size="small"
			/>

			{/* Level filter */}
			<Select
				mode="multiple"
				placeholder={t("allLevels")}
				value={filters.level}
				onChange={handleLevelChange}
				options={LEVEL_OPTIONS}
				maxTagCount={1}
				allowClear
				className="!min-w-[120px]"
				size="small"
			/>

			{/* Module filter */}
			<Select
				mode="multiple"
				placeholder={t("allModules")}
				value={filters.module}
				onChange={handleModuleChange}
				options={modules.map((m) => ({ value: m, label: m }))}
				maxTagCount={1}
				allowClear
				className="!min-w-[120px]"
				size="small"
			/>

			{/* Process filter */}
			<Select
				mode="multiple"
				placeholder={t("allProcesses")}
				value={filters.process}
				onChange={handleProcessChange}
				options={[
					{ value: "main", label: t("processMain") },
					{ value: "renderer", label: t("processRenderer") },
				]}
				maxTagCount={1}
				allowClear
				className="!min-w-[100px]"
				size="small"
			/>

			{/* Time range */}
			<RangePicker
				showTime
				onChange={handleTimeRangeChange}
				size="small"
				className="!w-auto"
			/>

			<div className="flex-1" />

			{/* Action buttons */}
			<Space size="small">
				<Tooltip title={sortOrder === "desc" ? t("sortDesc") : t("sortAsc")}>
					<Button
						icon={
							sortOrder === "desc" ? (
								<SortDescendingOutlined />
							) : (
								<SortAscendingOutlined />
							)
						}
						onClick={handleToggleSort}
						size="small"
					/>
				</Tooltip>

				<Button
					icon={<ReloadOutlined />}
					onClick={refresh}
					loading={isLoading}
					size="small"
				>
					{t("refresh")}
				</Button>

				<Button
					icon={<ExportOutlined />}
					onClick={handleExport}
					size="small"
				>
					{t("export")}
				</Button>

				<Popconfirm
					title={t("clearConfirm")}
					onConfirm={handleClear}
					okText={t("clear")}
					cancelText={t("cancel", { ns: "common", defaultValue: "取消" })}
				>
					<Button
						icon={<ClearOutlined />}
						danger
						size="small"
					>
						{t("clear")}
					</Button>
				</Popconfirm>
			</Space>
		</div>
	);
};
