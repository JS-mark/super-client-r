/**
 * LogViewerToolbar - Filter controls and actions for the log viewer
 * Clean, single-row layout with grouped controls
 */

import {
	ClearOutlined,
	ExportOutlined,
	ReloadOutlined,
	SearchOutlined,
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
	Tooltip,
	theme,
} from "antd";
import type React from "react";
import { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useLogViewerStore } from "../../stores/logViewerStore";

const { RangePicker } = DatePicker;
const { useToken } = theme;

const LEVEL_OPTIONS = [
	{ value: "DEBUG", label: "DEBUG" },
	{ value: "INFO", label: "INFO" },
	{ value: "WARN", label: "WARN" },
	{ value: "ERROR", label: "ERROR" },
];

export const LogViewerToolbar: React.FC = () => {
	const { t } = useTranslation("logviewer");
	const { token } = useToken();
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
		}
	}, [exportLogs, t]);

	return (
		<div
			className="flex items-center gap-2 px-3 py-2 rounded-xl shrink-0"
			style={{
				background: token.colorBgContainer,
				border: `1px solid ${token.colorBorderSecondary}`,
			}}
		>
			{/* Search */}
			<Input
				prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
				placeholder={t("keywordPlaceholder")}
				allowClear
				onChange={handleKeywordChange}
				defaultValue={filters.keyword}
				className="!w-48"
				size="small"
				variant="filled"
			/>

			{/* Filter group */}
			<Select
				mode="multiple"
				placeholder={t("allLevels")}
				value={filters.level}
				onChange={handleLevelChange}
				options={LEVEL_OPTIONS}
				maxTagCount={1}
				allowClear
				className="!min-w-[110px]"
				size="small"
				variant="filled"
			/>

			<Select
				mode="multiple"
				placeholder={t("allModules")}
				value={filters.module}
				onChange={handleModuleChange}
				options={modules.map((m) => ({ value: m, label: m }))}
				maxTagCount={1}
				allowClear
				className="!min-w-[110px]"
				size="small"
				variant="filled"
			/>

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
				variant="filled"
			/>

			<RangePicker
				showTime
				onChange={handleTimeRangeChange}
				size="small"
				variant="filled"
			/>

			{/* Spacer */}
			<div className="flex-1" />

			{/* Actions */}
			<div className="flex items-center gap-1">
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
						type="text"
					/>
				</Tooltip>

				<Tooltip title={t("refresh")}>
					<Button
						icon={<ReloadOutlined />}
						onClick={refresh}
						loading={isLoading}
						size="small"
						type="text"
					/>
				</Tooltip>

				<Tooltip title={t("export")}>
					<Button
						icon={<ExportOutlined />}
						onClick={handleExport}
						size="small"
						type="text"
					/>
				</Tooltip>

				<Popconfirm
					title={t("clearConfirm")}
					onConfirm={handleClear}
					okText={t("clear")}
					cancelText={t("cancel", { ns: "common", defaultValue: "Cancel" })}
				>
					<Tooltip title={t("clear")}>
						<Button
							icon={<ClearOutlined />}
							danger
							size="small"
							type="text"
						/>
					</Tooltip>
				</Popconfirm>
			</div>
		</div>
	);
};
