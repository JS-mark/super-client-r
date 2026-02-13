import {
	DeleteOutlined,
	EditOutlined,
	KeyOutlined,
	PlusOutlined,
	SearchOutlined,
	SettingOutlined,
	StarFilled,
	StarOutlined,
} from "@ant-design/icons";
import {
	Alert,
	Button,
	Card,
	List,
	Popconfirm,
	Tag,
	theme,
	Tooltip,
	message,
} from "antd";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { searchService } from "../../services/search/searchService";
import type { SearchConfig, SearchProviderType } from "../../types/search";
import { SearchConfigModal } from "./SearchConfigModal";
import { getProviderInfo } from "./SearchProviders";

const { useToken } = theme;

export function SearchSettings() {
	const { t } = useTranslation();
	const { token } = useToken();
	const [configs, setConfigs] = useState<SearchConfig[]>([]);
	const [defaultProvider, setDefaultProvider] = useState<
		SearchProviderType | undefined
	>();
	const [loading, setLoading] = useState(false);
	const [modalOpen, setModalOpen] = useState(false);
	const [editingConfig, setEditingConfig] = useState<SearchConfig | null>(
		null,
	);

	// Load configs
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
						t("search.loadError", "加载搜索配置失败"),
				);
			}
		} catch (error) {
			message.error(
				t("search.loadError", "加载搜索配置失败", { ns: "settings" }),
			);
		} finally {
			setLoading(false);
		}
	}, [t]);

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
					message.success(
						t("search.deleteSuccess", "删除成功", {
							ns: "settings",
						}),
					);
					loadConfigs();
				} else {
					message.error(
						result.error ||
							t("search.deleteError", "删除失败"),
					);
				}
			} catch (error) {
				message.error(
					t("search.deleteError", "删除失败", { ns: "settings" }),
				);
			}
		},
		[loadConfigs, t],
	);

	const handleSetDefault = useCallback(
		async (provider: SearchProviderType | null) => {
			try {
				const result = await searchService.setDefault(provider);
				if (result.success) {
					message.success(
						provider
							? t("search.setDefaultSuccess", "设置默认成功")
							: t("search.clearDefaultSuccess", "已取消默认", {
									ns: "settings",
								}),
					);
					loadConfigs();
				} else {
					message.error(
						result.error ||
							t("search.setDefaultError", "设置失败"),
					);
				}
			} catch (error) {
				message.error(
					t("search.setDefaultError", "设置失败", {
						ns: "settings",
					}),
				);
			}
		},
		[loadConfigs, t],
	);

	return (
		<div className="space-y-6">
			{/* Info alert */}
			<Alert
				message={t("search.title", "网络搜索配置")}
				description={t(
					"search.description",
					"配置第三方搜索服务，让 AI 能够获取最新的网络信息。支持 API 搜索和传统搜索引擎。",
					{ ns: "settings" },
				)}
				type="info"
				showIcon
				className="mb-4"
			/>

			{/* Default provider display */}
			{defaultProvider && (
				<Card className="!rounded-xl !border-slate-200 bg-gradient-to-r from-blue-50 to-indigo-50">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-3">
							<div className="w-10 h-10 rounded-lg bg-blue-500 text-white flex items-center justify-center text-lg font-bold">
								{getProviderInfo(defaultProvider)?.icon ||
									"🔍"}
							</div>
							<div>
								<div className="text-sm text-slate-500">
									{t(
										"search.currentDefault",
										"当前默认搜索引擎",
										{ ns: "settings" },
									)}
								</div>
								<div className="font-semibold text-slate-800" style={{ color: token.colorTextHeading }}>
									{getProviderInfo(defaultProvider)?.name ||
										defaultProvider}
								</div>
							</div>
						</div>
						<Button
							icon={
								<StarFilled className="text-yellow-500" />
							}
							onClick={() => handleSetDefault(null)}
							size="small"
						>
							{t("search.clearDefault", "取消默认", {
								ns: "settings",
							})}
						</Button>
					</div>
				</Card>
			)}

			{/* Config list */}
			<Card
				title={
					<div className="flex items-center justify-between">
						<span className="flex items-center gap-2">
							<SettingOutlined />
							{t("search.configList", "搜索配置", {
								ns: "settings",
							})}
						</span>
						<Button
							type="primary"
							icon={<PlusOutlined />}
							onClick={handleAddConfig}
							size="small"
						>
							{t("search.addConfig", "添加配置", {
								ns: "settings",
							})}
						</Button>
					</div>
				}
				className="!rounded-xl !border-slate-200"
				loading={loading}
			>
				<List
					dataSource={configs}
					renderItem={(config) => {
						const providerInfo = getProviderInfo(config.provider);
						const isDefault =
							config.provider === defaultProvider;

						return (
							<List.Item
								actions={[
									<Tooltip
										key="default"
										title={
											isDefault
												? t(
														"search.isDefault",
														"默认",
													)
												: t(
														"search.setAsDefault",
														"设为默认",
														{ ns: "settings" },
													)
										}
									>
										<Button
											icon={
												isDefault ? (
													<StarFilled className="text-yellow-500" />
												) : (
													<StarOutlined />
												)
											}
											onClick={() =>
												handleSetDefault(
													isDefault
														? null
														: config.provider,
												)
											}
											size="small"
											type={
												isDefault
													? "primary"
													: "default"
											}
											disabled={isDefault}
										/>
									</Tooltip>,
									<Tooltip
										key="edit"
										title={t("edit", "编辑", {
											ns: "common",
										})}
									>
										<Button
											icon={<EditOutlined />}
											onClick={() =>
												handleEditConfig(config)
											}
											size="small"
										/>
									</Tooltip>,
									<Popconfirm
										key="delete"
										title={t(
											"search.confirmDelete",
											"确定要删除此配置吗？",
											{ ns: "settings" },
										)}
										onConfirm={() =>
											handleDeleteConfig(config.id)
										}
										okText={t("confirm", "确定", {
											ns: "common",
										})}
										cancelText={t(
											"common.cancel",
											"取消",
										)}
									>
										<Tooltip
											title={t("delete", "删除", {
												ns: "common",
											})}
										>
											<Button
												icon={<DeleteOutlined />}
												danger
												size="small"
											/>
										</Tooltip>
									</Popconfirm>,
								]}
							>
								<List.Item.Meta
									avatar={
										<div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-lg" style={{ backgroundColor: token.colorBgContainer }}>
											{providerInfo?.icon || "🔍"}
										</div>
									}
									title={
										<div className="flex items-center gap-2">
											<span className="font-medium">
												{config.name}
											</span>
											{isDefault && (
												<Tag
													color="blue"
													className="!text-xs"
												>
													{t(
														"search.default",
														"默认",
														{ ns: "settings" },
													)}
												</Tag>
											)}
											{!config.enabled && (
												<Tag
													color="default"
													className="!text-xs"
												>
													{t(
														"search.disabled",
														"已禁用",
														{ ns: "settings" },
													)}
												</Tag>
											)}
										</div>
									}
									description={
										<div className="text-sm text-slate-500">
											{providerInfo?.description}
											{config.apiKey && (
												<span className="ml-2">
													<KeyOutlined className="text-xs" />{" "}
													••••••••
												</span>
											)}
										</div>
									}
								/>
							</List.Item>
						);
					}}
					locale={{
						emptyText: (
							<div className="text-center py-8 text-slate-400">
								<SearchOutlined className="text-4xl mb-2" />
								<p>
									{t("search.noConfigs", "暂无搜索配置", {
										ns: "settings",
									})}
								</p>
								<Button
									type="primary"
									icon={<PlusOutlined />}
									onClick={handleAddConfig}
									className="mt-4"
								>
									{t("search.addConfig", "添加配置", {
										ns: "settings",
									})}
								</Button>
							</div>
						),
					}}
				/>
			</Card>

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
