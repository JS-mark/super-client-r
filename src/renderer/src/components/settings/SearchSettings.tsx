import {
	CheckCircleOutlined,
	DeleteOutlined,
	EditOutlined,
	ExportOutlined,
	PlusOutlined,
	StarFilled,
	StarOutlined,
} from "@ant-design/icons";
import {
	App,
	Button,
	Empty,
	Popconfirm,
	Switch,
	Tooltip,
	Typography,
	theme,
} from "antd";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { searchService } from "../../services/search/searchService";
import type { SearchConfig, SearchProviderType } from "../../types/search";
import { SearchConfigModal } from "./SearchConfigModal";
import { getProviderInfo } from "./SearchProviders";

const { useToken } = theme;
const { Text } = Typography;

export function SearchSettings() {
	const { t } = useTranslation();
	const { message } = App.useApp();
	const { token } = useToken();
	const [configs, setConfigs] = useState<SearchConfig[]>([]);
	const [defaultProvider, setDefaultProvider] = useState<
		SearchProviderType | undefined
	>();
	const [loading, setLoading] = useState(false);
	const [modalOpen, setModalOpen] = useState(false);
	const [editingConfig, setEditingConfig] = useState<SearchConfig | null>(null);

	const loadConfigs = useCallback(async () => {
		setLoading(true);
		try {
			const result = await searchService.getConfigs();
			if (result.success && result.data) {
				setConfigs(result.data.configs);
				setDefaultProvider(result.data.defaultProvider);
			} else {
				message.error(
					result.error ||
						t("search.loadError", { ns: "settings" }),
				);
			}
		} catch {
			message.error(t("search.loadError", { ns: "settings" }));
		} finally {
			setLoading(false);
		}
	}, [t, message]);

	useEffect(() => {
		loadConfigs();
	}, [loadConfigs]);

	const handleAddConfig = useCallback(() => {
		setEditingConfig(null);
		setModalOpen(true);
	}, []);

	const handleEditConfig = useCallback((config: SearchConfig) => {
		setEditingConfig(config);
		setModalOpen(true);
	}, []);

	const handleDeleteConfig = useCallback(
		async (id: string) => {
			try {
				const result = await searchService.deleteConfig(id);
				if (result.success) {
					message.success(t("search.deleteSuccess", { ns: "settings" }));
					loadConfigs();
				} else {
					message.error(
						result.error || t("search.deleteError", { ns: "settings" }),
					);
				}
			} catch {
				message.error(t("search.deleteError", { ns: "settings" }));
			}
		},
		[loadConfigs, t, message],
	);

	const handleSetDefault = useCallback(
		async (provider: SearchProviderType | null) => {
			try {
				const result = await searchService.setDefault(provider);
				if (result.success) {
					message.success(
						provider
							? t("search.setDefaultSuccess", { ns: "settings" })
							: t("search.clearDefaultSuccess", { ns: "settings" }),
					);
					loadConfigs();
				} else {
					message.error(
						result.error || t("search.setDefaultError", { ns: "settings" }),
					);
				}
			} catch {
				message.error(t("search.setDefaultError", { ns: "settings" }));
			}
		},
		[loadConfigs, t, message],
	);

	const handleToggleEnabled = useCallback(
		async (config: SearchConfig, enabled: boolean) => {
			try {
				const result = await searchService.saveConfig({
					...config,
					enabled,
				});
				if (result.success) {
					loadConfigs();
				} else {
					message.error(result.error || t("search.saveError", { ns: "settings" }));
				}
			} catch {
				message.error(t("search.saveError", { ns: "settings" }));
			}
		},
		[loadConfigs, t, message],
	);

	if (loading && configs.length === 0) {
		return (
			<div className="flex items-center justify-center py-16">
				<div
					className="text-sm"
					style={{ color: token.colorTextSecondary }}
				>
					Loading...
				</div>
			</div>
		);
	}

	return (
		<div className="animate-fade-in">
			{/* Header */}
			<div className="flex items-center justify-between mb-6">
				<div>
					<Text
						strong
						className="text-base"
						style={{ color: token.colorText }}
					>
						{t("search.title", { ns: "settings" })}
					</Text>
					<div
						className="text-xs mt-1"
						style={{ color: token.colorTextTertiary }}
					>
						{t("search.description", { ns: "settings" })}
					</div>
				</div>
				<Button
					type="primary"
					icon={<PlusOutlined />}
					onClick={handleAddConfig}
				>
					{t("search.addConfig", { ns: "settings" })}
				</Button>
			</div>

			{/* Config list */}
			{configs.length === 0 ? (
				<div className="flex flex-col items-center justify-center py-16">
					<Empty
						image={Empty.PRESENTED_IMAGE_SIMPLE}
						description={
							<span style={{ color: token.colorTextSecondary }}>
								{t("search.noConfigs", { ns: "settings" })}
							</span>
						}
					>
						<Button
							type="primary"
							icon={<PlusOutlined />}
							onClick={handleAddConfig}
						>
							{t("search.addConfig", { ns: "settings" })}
						</Button>
					</Empty>
				</div>
			) : (
				<div className="flex flex-col gap-3">
					{configs.map((config) => {
						const providerInfo = getProviderInfo(config.provider);
						const isDefault = config.provider === defaultProvider;

						return (
							<div
								key={config.id}
								className="group rounded-xl border p-4 transition-colors duration-150"
								style={{
									borderColor: isDefault
										? token.colorPrimaryBorder
										: token.colorBorderSecondary,
									background: isDefault
										? token.colorPrimaryBg
										: token.colorBgContainer,
								}}
								onMouseEnter={(e) => {
									if (!isDefault) {
										e.currentTarget.style.borderColor =
											token.colorBorder;
									}
								}}
								onMouseLeave={(e) => {
									if (!isDefault) {
										e.currentTarget.style.borderColor =
											token.colorBorderSecondary;
									}
								}}
							>
								<div className="flex items-center gap-4">
									{/* Provider icon */}
									<div
										className="w-10 h-10 rounded-lg flex items-center justify-center text-lg flex-none"
										style={{
											background: token.colorFillTertiary,
										}}
									>
										{providerInfo?.icon || "🔍"}
									</div>

									{/* Info */}
									<div className="flex-1 min-w-0">
										<div className="flex items-center gap-2">
											<Text
												strong
												className="text-sm"
												style={{ color: token.colorText }}
											>
												{config.name}
											</Text>
											{isDefault && (
												<span
													className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
													style={{
														color: token.colorPrimary,
														background: token.colorPrimaryBg,
														border: `1px solid ${token.colorPrimaryBorder}`,
													}}
												>
													<StarFilled className="text-[10px]" />
													{t("search.default", { ns: "settings" })}
												</span>
											)}
											{!config.enabled && (
												<span
													className="inline-flex items-center px-2 py-0.5 rounded-full text-xs"
													style={{
														color: token.colorTextQuaternary,
														background: token.colorFillQuaternary,
													}}
												>
													{t("search.disabled", { ns: "settings" })}
												</span>
											)}
										</div>
										<div
											className="text-xs mt-1 flex items-center gap-2"
											style={{ color: token.colorTextTertiary }}
										>
											<span>{providerInfo?.description}</span>
											{config.apiKey && (
												<span className="flex items-center gap-1">
													<CheckCircleOutlined />
													API Key
												</span>
											)}
											{providerInfo?.helpUrl && (
												<a
													href={providerInfo.helpUrl}
													target="_blank"
													rel="noopener noreferrer"
													className="flex items-center gap-0.5 hover:opacity-80"
													style={{ color: token.colorTextTertiary }}
													onClick={(e) => e.stopPropagation()}
												>
													<ExportOutlined className="text-[10px]" />
												</a>
											)}
										</div>
									</div>

									{/* Actions */}
									<div className="flex items-center gap-2 flex-none">
										{/* Default toggle */}
										<Tooltip
											title={
												isDefault
													? t("search.clearDefault", { ns: "settings" })
													: t("search.setAsDefault", { ns: "settings" })
											}
										>
											<Button
												type="text"
												size="small"
												icon={
													isDefault ? (
														<StarFilled
															style={{ color: "#faad14" }}
														/>
													) : (
														<StarOutlined
															style={{
																color: token.colorTextQuaternary,
															}}
														/>
													)
												}
												onClick={() =>
													handleSetDefault(
														isDefault ? null : config.provider,
													)
												}
											/>
										</Tooltip>

										{/* Enable/Disable */}
										<Switch
											size="small"
											checked={config.enabled}
											onChange={(checked) =>
												handleToggleEnabled(config, checked)
											}
										/>

										{/* Edit */}
										<Tooltip title={t("edit", { ns: "settings" })}>
											<Button
												type="text"
												size="small"
												icon={
													<EditOutlined
														style={{
															color: token.colorTextSecondary,
														}}
													/>
												}
												onClick={() => handleEditConfig(config)}
											/>
										</Tooltip>

										{/* Delete */}
										<Popconfirm
											title={t("search.confirmDelete", "确定要删除此配置吗？", {
												ns: "settings",
											})}
											onConfirm={() => handleDeleteConfig(config.id)}
											okText={t("confirm", "确定", { ns: "common" })}
											cancelText={t("common.cancel", "取消")}
										>
											<Tooltip title={t("delete", { ns: "settings" })}>
												<Button
													type="text"
													size="small"
													danger
													icon={<DeleteOutlined />}
												/>
											</Tooltip>
										</Popconfirm>
									</div>
								</div>
							</div>
						);
					})}
				</div>
			)}

			{/* Add/Edit config modal */}
			<SearchConfigModal
				open={modalOpen}
				editingConfig={editingConfig}
				onClose={() => {
					setModalOpen(false);
					setEditingConfig(null);
				}}
				onSaved={loadConfigs}
			/>
		</div>
	);
}
