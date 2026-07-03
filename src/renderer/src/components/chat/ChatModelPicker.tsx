/**
 * ChatModelPicker —— 聊天会话级模型选择弹窗。
 *
 * 视觉对齐 ModelManageModal 的"图 2"形态：
 *   - 顶部搜索 + 排序
 *   - capability filter tabs（全部 / 推理 / 视觉 / 联网 / 免费 / 嵌入 / 重排 / 工具）
 *   - 按 provider 分组的模型列表（首行 ProviderIcon + 名字 + 计数 + 折叠）
 *   - 模型行：ProviderIcon · model 名 · 能力图标徽章；当前选中行高亮 + ✓
 *
 * 与 ModelManageModal 的区别：
 *   - 本组件用于"选择"，**单击行**就触发 onSelect 并关闭；不修改 model.enabled
 *   - 跨 provider 聚合，不限定单 provider
 *   - 默认只展示 `enabled` 的模型；不开放重新启用 / 配置入口（那是 Settings 的事）
 *   - 顶部增加"清除选择"按钮，恢复到全局默认
 */

import {
	BulbOutlined,
	CheckOutlined,
	EyeOutlined,
	GlobalOutlined,
	SearchOutlined,
	ToolOutlined,
} from "@ant-design/icons";
import {
	Badge,
	Button,
	Collapse,
	Empty,
	Input,
	Modal,
	Tabs,
	Tag,
	Typography,
	theme,
} from "antd";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/utils";
import { useModelStore } from "../../stores/modelStore";
import type {
	ActiveModelSelection,
	ModelCapability,
	ModelProvider,
	ProviderModel,
} from "../../types/models";
import { ProviderIcon } from "../models/ProviderIcon";

const { Text } = Typography;

type FilterTab =
	| "all"
	| "reasoning"
	| "vision"
	| "web_search"
	| "free"
	| "embedding"
	| "reranking"
	| "tool_use";

const FILTER_TO_CAPABILITY: Record<FilterTab, ModelCapability | null> = {
	all: null,
	reasoning: "reasoning",
	vision: "vision",
	web_search: "web_search",
	free: null, // 特殊：在 filter 里单独处理
	embedding: "embedding",
	reranking: "reranking",
	tool_use: "tool_use",
};

/**
 * Format a raw context-window token count for the `Ctx: …` chip.
 *
 * - `>=1_000_000` -> `1M` / `1.2M`
 * - `>=1000` -> `128K` / `4.5K`
 * - `<1000` -> raw number
 * - `<=0` / undefined -> `null` (caller skips the chip)
 */
export function formatContextChipValue(tokens?: number): string | null {
	if (!tokens || tokens <= 0) return null;
	if (tokens >= 1_000_000) {
		const value = tokens / 1_000_000;
		return `${value % 1 === 0 ? value.toFixed(0) : value.toFixed(1)}M`;
	}
	if (tokens >= 1000) {
		const value = tokens / 1000;
		return `${value % 1 === 0 ? value.toFixed(0) : value.toFixed(1)}K`;
	}
	return `${tokens}`;
}

const CHIP_CAPABILITIES: Array<{
	cap: ModelCapability;
	icon: React.ReactNode;
	labelKey: string;
}> = [
	{
		cap: "vision",
		icon: <EyeOutlined />,
		labelKey: "modelPicker.chipVision",
	},
	{
		cap: "reasoning",
		icon: <BulbOutlined />,
		labelKey: "modelPicker.chipReasoning",
	},
	{
		cap: "tool_use",
		icon: <ToolOutlined />,
		labelKey: "modelPicker.chipToolUse",
	},
	{
		cap: "web_search",
		icon: <GlobalOutlined />,
		labelKey: "modelPicker.chipWebSearch",
	},
];

interface CapabilityChipsProps {
	capabilities: ModelCapability[];
	contextWindow?: number;
	className?: string;
}

/**
 * Small `AntD Tag` chips shown next to each model entry in the picker.
 * Only renders chips for capabilities the model actually supports plus an
 * optional `Ctx: {size}` chip when `contextWindow` is provided.
 */
export function CapabilityChips({
	capabilities,
	contextWindow,
	className,
}: CapabilityChipsProps) {
	const { t } = useTranslation();
	const contextLabel = formatContextChipValue(contextWindow);
	const chipCaps = CHIP_CAPABILITIES.filter((entry) =>
		capabilities.includes(entry.cap),
	);
	if (chipCaps.length === 0 && !contextLabel) return null;
	return (
		<div
			className={cn("flex flex-wrap items-center gap-1", className)}
			data-testid="capability-chips"
		>
			{chipCaps.map(({ cap, icon, labelKey }) => (
				<Tag
					key={cap}
					bordered={false}
					icon={icon}
					style={{ marginInlineEnd: 0, fontSize: 11, lineHeight: "18px" }}
				>
					{t(labelKey, { ns: "models" })}
				</Tag>
			))}
			{contextLabel && (
				<Tag
					key="__ctx"
					bordered={false}
					style={{ marginInlineEnd: 0, fontSize: 11, lineHeight: "18px" }}
				>
					{t("modelPicker.chipContext", {
						ns: "models",
						value: contextLabel,
					})}
				</Tag>
			)}
		</div>
	);
}

interface ChatModelPickerProps {
	open: boolean;
	onClose: () => void;
	currentSelection: ActiveModelSelection | null;
	messageSelection?: ActiveModelSelection | null;
	sessionSelection?: ActiveModelSelection | null;
	onSelect: (selection: ActiveModelSelection) => void;
	onSelectSession: (selection: ActiveModelSelection) => void;
	onClear: () => void;
	onClearSession?: () => void;
}

export function ChatModelPicker({
	open,
	onClose,
	currentSelection,
	messageSelection,
	sessionSelection,
	onSelect,
	onSelectSession,
	onClear,
	onClearSession,
}: ChatModelPickerProps) {
	const { t } = useTranslation();
	const { token } = theme.useToken();
	const providers = useModelStore((s) => s.providers);
	const [searchText, setSearchText] = useState("");
	const [activeFilter, setActiveFilter] = useState<FilterTab>("all");
	// 折叠面板 active keys：默认展开所有 provider；用户可手动折叠/展开
	const [activeKeys, setActiveKeys] = useState<string[]>([]);

	useEffect(() => {
		if (!open) return;
		setSearchText("");
		setActiveFilter("all");
	}, [open]);

	// 1. 仅启用的 provider + 启用的 model
	const enabledProviders = useMemo<ModelProvider[]>(
		() => providers.filter((p) => p.enabled),
		[providers],
	);

	// 2. 应用搜索 + capability filter
	const filteredByProvider = useMemo<
		Array<{ provider: ModelProvider; models: ProviderModel[] }>
	>(() => {
		const out: Array<{ provider: ModelProvider; models: ProviderModel[] }> = [];
		const q = searchText.trim().toLowerCase();
		for (const p of enabledProviders) {
			let models = p.models.filter((m) => m.enabled);
			if (q) {
				models = models.filter(
					(m) =>
						m.id.toLowerCase().includes(q) ||
						m.name.toLowerCase().includes(q) ||
						p.name.toLowerCase().includes(q),
				);
			}
			if (activeFilter === "free") {
				models = models.filter(
					(m) =>
						!m.pricing ||
						(m.pricing.inputPricePerMillion === 0 &&
							m.pricing.outputPricePerMillion === 0),
				);
			} else {
				const cap = FILTER_TO_CAPABILITY[activeFilter];
				if (cap) {
					models = models.filter((m) => m.capabilities.includes(cap));
				}
			}
			if (models.length > 0) {
				// 按 id 排序，稳定显示
				models = [...models].sort((a, b) => a.id.localeCompare(b.id));
				out.push({ provider: p, models });
			}
		}
		return out;
	}, [enabledProviders, searchText, activeFilter]);

	const totalCount = useMemo(
		() => filteredByProvider.reduce((sum, p) => sum + p.models.length, 0),
		[filteredByProvider],
	);

	const filterTabs = useMemo(
		() => [
			{ key: "all", label: t("modelManage.filterAll", { ns: "models" }) },
			{
				key: "reasoning",
				label: t("modelManage.filterReasoning", { ns: "models" }),
			},
			{
				key: "vision",
				label: t("modelManage.filterVision", { ns: "models" }),
			},
			{
				key: "web_search",
				label: t("modelManage.filterWebSearch", { ns: "models" }),
			},
			{ key: "free", label: t("modelManage.filterFree", { ns: "models" }) },
			{
				key: "tool_use",
				label: t("modelManage.filterToolUse", { ns: "models" }),
			},
		],
		[t],
	);

	const handlePick = (provider: ModelProvider, model: ProviderModel) => {
		onSelect({
			providerId: provider.id,
			modelId: model.id,
		});
		onClose();
	};

	// 当过滤结果变化时（搜索、capability tab 切换、open 重置），把可见 provider
	// 都默认展开；之后用户可手动收起/展开。
	// biome-ignore lint/correctness/useExhaustiveDependencies: filteredByProvider 是 useMemo 派生，依赖它即可
	useEffect(() => {
		setActiveKeys(filteredByProvider.map((entry) => entry.provider.id));
	}, [filteredByProvider]);

	return (
		<Modal
			title={t("modelPicker.title", "选择模型", { ns: "chat" })}
			open={open}
			onCancel={onClose}
			footer={null}
			width={760}
			styles={{
				body: { padding: 0, maxHeight: "72vh", overflow: "hidden" },
			}}
		>
			{/* 搜索 + 清除当前选择 */}
			<div className="flex items-center gap-2 px-6 pt-4 pb-2">
				<Input
					prefix={<SearchOutlined className="text-gray-400" />}
					placeholder={t(
						"modelPicker.searchPlaceholder",
						"搜索模型 ID 或名称…",
						{ ns: "chat" },
					)}
					value={searchText}
					onChange={(e) => setSearchText(e.target.value)}
					allowClear
					className="flex-1"
					autoFocus
				/>
				{messageSelection && (
					<button
						type="button"
						onClick={() => {
							onClear();
							onClose();
						}}
						style={{
							border: "none",
							background: "transparent",
							color: token.colorTextSecondary,
							fontSize: 12,
							cursor: "pointer",
							padding: "4px 10px",
							borderRadius: token.borderRadius,
						}}
					>
						{t("modelPicker.clearMessageOverride", "清除本次", {
							ns: "chat",
						})}
					</button>
				)}
				{sessionSelection && onClearSession && (
					<button
						type="button"
						onClick={() => {
							onClearSession();
							onClose();
						}}
						style={{
							border: "none",
							background: "transparent",
							color: token.colorTextSecondary,
							fontSize: 12,
							cursor: "pointer",
							padding: "4px 10px",
							borderRadius: token.borderRadius,
						}}
					>
						{t("modelPicker.clearSessionOverride", "恢复默认", {
							ns: "chat",
						})}
					</button>
				)}
			</div>

			{/* Capability filter tabs */}
			<div className="px-6">
				<Tabs
					activeKey={activeFilter}
					onChange={(key) => setActiveFilter(key as FilterTab)}
					size="small"
					items={filterTabs.map((tab) => ({
						key: tab.key,
						label: tab.label,
					}))}
				/>
			</div>

			{/* 列表 */}
			<div
				className="overflow-y-auto px-6 pb-4"
				style={{ maxHeight: "calc(72vh - 160px)" }}
			>
				{totalCount === 0 ? (
					<Empty
						image={Empty.PRESENTED_IMAGE_SIMPLE}
						description={t(
							"modelPicker.empty",
							"没有匹配的模型；请在 设置 → 模型 中启用所需模型。",
							{ ns: "chat" },
						)}
					/>
				) : (
					<Collapse
						bordered={false}
						ghost
						activeKey={activeKeys}
						onChange={(keys) => {
							setActiveKeys(Array.isArray(keys) ? keys : [keys]);
						}}
						items={filteredByProvider.map(({ provider, models }) => ({
							key: provider.id,
							label: (
								<div className="flex items-center gap-2">
									<ProviderIcon preset={provider.preset} size={22} />
									<Text strong style={{ fontSize: 13 }}>
										{provider.name}
									</Text>
									<Badge
										count={models.length}
										style={{
											backgroundColor: token.colorPrimaryBg,
											color: token.colorPrimary,
											boxShadow: "none",
										}}
									/>
								</div>
							),
							children: (
								<div style={{ display: "flex", flexDirection: "column" }}>
									{models.map((model) => {
										const isSelected =
											currentSelection?.providerId === provider.id &&
											currentSelection?.modelId === model.id;
										return (
											<div
												key={model.id}
												role="button"
												tabIndex={0}
												onClick={() => handlePick(provider, model)}
												onKeyDown={(e) => {
													if (e.key === "Enter" || e.key === " ") {
														e.preventDefault();
														handlePick(provider, model);
													}
												}}
												className={cn(
													"flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors",
													isSelected && "bg-blue-50 dark:bg-blue-900/20",
												)}
												style={{
													border: "none",
													background: isSelected
														? token.colorPrimaryBg
														: "transparent",
													cursor: "pointer",
													width: "100%",
													outline: "none",
												}}
												onMouseEnter={(e) => {
													if (!isSelected) {
														e.currentTarget.style.background =
															token.colorFillTertiary;
													}
												}}
												onMouseLeave={(e) => {
													if (!isSelected) {
														e.currentTarget.style.background = "transparent";
													}
												}}
											>
												<ProviderIcon preset={provider.preset} size={18} />
												<div
													style={{
														flex: 1,
														minWidth: 0,
														display: "flex",
														flexDirection: "column",
													}}
												>
													<Text
														style={{
															fontSize: 13,
															fontFamily:
																"ui-monospace, SFMono-Regular, monospace",
															color: isSelected
																? token.colorPrimary
																: token.colorText,
															whiteSpace: "nowrap",
															overflow: "hidden",
															textOverflow: "ellipsis",
														}}
													>
														{model.name || model.id}
													</Text>
													{model.name &&
														model.name !== model.id &&
														model.id && (
															<Text
																type="secondary"
																style={{
																	fontSize: 11,
																	whiteSpace: "nowrap",
																	overflow: "hidden",
																	textOverflow: "ellipsis",
																}}
															>
																{model.id}
															</Text>
														)}
												</div>
												<CapabilityChips
													capabilities={model.capabilities}
													contextWindow={model.contextWindow}
												/>
												<Button
													size="small"
													type="text"
													onClick={(e) => {
														e.stopPropagation();
														onSelectSession({
															providerId: provider.id,
															modelId: model.id,
														});
														onClose();
													}}
													onKeyDown={(e) => e.stopPropagation()}
												>
													{t("modelPicker.setSessionDefault", "设为会话默认", {
														ns: "chat",
													})}
												</Button>
												{isSelected && (
													<CheckOutlined
														style={{
															color: token.colorPrimary,
															marginLeft: 4,
														}}
													/>
												)}
											</div>
										);
									})}
								</div>
							),
						}))}
					/>
				)}
			</div>
		</Modal>
	);
}
