import {
	MinusCircleOutlined,
	ReloadOutlined,
	SearchOutlined,
	SettingOutlined,
	SortAscendingOutlined,
} from "@ant-design/icons";
import {
	Badge,
	Button,
	Collapse,
	Empty,
	Input,
	Modal,
	Space,
	Spin,
	Tabs,
	Tooltip,
	Typography,
} from "antd";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/utils";
import type {
	ModelCapability,
	ModelProvider,
	ProviderModel,
} from "../../types/models";
import { CapabilityIcons } from "./CapabilityIcons";
import { ModelConfigPanel } from "./ModelConfigPanel";
import { ProviderIcon } from "./ProviderIcon";

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

const FILTER_TO_CAPABILITY: Record<string, ModelCapability | null> = {
	all: null,
	reasoning: "reasoning",
	vision: "vision",
	web_search: "web_search",
	free: null, // special handling
	embedding: "embedding",
	reranking: "reranking",
	tool_use: "tool_use",
};

interface ModelManageModalProps {
	open: boolean;
	onClose: () => void;
	provider: ModelProvider;
	models: ProviderModel[];
	onModelsChange: (models: ProviderModel[]) => void;
	onRefresh: () => void;
	isRefreshing: boolean;
}

export function ModelManageModal({
	open,
	onClose,
	provider,
	models,
	onModelsChange,
	onRefresh,
	isRefreshing,
}: ModelManageModalProps) {
	const { t } = useTranslation();
	const [searchText, setSearchText] = useState("");
	const [activeFilter, setActiveFilter] = useState<FilterTab>("all");
	const [sortBy, setSortBy] = useState<"name" | "group">("group");
	const [configModel, setConfigModel] = useState<ProviderModel | null>(null);
	const [configOpen, setConfigOpen] = useState(false);

	// Filter models
	const filteredModels = useMemo(() => {
		let result = models;

		// Search filter
		if (searchText.trim()) {
			const lower = searchText.toLowerCase();
			result = result.filter(
				(m) =>
					m.id.toLowerCase().includes(lower) ||
					m.name.toLowerCase().includes(lower),
			);
		}

		// Capability filter
		if (activeFilter === "free") {
			result = result.filter(
				(m) =>
					!m.pricing ||
					(m.pricing.inputPricePerMillion === 0 &&
						m.pricing.outputPricePerMillion === 0),
			);
		} else {
			const cap = FILTER_TO_CAPABILITY[activeFilter];
			if (cap) {
				result = result.filter((m) => m.capabilities.includes(cap));
			}
		}

		return result;
	}, [models, searchText, activeFilter]);

	// Group models
	const groupedModels = useMemo(() => {
		const groups = new Map<string, ProviderModel[]>();

		if (sortBy === "group") {
			for (const model of filteredModels) {
				const groupName = model.group || "Other";
				const group = groups.get(groupName) || [];
				group.push(model);
				groups.set(groupName, group);
			}
		} else {
			// Sort by name - single group
			const sorted = [...filteredModels].sort((a, b) =>
				a.name.localeCompare(b.name),
			);
			groups.set("All Models", sorted);
		}

		// Sort within each group
		for (const [key, group] of groups) {
			groups.set(
				key,
				group.sort((a, b) => a.id.localeCompare(b.id)),
			);
		}

		return groups;
	}, [filteredModels, sortBy]);

	const existingGroups = useMemo(() => {
		const groups = new Set<string>();
		for (const model of models) {
			if (model.group) groups.add(model.group);
		}
		return Array.from(groups).sort();
	}, [models]);

	const handleToggleModel = useCallback(
		(modelId: string) => {
			const updated = models.map((m) =>
				m.id === modelId ? { ...m, enabled: !m.enabled } : m,
			);
			onModelsChange(updated);
		},
		[models, onModelsChange],
	);

	const handleRemoveGroup = useCallback(
		(groupName: string) => {
			const updated = models.map((m) => {
				const mg = m.group || "Other";
				if (mg === groupName) {
					return { ...m, enabled: false };
				}
				return m;
			});
			onModelsChange(updated);
		},
		[models, onModelsChange],
	);

	const handleConfigSave = useCallback(
		(modelId: string, config: Partial<ProviderModel>) => {
			const updated = models.map((m) =>
				m.id === modelId ? { ...m, ...config } : m,
			);
			onModelsChange(updated);
		},
		[models, onModelsChange],
	);

	const handleOpenConfig = useCallback((model: ProviderModel) => {
		setConfigModel(model);
		setConfigOpen(true);
	}, []);

	const toggleSort = useCallback(() => {
		setSortBy((prev) => (prev === "name" ? "group" : "name"));
	}, []);

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
				key: "embedding",
				label: t("modelManage.filterEmbedding", { ns: "models" }),
			},
			{
				key: "reranking",
				label: t("modelManage.filterReranking", { ns: "models" }),
			},
			{
				key: "tool_use",
				label: t("modelManage.filterToolUse", { ns: "models" }),
			},
		],
		[t],
	);

	return (
		<>
			<Modal
				title={
					<div className="flex items-center gap-2">
						<ProviderIcon preset={provider.preset} size={24} />
						<span>
							{t("modelManage.title", {
								ns: "models",
								name: provider.name,
							})}
						</span>
					</div>
				}
				open={open}
				onCancel={onClose}
				footer={null}
				width={720}
				styles={{
					body: { padding: 0, maxHeight: "70vh", overflow: "hidden" },
				}}
			>
				{/* Search + Actions */}
				<div className="flex items-center gap-2 px-6 pt-4 pb-2">
					<Input
						prefix={<SearchOutlined className="text-gray-300" />}
						placeholder={t("modelManage.searchPlaceholder", {
							ns: "models",
						})}
						value={searchText}
						onChange={(e) => setSearchText(e.target.value)}
						allowClear
						className="flex-1"
					/>
					<Tooltip
						title={
							sortBy === "group"
								? t("modelManage.sortByName", { ns: "models" })
								: t("modelManage.sortByGroup", { ns: "models" })
						}
					>
						<Button icon={<SortAscendingOutlined />} onClick={toggleSort} />
					</Tooltip>
					<Tooltip title={t("modelManage.refresh", { ns: "models" })}>
						<Button
							icon={<ReloadOutlined spin={isRefreshing} />}
							onClick={onRefresh}
							loading={isRefreshing}
						/>
					</Tooltip>
				</div>

				{/* Filter Tabs */}
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

				{/* Model List */}
				<div
					className="overflow-y-auto px-6 pb-4"
					style={{ maxHeight: "calc(70vh - 160px)" }}
				>
					{isRefreshing && (
						<div className="flex justify-center py-8">
							<Spin />
						</div>
					)}

					{!isRefreshing && filteredModels.length === 0 && (
						<Empty
							image={Empty.PRESENTED_IMAGE_SIMPLE}
							description={
								models.length === 0
									? t("modelManage.noModels", { ns: "models" })
									: t("modelManage.noMatchingModels", { ns: "models" })
							}
						>
							{models.length === 0 && (
								<Button type="primary" onClick={onRefresh}>
									{t("modelManage.refresh", { ns: "models" })}
								</Button>
							)}
						</Empty>
					)}

					{!isRefreshing && filteredModels.length > 0 && (
						<Collapse
							defaultActiveKey={Array.from(groupedModels.keys())}
							ghost
							items={Array.from(groupedModels.entries()).map(
								([groupName, groupModels]) => ({
									key: groupName,
									label: (
										<div className="flex items-center gap-2">
											<Text strong className="text-sm">
												{groupName}
											</Text>
											<Badge
												count={groupModels.length}
												color="blue"
												size="small"
											/>
										</div>
									),
									extra: (
										<Button
											type="text"
											size="small"
											danger
											onClick={(e) => {
												e.stopPropagation();
												handleRemoveGroup(groupName);
											}}
										>
											{t("modelManage.removeAll", { ns: "models" })}
										</Button>
									),
									children: (
										<div className="flex flex-col">
											{groupModels.map((model) => (
												<div
													key={model.id}
													className={cn(
														"flex items-center gap-3 px-3 py-2 rounded-lg transition-colors group",
														model.enabled
															? "hover:bg-blue-50/50"
															: "opacity-50 hover:bg-gray-50",
													)}
												>
													{/* Model icon */}
													<ProviderIcon
														preset={provider.preset}
														size={20}
														className="shrink-0"
													/>

													{/* Name + ID */}
													<div className="flex-1 min-w-0">
														<div className="text-sm font-medium truncate">
															{model.name}
														</div>
														{model.name !== model.id && (
															<div className="text-xs text-gray-400 truncate">
																{model.id}
															</div>
														)}
													</div>

													{/* Capability icons */}
													<CapabilityIcons
														capabilities={model.capabilities}
														size="small"
													/>

													{/* Actions */}
													<Space
														size={4}
														className="opacity-0 group-hover:opacity-100 transition-opacity"
													>
														<Tooltip
															title={t("modelManage.configureModel", {
																ns: "models",
															})}
														>
															<Button
																type="text"
																size="small"
																icon={<SettingOutlined />}
																onClick={() => handleOpenConfig(model)}
															/>
														</Tooltip>
														<Tooltip
															title={
																model.enabled
																	? t("modelManage.disableModel", {
																			ns: "models",
																		})
																	: t("modelManage.enableModel", {
																			ns: "models",
																		})
															}
														>
															<Button
																type="text"
																size="small"
																danger={model.enabled}
																icon={<MinusCircleOutlined />}
																onClick={() => handleToggleModel(model.id)}
															/>
														</Tooltip>
													</Space>
												</div>
											))}
										</div>
									),
								}),
							)}
						/>
					)}
				</div>
			</Modal>

			{/* Config Drawer */}
			<ModelConfigPanel
				open={configOpen}
				onClose={() => setConfigOpen(false)}
				model={configModel}
				existingGroups={existingGroups}
				onSave={handleConfigSave}
			/>
		</>
	);
}
