import { CheckCircleOutlined, DeleteOutlined, EditOutlined, KeyOutlined, LinkOutlined, PlusOutlined, QuestionCircleOutlined, SaveOutlined, SearchOutlined, SettingOutlined, StarFilled, StarOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Form, Input, List, message, Modal, Popconfirm, Select, Switch, Tag, Tooltip } from "antd";
import type { SearchConfig, SearchProviderType } from "../../types/search";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { searchService } from "../../services/search/searchService";
import { cn } from "../../lib/utils";

// 搜索引擎定义
interface SearchProvider {
	id: SearchProviderType;
	name: string;
	description: string;
	icon: string;
	requiresApiKey: boolean;
	requiresApiUrl: boolean;
	apiKeyLabel: string;
	apiUrlLabel?: string;
	apiKeyPlaceholder: string;
	apiUrlPlaceholder?: string;
	helpUrl?: string;
	isApiSearch: boolean;
}

const SEARCH_PROVIDERS: SearchProvider[] = [
	{
		id: "zhipu",
		name: "智谱 AI",
		description: "智谱 AI 搜索 API",
		icon: "🧠",
		requiresApiKey: true,
		requiresApiUrl: false,
		apiKeyLabel: "API Key",
		apiKeyPlaceholder: "请输入智谱 AI API Key",
		helpUrl: "https://open.bigmodel.cn/",
		isApiSearch: true,
	},
	{
		id: "tavily",
		name: "Tavily",
		description: "Tavily AI 搜索引擎",
		icon: "🔍",
		requiresApiKey: true,
		requiresApiUrl: false,
		apiKeyLabel: "API Key",
		apiKeyPlaceholder: "请输入 Tavily API Key",
		helpUrl: "https://tavily.com/",
		isApiSearch: true,
	},
	{
		id: "searxng",
		name: "SearXNG",
		description: "自建 SearXNG 搜索服务",
		icon: "🌐",
		requiresApiKey: false,
		requiresApiUrl: true,
		apiKeyLabel: "API Key (可选)",
		apiKeyPlaceholder: "如有访问限制，请输入 API Key",
		apiUrlLabel: "API 地址",
		apiUrlPlaceholder: "http://localhost:8080",
		helpUrl: "https://docs.searxng.org/",
		isApiSearch: true,
	},
	{
		id: "exa",
		name: "Exa",
		description: "Exa AI 搜索引擎",
		icon: "⚡",
		requiresApiKey: true,
		requiresApiUrl: false,
		apiKeyLabel: "API Key",
		apiKeyPlaceholder: "请输入 Exa API Key",
		helpUrl: "https://exa.ai/",
		isApiSearch: true,
	},
	{
		id: "exa_mcp",
		name: "Exa MCP",
		description: "Exa MCP Server",
		icon: "🔗",
		requiresApiKey: true,
		requiresApiUrl: false,
		apiKeyLabel: "API Key",
		apiKeyPlaceholder: "请输入 Exa API Key",
		helpUrl: "https://exa.ai/",
		isApiSearch: true,
	},
	{
		id: "bocha",
		name: "博查",
		description: "博查 AI 搜索引擎",
		icon: "🔎",
		requiresApiKey: true,
		requiresApiUrl: false,
		apiKeyLabel: "API Key",
		apiKeyPlaceholder: "请输入博查 API Key",
		isApiSearch: true,
	},
	{
		id: "sogou",
		name: "搜狗",
		description: "搜狗搜索 API",
		icon: "🐕",
		requiresApiKey: true,
		requiresApiUrl: false,
		apiKeyLabel: "API Key",
		apiKeyPlaceholder: "请输入搜狗 API Key",
		isApiSearch: true,
	},
	{
		id: "google",
		name: "Google",
		description: "Google 搜索 (通过 API)",
		icon: "G",
		requiresApiKey: true,
		requiresApiUrl: false,
		apiKeyLabel: "API Key / CX ID",
		apiKeyPlaceholder: "请输入 Google API Key 或 CX ID",
		helpUrl: "https://developers.google.com/custom-search",
		isApiSearch: false,
	},
	{
		id: "bing",
		name: "Bing",
		description: "必应搜索 (通过 API)",
		icon: "B",
		requiresApiKey: true,
		requiresApiUrl: false,
		apiKeyLabel: "API Key",
		apiKeyPlaceholder: "请输入 Bing API Key",
		helpUrl: "https://www.microsoft.com/en-us/bing/apis/bing-web-search-api",
		isApiSearch: false,
	},
	{
		id: "baidu",
		name: "百度",
		description: "百度搜索 (通过 API)",
		icon: "du",
		requiresApiKey: true,
		requiresApiUrl: false,
		apiKeyLabel: "API Key",
		apiKeyPlaceholder: "请输入百度 API Key",
		helpUrl: "https://apis.baidu.com/",
		isApiSearch: false,
	},
];

// 获取服务商信息
const getProviderInfo = (id: SearchProviderType): SearchProvider | undefined => {
	return SEARCH_PROVIDERS.find((p) => p.id === id);
};

export function SearchSettings() {
	const { t } = useTranslation();
	const [configs, setConfigs] = useState<SearchConfig[]>([]);
	const [defaultProvider, setDefaultProvider] = useState<SearchProviderType | undefined>();
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [validating, setValidating] = useState(false);
	const [modalOpen, setModalOpen] = useState(false);
	const [editingConfig, setEditingConfig] = useState<SearchConfig | null>(null);
	const [form] = Form.useForm();
	const [selectedProvider, setSelectedProvider] = useState<SearchProviderType | null>(null);

	// 加载配置
	const loadConfigs = useCallback(async () => {
		setLoading(true);
		try {
			const result = await searchService.getConfigs();
			if (result.success && result.data) {
				setConfigs(result.data.configs);
				setDefaultProvider(result.data.defaultProvider);
			} else {
				message.error(result.error || t("search.loadError", "加载搜索配置失败"));
			}
		} catch (error) {
			message.error(t("search.loadError", "加载搜索配置失败", { ns: "settings" }));
		} finally {
			setLoading(false);
		}
	}, [t]);

	useEffect(() => {
		loadConfigs();
	}, [loadConfigs]);

	// 打开新建配置弹窗
	const handleAddConfig = useCallback(() => {
		setEditingConfig(null);
		form.resetFields();
		setSelectedProvider(null);
		setModalOpen(true);
	}, [form]);

	// 打开编辑配置弹窗
	const handleEditConfig = useCallback((config: SearchConfig) => {
		setEditingConfig(config);
		form.setFieldsValue({
			provider: config.provider,
			name: config.name,
			apiKey: config.apiKey,
			apiUrl: config.apiUrl,
			enabled: config.enabled,
		});
		setSelectedProvider(config.provider);
		setModalOpen(true);
	}, [form]);

	// 保存配置
	const handleSaveConfig = useCallback(async (values: any) => {
		setSaving(true);
		try {
			const provider = values.provider as SearchProviderType;
			const providerInfo = getProviderInfo(provider);

			const config: SearchConfig = {
				id: editingConfig?.id || `${provider}_${Date.now()}`,
				provider,
				name: values.name || providerInfo?.name || provider,
				apiKey: values.apiKey || "",
				apiUrl: values.apiUrl || "",
				enabled: values.enabled !== false,
				isDefault: editingConfig?.isDefault || false,
			};

			const result = await searchService.saveConfig(config);
			if (result.success) {
				message.success(t("search.saveSuccess", "保存成功", { ns: "settings" }));
				setModalOpen(false);
				loadConfigs();
			} else {
				message.error(result.error || t("search.saveError", "保存失败"));
			}
		} catch (error) {
			message.error(t("search.saveError", "保存失败", { ns: "settings" }));
		} finally {
			setSaving(false);
		}
	}, [editingConfig, loadConfigs, t]);

	// 删除配置
	const handleDeleteConfig = useCallback(async (id: string) => {
		try {
			const result = await searchService.deleteConfig(id);
			if (result.success) {
				message.success(t("search.deleteSuccess", "删除成功", { ns: "settings" }));
				loadConfigs();
			} else {
				message.error(result.error || t("search.deleteError", "删除失败"));
			}
		} catch (error) {
			message.error(t("search.deleteError", "删除失败", { ns: "settings" }));
		}
	}, [loadConfigs, t]);

	// 设置默认搜索引擎
	const handleSetDefault = useCallback(async (provider: SearchProviderType | null) => {
		try {
			const result = await searchService.setDefault(provider);
			if (result.success) {
				message.success(provider
					? t("search.setDefaultSuccess", "设置默认成功")
					: t("search.clearDefaultSuccess", "已取消默认", { ns: "settings" }));
				loadConfigs();
			} else {
				message.error(result.error || t("search.setDefaultError", "设置失败"));
			}
		} catch (error) {
			message.error(t("search.setDefaultError", "设置失败", { ns: "settings" }));
		}
	}, [loadConfigs, t]);

	// 验证配置
	const handleValidateConfig = useCallback(async () => {
		const values = form.getFieldsValue();
		if (!values.provider) {
			message.warning(t("search.selectProviderFirst", "请先选择服务商", { ns: "settings" }));
			return;
		}

		setValidating(true);
		try {
			const providerInfo = getProviderInfo(values.provider);
			const config: SearchConfig = {
				id: "temp",
				provider: values.provider,
				name: values.name || providerInfo?.name || values.provider,
				apiKey: values.apiKey || "",
				apiUrl: values.apiUrl || "",
				enabled: true,
			};

			const result = await searchService.validateConfig(config);
			if (result.success && result.data?.valid) {
				message.success(t("search.validateSuccess", "API Key 有效", { ns: "settings" }));
			} else {
				message.error(result.data?.error || result.error || t("search.validateError", "验证失败"));
			}
		} catch (error) {
			message.error(t("search.validateError", "验证失败", { ns: "settings" }));
		} finally {
			setValidating(false);
		}
	}, [form, t]);

	// 处理服务商选择变化
	const handleProviderChange = useCallback((value: SearchProviderType) => {
		setSelectedProvider(value);
		const providerInfo = getProviderInfo(value);
		if (providerInfo && !form.getFieldValue("name")) {
			form.setFieldValue("name", providerInfo.name);
		}
	}, [form]);

	// 当前选择的服务商信息
	const currentProvider = useMemo(() => {
		return selectedProvider ? getProviderInfo(selectedProvider) : null;
	}, [selectedProvider]);

	// 按类型分组显示
	const apiSearchProviders = SEARCH_PROVIDERS.filter((p) => p.isApiSearch);
	const localSearchProviders = SEARCH_PROVIDERS.filter((p) => !p.isApiSearch);

	return (
		<div className="space-y-6">
			{/* 提示信息 */}
			<Alert
				message={t("search.title", "网络搜索配置")}
				description={t("search.description", "配置第三方搜索服务，让 AI 能够获取最新的网络信息。支持 API 搜索和传统搜索引擎。", { ns: "settings" })}
				type="info"
				showIcon
				className="mb-4"
			/>

			{/* 默认搜索引擎显示 */}
			{defaultProvider && (
				<Card className="!rounded-xl !border-slate-200 dark:!border-slate-700 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-3">
							<div className="w-10 h-10 rounded-lg bg-blue-500 text-white flex items-center justify-center text-lg font-bold">
								{getProviderInfo(defaultProvider)?.icon || "🔍"}
							</div>
							<div>
								<div className="text-sm text-slate-500">{t("search.currentDefault", "当前默认搜索引擎", { ns: "settings" })}</div>
								<div className="font-semibold text-slate-800 dark:text-slate-200">
									{getProviderInfo(defaultProvider)?.name || defaultProvider}
								</div>
							</div>
						</div>
						<Button
							icon={<StarFilled className="text-yellow-500" />}
							onClick={() => handleSetDefault(null)}
							size="small"
						>
							{t("search.clearDefault", "取消默认", { ns: "settings" })}
						</Button>
					</div>
				</Card>
			)}

			{/* 配置列表 */}
			<Card
				title={
					<div className="flex items-center justify-between">
						<span className="flex items-center gap-2">
							<SettingOutlined />
							{t("search.configList", "搜索配置", { ns: "settings" })}
						</span>
						<Button
							type="primary"
							icon={<PlusOutlined />}
							onClick={handleAddConfig}
							size="small"
						>
							{t("search.addConfig", "添加配置", { ns: "settings" })}
						</Button>
					</div>
				}
				className="!rounded-xl !border-slate-200 dark:!border-slate-700"
				loading={loading}
			>
				<List
					dataSource={configs}
					renderItem={(config) => {
						const providerInfo = getProviderInfo(config.provider);
						const isDefault = config.provider === defaultProvider;

						return (
							<List.Item
								actions={[
									<Tooltip key="default" title={isDefault ? t("search.isDefault", "默认") : t("search.setAsDefault", "设为默认", { ns: "settings" })}>
										<Button
											icon={isDefault ? <StarFilled className="text-yellow-500" /> : <StarOutlined />}
											onClick={() => handleSetDefault(isDefault ? null : config.provider)}
											size="small"
											type={isDefault ? "primary" : "default"}
											disabled={isDefault}
										/>
									</Tooltip>,
									<Tooltip key="edit" title={t("edit", "编辑", { ns: "common" })}>
										<Button
											icon={<EditOutlined />}
											onClick={() => handleEditConfig(config)}
											size="small"
										/>
									</Tooltip>,
									<Popconfirm
										key="delete"
										title={t("search.confirmDelete", "确定要删除此配置吗？", { ns: "settings" })}
										onConfirm={() => handleDeleteConfig(config.id)}
										okText={t("confirm", "确定", { ns: "common" })}
										cancelText={t("common.cancel", "取消")}
									>
										<Tooltip title={t("delete", "删除", { ns: "common" })}>
											<Button icon={<DeleteOutlined />} danger size="small" />
										</Tooltip>
									</Popconfirm>,
								]}
							>
								<List.Item.Meta
									avatar={
										<div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-lg">
											{providerInfo?.icon || "🔍"}
										</div>
									}
									title={
										<div className="flex items-center gap-2">
											<span className="font-medium">{config.name}</span>
											{isDefault && (
												<Tag color="blue" className="!text-xs">
													{t("search.default", "默认", { ns: "settings" })}
												</Tag>
											)}
											{!config.enabled && (
												<Tag color="default" className="!text-xs">
													{t("search.disabled", "已禁用", { ns: "settings" })}
												</Tag>
											)}
										</div>
									}
									description={
										<div className="text-sm text-slate-500">
											{providerInfo?.description}
											{config.apiKey && (
												<span className="ml-2">
													<KeyOutlined className="text-xs" /> ••••••••
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
								<p>{t("search.noConfigs", "暂无搜索配置", { ns: "settings" })}</p>
								<Button type="primary" icon={<PlusOutlined />} onClick={handleAddConfig} className="mt-4">
									{t("search.addConfig", "添加配置", { ns: "settings" })}
								</Button>
							</div>
						),
					}}
				/>
			</Card>

			{/* 添加/编辑配置弹窗 */}
			<Modal
				title={
					<div className="flex items-center gap-2">
						<SearchOutlined />
						{editingConfig
							? t("search.editConfig", "编辑搜索配置")
							: t("search.addConfig", "添加搜索配置", { ns: "settings" })}
					</div>
				}
				open={modalOpen}
				onCancel={() => setModalOpen(false)}
				footer={null}
				width={560}
				destroyOnClose
			>
				<Form
					form={form}
					layout="vertical"
					onFinish={handleSaveConfig}
					className="mt-4"
				>
					{/* 服务商选择 */}
					<Form.Item
						name="provider"
						label={t("search.provider", "搜索服务商", { ns: "settings" })}
						rules={[{ required: true, message: t("search.providerRequired", "请选择搜索服务商") }]}
					>
						<Select
							placeholder={t("search.selectProvider", "请选择服务商", { ns: "settings" })}
							onChange={handleProviderChange}
							disabled={!!editingConfig}
							options={[
								{
									label: t("search.apiSearch", "API 搜索", { ns: "settings" }),
									options: apiSearchProviders.map((p) => ({
										value: p.id,
										label: (
											<div className="flex items-center gap-2">
												<span>{p.icon}</span>
												<span>{p.name}</span>
											</div>
										),
									})),
								},
								{
									label: t("search.traditionalSearch", "传统搜索", { ns: "settings" }),
									options: localSearchProviders.map((p) => ({
										value: p.id,
										label: (
											<div className="flex items-center gap-2">
												<span className="font-bold text-blue-500">{p.icon}</span>
												<span>{p.name}</span>
											</div>
										),
									})),
								},
							]}
						/>
					</Form.Item>

					{/* 服务商描述 */}
					{currentProvider && (
						<div className="mb-4 p-3 rounded-lg bg-slate-50 dark:bg-slate-800 text-sm text-slate-600 dark:text-slate-400">
							<div className="flex items-center justify-between">
								<span>{currentProvider.description}</span>
								{currentProvider.helpUrl && (
									<a
										href={currentProvider.helpUrl}
										target="_blank"
										rel="noopener noreferrer"
										className="text-blue-500 hover:text-blue-600 flex items-center gap-1"
									>
										<QuestionCircleOutlined />
										{t("search.getApiKey", "获取 API Key", { ns: "settings" })}
									</a>
								)}
							</div>
						</div>
					)}

					{/* 配置名称 */}
					<Form.Item
						name="name"
						label={t("search.configName", "配置名称", { ns: "settings" })}
						rules={[{ required: true, message: t("search.nameRequired", "请输入配置名称") }]}
					>
						<Input placeholder={t("search.namePlaceholder", "例如：我的 Tavily 搜索", { ns: "settings" })} />
					</Form.Item>

					{/* API Key */}
					{currentProvider?.requiresApiKey && (
						<Form.Item
							name="apiKey"
							label={
								<div className="flex items-center gap-2">
									<KeyOutlined />
									{currentProvider?.apiKeyLabel || "API Key"}
								</div>
							}
							rules={currentProvider?.requiresApiKey ? [{ required: true, message: t("search.apiKeyRequired", "请输入 API Key", { ns: "settings" }) }] : []}
						>
							<Input.Password
								placeholder={currentProvider?.apiKeyPlaceholder}
								suffix={
									<Button
										size="small"
										onClick={handleValidateConfig}
										loading={validating}
										disabled={!form.getFieldValue("apiKey")}
									>
										<CheckCircleOutlined />
										{t("search.validate", "检测", { ns: "settings" })}
									</Button>
								}
							/>
						</Form.Item>
					)}

					{/* API URL (for SearXNG) */}
					{currentProvider?.requiresApiUrl && (
						<Form.Item
							name="apiUrl"
							label={
								<div className="flex items-center gap-2">
									<LinkOutlined />
									{currentProvider?.apiUrlLabel || "API URL"}
								</div>
							}
							rules={[{ required: true, message: t("search.apiUrlRequired", "请输入 API URL", { ns: "settings" }) }]}
						>
							<Input placeholder={currentProvider?.apiUrlPlaceholder} />
						</Form.Item>
					)}

					{/* 启用状态 */}
					<Form.Item name="enabled" valuePropName="checked">
						<Switch
							checkedChildren={t("search.enabled", "已启用")}
							unCheckedChildren={t("search.disabled", "已禁用", { ns: "settings" })}
							defaultChecked
						/>
					</Form.Item>

					{/* 按钮 */}
					<div className="flex justify-end gap-2 mt-6">
						<Button onClick={() => setModalOpen(false)}>
							{t("cancel", "取消", { ns: "common" })}
						</Button>
						<Button type="primary" htmlType="submit" loading={saving} icon={<SaveOutlined />}>
							{t("save", "保存", { ns: "common" })}
						</Button>
					</div>
				</Form>
			</Modal>
		</div>
	);
}
