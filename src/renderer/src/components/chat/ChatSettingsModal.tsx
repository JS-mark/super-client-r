import {
	CheckCircleFilled,
	DeleteOutlined,
	PlusOutlined,
	QuestionCircleOutlined,
	SearchOutlined,
} from "@ant-design/icons";
import {
	Button,
	Input,
	InputNumber,
	Modal,
	Select,
	Segmented,
	Slider,
	Switch,
	Tooltip,
	theme,
} from "antd";
import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

const { TextArea } = Input;

export type ToolCallMode = "function" | "prompt";

export type ToolPermissionMode =
	| "none"
	| "auto"
	| "approve_always"
	| "approve_except_authorized";

export interface CustomParam {
	id: string;
	name: string;
	type: "text" | "number" | "boolean" | "json";
	value: string;
}

export interface SessionSettings {
	toolCallMode: ToolCallMode;
	toolPermissionMode: ToolPermissionMode;
	authorizedTools: string[];
	toolTimeout: number; // Tool execution timeout in seconds (min 60)
	temperatureEnabled: boolean;
	temperature: number;
	topPEnabled: boolean;
	topP: number;
	maxTokens: number;
	contextCount: number; // -1 = unlimited
	contextMode: "auto" | "compact" | "full";
	streamingEnabled: boolean;
	systemPrompt: string;
	customParams: CustomParam[];
}

export const DEFAULT_SESSION_SETTINGS: SessionSettings = {
	toolCallMode: "function",
	toolPermissionMode: "approve_always",
	authorizedTools: [],
	toolTimeout: 180,
	temperatureEnabled: true,
	temperature: 0.7,
	topPEnabled: false,
	topP: 1,
	maxTokens: 4096,
	contextCount: -1,
	contextMode: "auto",
	streamingEnabled: true,
	systemPrompt: "",
	customParams: [],
};

/* ── Unified setting row ─────────────────────────────── */

interface SettingCellProps {
	label: string;
	tooltip: string;
	extra?: ReactNode;
	children?: ReactNode;
	/**
	 * When true, fades the whole row (label + value + body). The Switch in
	 * `extra` remains usable so users can re-enable the setting.
	 */
	disabled?: boolean;
}

function SettingCell({
	label,
	tooltip,
	extra,
	children,
	disabled,
}: SettingCellProps) {
	return (
		<div
			className={cn(
				"transition-opacity duration-200",
				disabled && "opacity-55",
			)}
		>
			<div className="flex items-center justify-between min-h-[28px]">
				<span className="inline-flex items-center gap-1.5">
					<span className="text-[13px]">{label}</span>
					<Tooltip title={tooltip}>
						<QuestionCircleOutlined className="text-[10px] opacity-30 cursor-help hover:opacity-60 transition-opacity" />
					</Tooltip>
				</span>
				{extra && <div className="flex items-center">{extra}</div>}
			</div>
			{children}
		</div>
	);
}

/** Inline numeric / text badge displayed in cell `extra`. */
function ValueBadge({ children }: { children: ReactNode }) {
	const { token } = theme.useToken();
	return (
		<span
			className="text-[11px] tabular-nums leading-none px-1.5 py-1 rounded-md font-medium min-w-[28px] text-center"
			style={{
				background: token.colorFillTertiary,
				color: token.colorTextSecondary,
			}}
		>
			{children}
		</span>
	);
}

/** Section group header — small uppercase label with trailing rule. */
function SectionHeader({ title }: { title: string }) {
	return (
		<div className="flex items-center gap-2 mt-1">
			<span className="text-[10px] uppercase tracking-[0.08em] opacity-40 font-semibold">
				{title}
			</span>
			<div className="flex-1 h-px bg-[var(--ant-color-split)]" />
		</div>
	);
}

/* ── Permission Mode Card Grid ─────────────────────────── */

interface PermissionModeCardProps {
	modes: Array<{ value: ToolPermissionMode; title: string; desc: string }>;
	value: ToolPermissionMode;
	onChange: (value: ToolPermissionMode) => void;
}

function PermissionModeCards({
	modes,
	value,
	onChange,
}: PermissionModeCardProps) {
	const { token } = theme.useToken();
	const { t } = useTranslation("chat");

	return (
		<div className="grid grid-cols-2 gap-2 mt-1">
			{modes.map((mode) => {
				const isSelected = value === mode.value;
				return (
					<div
						key={mode.value}
						onClick={() => onChange(mode.value)}
						className="relative rounded-lg p-3 cursor-pointer transition-all border"
						style={{
							borderColor: isSelected
								? token.colorPrimary
								: token.colorBorderSecondary,
							backgroundColor: isSelected
								? token.colorPrimaryBg
								: token.colorBgContainer,
						}}
					>
						{isSelected && (
							<span
								className="absolute top-1.5 right-1.5 text-xs flex items-center gap-0.5"
								style={{ color: token.colorPrimary }}
							>
								<CheckCircleFilled style={{ fontSize: 12 }} />
								<span style={{ fontSize: 10 }}>
									{t("settings.permission.selected", "Selected")}
								</span>
							</span>
						)}
						<div
							className="text-[13px] font-medium leading-snug"
							style={{
								color: isSelected ? token.colorPrimary : token.colorText,
							}}
						>
							{mode.title}
						</div>
						<div
							className="text-[11px] mt-1 leading-relaxed"
							style={{ color: token.colorTextTertiary }}
						>
							{mode.desc}
						</div>
					</div>
				);
			})}
		</div>
	);
}

/* ── Tool Authorization List ─────────────────────────── */

type ToolSource = "builtin" | "mcp" | "skill";

interface ToolEntry {
	prefixedName: string;
	displayName: string;
	source: ToolSource;
}

interface ToolAuthorizationListProps {
	tools: ToolEntry[];
	authorizedTools: string[];
	searchQuery: string;
	onSearchChange: (query: string) => void;
	onToggle: (prefixedName: string, checked: boolean) => void;
}

function ToolAuthorizationList({
	tools,
	authorizedTools,
	searchQuery,
	onSearchChange,
	onToggle,
}: ToolAuthorizationListProps) {
	const { token } = theme.useToken();
	const { t } = useTranslation("chat");

	// Group entries by source while preserving original order within each group.
	const groups: Array<{ source: ToolSource; entries: ToolEntry[] }> = useMemo(
		() => {
			const buckets: Record<ToolSource, ToolEntry[]> = {
				builtin: [],
				mcp: [],
				skill: [],
			};
			for (const tool of tools) buckets[tool.source].push(tool);
			const result: Array<{ source: ToolSource; entries: ToolEntry[] }> = [];
			(["builtin", "mcp", "skill"] as const).forEach((source) => {
				if (buckets[source].length > 0)
					result.push({ source, entries: buckets[source] });
			});
			return result;
		},
		[tools],
	);

	const sourceLabel = (source: ToolSource): string => {
		switch (source) {
			case "builtin":
				return t("settings.permission.sourceBuiltin", "Built-in (Claude Code)");
			case "mcp":
				return t("settings.permission.sourceMcp", "MCP");
			case "skill":
				return t("settings.permission.sourceSkill", "Skill");
		}
	};

	return (
		<div className="mt-1">
			<div className="flex items-center justify-between mb-2">
				<span className="text-[13px]">
					{t("settings.permission.authorizedTools", "Pre-authorized Tools")}
				</span>
				<span
					className="text-[11px]"
					style={{ color: token.colorTextQuaternary }}
				>
					{authorizedTools.length}/{tools.length}
				</span>
			</div>
			<Input
				size="small"
				prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
				placeholder={t("settings.permission.searchTools", "Search tools...")}
				value={searchQuery}
				onChange={(e) => onSearchChange(e.target.value)}
				allowClear
				className="mb-2"
			/>
			{tools.length > 0 ? (
				<div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto">
					{groups.map(({ source, entries }) => (
						<div key={source} className="flex flex-col gap-1.5">
							<div className="flex items-center gap-2 px-1 pt-0.5">
								<span
									className="text-[10px] uppercase tracking-[0.08em] font-semibold"
									style={{ color: token.colorTextTertiary }}
								>
									{sourceLabel(source)}
								</span>
								<span
									className="text-[10px]"
									style={{ color: token.colorTextQuaternary }}
								>
									{entries.length}
								</span>
								<div className="flex-1 h-px bg-[var(--ant-color-split)]" />
							</div>
							{entries.map((tool) => {
								const isAuthorized = authorizedTools.includes(
									tool.prefixedName,
								);
								return (
									<div
										key={tool.prefixedName}
										className="flex items-center justify-between px-3 py-2 rounded-md border transition-colors"
										style={{
											borderColor: isAuthorized
												? token.colorPrimaryBorder
												: token.colorBorderSecondary,
											backgroundColor: isAuthorized
												? token.colorPrimaryBg
												: token.colorBgContainer,
										}}
									>
										<div className="flex flex-col min-w-0 mr-3">
											<span
												className="text-[12px] font-medium truncate"
												style={{ color: token.colorText }}
											>
												{tool.displayName}
											</span>
											<span
												className="text-[10px] truncate"
												style={{ color: token.colorTextQuaternary }}
											>
												{tool.prefixedName}
											</span>
										</div>
										<Switch
											size="small"
											checked={isAuthorized}
											onChange={(checked) =>
												onToggle(tool.prefixedName, checked)
											}
										/>
									</div>
								);
							})}
						</div>
					))}
				</div>
			) : (
				<div
					className="text-xs text-center py-4"
					style={{ color: token.colorTextQuaternary }}
				>
					{t("settings.permission.noTools", "No tools available")}
				</div>
			)}
		</div>
	);
}

/* ── Props & Main Component ──────────────────────────── */

interface ChatSettingsModalProps {
	open: boolean;
	onClose: () => void;
	settings: SessionSettings;
	onSettingsChange: (settings: SessionSettings) => void;
	modelValue?: string;
	onModelChange: (value: string) => void;
	groupedModelOptions: Array<{
		label: ReactNode;
		options: Array<{ label: ReactNode; value: string; icon?: ReactNode }>;
	}>;
	isStreaming: boolean;
	availableTools?: ToolEntry[];
}

export function ChatSettingsModal({
	open,
	onClose,
	settings,
	onSettingsChange,
	modelValue,
	onModelChange,
	groupedModelOptions,
	isStreaming,
	availableTools = [],
}: ChatSettingsModalProps) {
	const { t } = useTranslation("chat");

	const updateSetting = useCallback(
		<K extends keyof SessionSettings>(key: K, value: SessionSettings[K]) => {
			onSettingsChange({ ...settings, [key]: value });
		},
		[settings, onSettingsChange],
	);

	const handleReset = useCallback(() => {
		onSettingsChange({ ...DEFAULT_SESSION_SETTINGS });
	}, [onSettingsChange]);

	const handleAddParam = useCallback(() => {
		onSettingsChange({
			...settings,
			customParams: [
				...settings.customParams,
				{ id: `p_${Date.now()}`, name: "", type: "text", value: "" },
			],
		});
	}, [settings, onSettingsChange]);

	const handleUpdateParam = useCallback(
		(id: string, field: keyof CustomParam, value: string) => {
			onSettingsChange({
				...settings,
				customParams: settings.customParams.map((p) =>
					p.id === id ? { ...p, [field]: value } : p,
				),
			});
		},
		[settings, onSettingsChange],
	);

	const handleDeleteParam = useCallback(
		(id: string) => {
			onSettingsChange({
				...settings,
				customParams: settings.customParams.filter((p) => p.id !== id),
			});
		},
		[settings, onSettingsChange],
	);

	const toolCallModeOptions = useMemo(
		() => [
			{
				value: "function",
				label: t("settings.toolCallFunction", "Function Call"),
			},
			{
				value: "prompt",
				label: t("settings.toolCallPrompt", "Prompt (兼容模式)"),
			},
		],
		[t],
	);

	const [toolSearchQuery, setToolSearchQuery] = useState("");

	const permissionModes = useMemo(
		() => [
			{
				value: "auto" as ToolPermissionMode,
				title: t("settings.permission.auto", "Auto Execute"),
				desc: t(
					"settings.permission.autoDesc",
					"Execute all tools automatically",
				),
			},
			{
				value: "approve_always" as ToolPermissionMode,
				title: t("settings.permission.approveAlways", "Always Approve"),
				desc: t(
					"settings.permission.approveAlwaysDesc",
					"Require confirmation for every tool call",
				),
			},
			{
				value: "approve_except_authorized" as ToolPermissionMode,
				title: t(
					"settings.permission.approveExceptAuthorized",
					"Smart Approve",
				),
				desc: t(
					"settings.permission.approveExceptAuthorizedDesc",
					"Pre-authorized tools auto, others need approval",
				),
			},
			{
				value: "none" as ToolPermissionMode,
				title: t("settings.permission.none", "Disabled"),
				desc: t("settings.permission.noneDesc", "Do not use any tools"),
			},
		],
		[t],
	);

	const filteredTools = useMemo(() => {
		if (!toolSearchQuery.trim()) return availableTools;
		const q = toolSearchQuery.toLowerCase();
		return availableTools.filter(
			(tool) =>
				tool.displayName.toLowerCase().includes(q) ||
				tool.prefixedName.toLowerCase().includes(q),
		);
	}, [availableTools, toolSearchQuery]);

	const handleToggleTool = useCallback(
		(prefixedName: string, checked: boolean) => {
			const next = checked
				? [...settings.authorizedTools, prefixedName]
				: settings.authorizedTools.filter((n) => n !== prefixedName);
			onSettingsChange({ ...settings, authorizedTools: next });
		},
		[settings, onSettingsChange],
	);

	const selectedIcon = useMemo(() => {
		if (!modelValue) return undefined;
		for (const group of groupedModelOptions) {
			for (const opt of group.options) {
				if (opt.value === modelValue) return opt.icon;
			}
		}
		return undefined;
	}, [groupedModelOptions, modelValue]);

	const paramTypeOptions = useMemo(
		() => [
			{ value: "text", label: t("settings.paramTypeText", "Text") },
			{ value: "number", label: t("settings.paramTypeNumber", "Number") },
			{ value: "boolean", label: t("settings.paramTypeBoolean", "Boolean") },
			{ value: "json", label: "JSON" },
		],
		[t],
	);

	return (
		<Modal
			title={t("settings.title", "Chat Settings")}
			open={open}
			onCancel={onClose}
			footer={
				<div className="flex items-center justify-between">
					<Button type="text" size="small" onClick={handleReset}>
						{t("settings.reset", "Reset")}
					</Button>
					<Button type="primary" onClick={onClose}>
						OK
					</Button>
				</div>
			}
			width={520}
			destroyOnHidden={false}
		>
			<div className="flex flex-col gap-2.5 py-1 max-h-[65vh] overflow-y-auto overflow-x-hidden pr-1 box-border">
				{/* ── Model & Tool Call ──────────────────────── */}
				<SettingCell
					label={t("settings.model", "Session Model")}
					tooltip={t(
						"settings.modelDesc",
						"Select a model for this session. Overrides the global default.",
					)}
				>
					<Select
						className="w-full mt-1"
						value={modelValue}
						onChange={onModelChange}
						options={groupedModelOptions}
						popupMatchSelectWidth={false}
						disabled={isStreaming}
						showSearch
						prefix={selectedIcon}
						labelRender={({ value }) => {
							const parts = String(value).split("||");
							return <>{parts[1] ?? parts[0]}</>;
						}}
						placeholder={t("selectModel", "Select a model...")}
					/>
				</SettingCell>

				<SettingCell
					label={t("settings.toolCallMode", "Tool Call Mode")}
					tooltip={t(
						"settings.toolCallModeDesc",
						"How to invoke MCP tools: Function Call uses native function calling API; Prompt injects tool descriptions into the system prompt; Disabled turns off tools.",
					)}
				>
					<Select
						className="w-full mt-1"
						value={settings.toolCallMode}
						onChange={(val) => updateSetting("toolCallMode", val)}
						options={toolCallModeOptions}
					/>
				</SettingCell>

				<PermissionModeCards
					modes={permissionModes}
					value={settings.toolPermissionMode}
					onChange={(val) => updateSetting("toolPermissionMode", val)}
				/>

				{settings.toolPermissionMode === "approve_except_authorized" && (
					<ToolAuthorizationList
						tools={filteredTools}
						authorizedTools={settings.authorizedTools}
						searchQuery={toolSearchQuery}
						onSearchChange={setToolSearchQuery}
						onToggle={handleToggleTool}
					/>
				)}

				<SettingCell
					label={t("settings.toolTimeout", "Tool Timeout")}
					tooltip={t(
						"settings.toolTimeoutDesc",
						"Maximum execution time for a single tool call. If a tool exceeds this time, it will be terminated.",
					)}
					extra={
						<ValueBadge>
							{settings.toolTimeout >= 60
								? `${Math.floor(settings.toolTimeout / 60)}${t("settings.toolTimeoutMin", "min")}`
								: `${settings.toolTimeout}s`}
						</ValueBadge>
					}
				>
					<Slider
						min={60}
						max={600}
						step={30}
						value={settings.toolTimeout}
						onChange={(value) => updateSetting("toolTimeout", value)}
					/>
				</SettingCell>

				<SectionHeader title={t("settings.section.generation", "Generation")} />

				{/* ── Generation Parameters ─────────────────── */}
				<SettingCell
					label={t("settings.temperature", "Temperature")}
					tooltip={t(
						"settings.temperatureDesc",
						"Controls randomness. Higher values produce more creative responses, lower values are more deterministic.",
					)}
					disabled={!settings.temperatureEnabled}
					extra={
						<div className="flex items-center gap-2">
							<ValueBadge>{settings.temperature}</ValueBadge>
							<Switch
								size="small"
								checked={settings.temperatureEnabled}
								onChange={(checked) =>
									updateSetting("temperatureEnabled", checked)
								}
							/>
						</div>
					}
				>
					<Slider
						min={0}
						max={2}
						step={0.1}
						value={settings.temperature}
						onChange={(value) => updateSetting("temperature", value)}
						disabled={!settings.temperatureEnabled}
					/>
				</SettingCell>

				<SettingCell
					label="Top P"
					tooltip={t(
						"settings.topPDesc",
						"Nucleus sampling threshold. Lower values make output more focused; 1.0 considers all tokens.",
					)}
					disabled={!settings.topPEnabled}
					extra={
						<div className="flex items-center gap-2">
							<ValueBadge>{settings.topP}</ValueBadge>
							<Switch
								size="small"
								checked={settings.topPEnabled}
								onChange={(checked) => updateSetting("topPEnabled", checked)}
							/>
						</div>
					}
				>
					<Slider
						min={0}
						max={1}
						step={0.1}
						value={settings.topP}
						onChange={(value) => updateSetting("topP", value)}
						disabled={!settings.topPEnabled}
					/>
				</SettingCell>

				<SettingCell
					label={t("settings.maxTokens", "Max Tokens")}
					tooltip={t(
						"settings.maxTokensDesc",
						"Maximum number of tokens in the response. Higher values allow longer responses.",
					)}
				>
					<InputNumber
						className="w-full mt-1"
						min={1}
						max={200000}
						step={256}
						value={settings.maxTokens}
						onChange={(value) => updateSetting("maxTokens", value ?? 4096)}
					/>
				</SettingCell>

				<SectionHeader title={t("settings.section.context", "Context")} />

				{/* ── Context & Streaming ───────────────────── */}
				<SettingCell
					label={t("settings.contextCount", "Context Messages")}
					tooltip={t(
						"settings.contextCountDesc",
						"Number of previous messages to include as context. More context enables better continuity but uses more tokens.",
					)}
					extra={
						<ValueBadge>
							{settings.contextCount === -1
								? t("settings.contextUnlimited", "No limit")
								: settings.contextCount}
						</ValueBadge>
					}
				>
					<Slider
						min={0}
						max={100}
						step={1}
						value={settings.contextCount === -1 ? 100 : settings.contextCount}
						onChange={(value) =>
							updateSetting("contextCount", value >= 100 ? -1 : value)
						}
					/>
				</SettingCell>

				<SettingCell
					label={t("settings.contextMode", "Context Mode")}
					tooltip={t(
						"settings.contextModeDesc",
						"Choose how conversation history is sent to the agent.",
					)}
				>
					<div className="mt-1 flex flex-col gap-1">
						<Segmented
							block
							size="small"
							value={settings.contextMode ?? "auto"}
							onChange={(value) =>
								updateSetting(
									"contextMode",
									value as SessionSettings["contextMode"],
								)
							}
							options={[
								{
									label: t("settings.contextModeAuto", "Auto"),
									value: "auto",
								},
								{
									label: t("settings.contextModeCompact", "Compact"),
									value: "compact",
								},
								{
									label: t("settings.contextModeFull", "Full"),
									value: "full",
								},
							]}
						/>
						<p className="m-0 text-[11px] leading-4 text-[var(--ant-color-text-tertiary)]">
							{t(
								`settings.contextModeHint.${settings.contextMode ?? "auto"}`,
								{
									defaultValue: t(
										"settings.contextModeHint.auto",
										"Auto keeps recent history and compacts older messages when the token budget is tight.",
									),
								},
							)}
						</p>
					</div>
				</SettingCell>

				<SettingCell
					label={t("settings.streaming", "Streaming Output")}
					tooltip={t(
						"settings.streamingDesc",
						"Stream response tokens in real-time. Disable to receive the full response at once.",
					)}
					extra={
						<Switch
							size="small"
							checked={settings.streamingEnabled}
							onChange={(checked) => updateSetting("streamingEnabled", checked)}
						/>
					}
				/>

				<SectionHeader title={t("settings.section.prompt", "System Prompt")} />

				{/* ── System Prompt ─────────────────────────── */}
				<SettingCell
					label={t("settings.systemPrompt", "System Prompt")}
					tooltip={t(
						"settings.systemPromptDesc",
						"Custom system prompt for this session. Overrides the model's default system prompt.",
					)}
				>
					<TextArea
						className="mt-1"
						rows={3}
						value={settings.systemPrompt}
						onChange={(e) => updateSetting("systemPrompt", e.target.value)}
						placeholder={t(
							"settings.systemPromptPlaceholder",
							"Leave empty to use model default system prompt",
						)}
					/>
				</SettingCell>

				<SectionHeader title={t("settings.section.advanced", "Advanced")} />

				{/* ── Custom Parameters ─────────────────────── */}
				<SettingCell
					label={t("settings.customParams", "Custom Parameters")}
					tooltip={t(
						"settings.customParamsDesc",
						"Extra parameters passed to the API request. Use for provider-specific options.",
					)}
					extra={
						<Button
							type="dashed"
							size="small"
							icon={<PlusOutlined />}
							onClick={handleAddParam}
						>
							{t("settings.addParam", "Add")}
						</Button>
					}
				>
					{settings.customParams.length > 0 && (
						<div className="flex flex-col gap-2 mt-2">
							{settings.customParams.map((param) => (
								<div key={param.id} className="flex items-center gap-1.5">
									<Input
										size="small"
										placeholder={t("settings.paramName", "Name")}
										value={param.name}
										onChange={(e) =>
											handleUpdateParam(param.id, "name", e.target.value)
										}
										style={{ width: 100, flexShrink: 0 }}
									/>
									<Select
										size="small"
										value={param.type}
										onChange={(val) => handleUpdateParam(param.id, "type", val)}
										options={paramTypeOptions}
										style={{ width: 80, flexShrink: 0 }}
									/>
									<Input
										size="small"
										placeholder={t("settings.paramValue", "Value")}
										value={param.value}
										onChange={(e) =>
											handleUpdateParam(param.id, "value", e.target.value)
										}
										style={{ flex: 1, minWidth: 0 }}
									/>
									<Button
										type="text"
										size="small"
										danger
										icon={<DeleteOutlined />}
										onClick={() => handleDeleteParam(param.id)}
										style={{ flexShrink: 0 }}
									/>
								</div>
							))}
						</div>
					)}
				</SettingCell>
			</div>
		</Modal>
	);
}
