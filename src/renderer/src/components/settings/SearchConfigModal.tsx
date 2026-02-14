import {
	CheckCircleOutlined,
	KeyOutlined,
	LinkOutlined,
	QuestionCircleOutlined,
	SaveOutlined,
	SearchOutlined,
} from "@ant-design/icons";
import {
	Button,
	Form,
	Input,
	Modal,
	message,
	Select,
	Switch,
	theme,
} from "antd";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { searchService } from "../../services/search/searchService";
import type { SearchConfig, SearchProviderType } from "../../types/search";
import {
	getProviderInfo,
	SEARCH_PROVIDERS,
} from "./SearchProviders";

const { useToken } = theme;

interface SearchConfigModalProps {
	open: boolean;
	editingConfig: SearchConfig | null;
	onClose: () => void;
	onSaved: () => void;
}

export function SearchConfigModal({
	open,
	editingConfig,
	onClose,
	onSaved,
}: SearchConfigModalProps) {
	const { t } = useTranslation();
	const { token } = useToken();
	const [form] = Form.useForm();
	const [selectedProvider, setSelectedProvider] =
		useState<SearchProviderType | null>(null);
	const [saving, setSaving] = useState(false);
	const [validating, setValidating] = useState(false);

	const currentProvider = useMemo(() => {
		return selectedProvider ? getProviderInfo(selectedProvider) : null;
	}, [selectedProvider]);

	const apiSearchProviders = SEARCH_PROVIDERS.filter((p) => p.isApiSearch);
	const localSearchProviders = SEARCH_PROVIDERS.filter((p) => !p.isApiSearch);

	const handleProviderChange = useCallback(
		(value: SearchProviderType) => {
			setSelectedProvider(value);
			const providerInfo = getProviderInfo(value);
			if (providerInfo && !form.getFieldValue("name")) {
				form.setFieldValue("name", providerInfo.name);
			}
		},
		[form],
	);

	const handleValidateConfig = useCallback(async () => {
		const values = form.getFieldsValue();
		if (!values.provider) {
			message.warning(
				t("search.selectProviderFirst", "请先选择服务商", {
					ns: "settings",
				}),
			);
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
				message.success(
					t("search.validateSuccess", "API Key 有效", { ns: "settings" }),
				);
			} else {
				message.error(
					result.data?.error ||
					result.error ||
					t("search.validateError", "验证失败"),
				);
			}
		} catch (error) {
			message.error(t("search.validateError", "验证失败", { ns: "settings" }));
		} finally {
			setValidating(false);
		}
	}, [form, t]);

	const handleSaveConfig = useCallback(
		async (values: any) => {
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
					message.success(
						t("search.saveSuccess", "保存成功", { ns: "settings" }),
					);
					onClose();
					onSaved();
				} else {
					message.error(result.error || t("search.saveError", "保存失败"));
				}
			} catch (error) {
				message.error(t("search.saveError", "保存失败", { ns: "settings" }));
			} finally {
				setSaving(false);
			}
		},
		[editingConfig, onClose, onSaved, t],
	);

	return (
		<Modal
			title={
				<div className="flex items-center gap-2">
					<SearchOutlined />
					{editingConfig
						? t("search.editConfig", "编辑搜索配置")
						: t("search.addConfig", "添加搜索配置", { ns: "settings" })}
				</div>
			}
			open={open}
			onCancel={onClose}
			footer={null}
			width={560}
			destroyOnClose
			afterOpenChange={(open) => {
				if (open && editingConfig) {
					form.setFieldsValue({
						provider: editingConfig.provider,
						name: editingConfig.name,
						apiKey: editingConfig.apiKey,
						apiUrl: editingConfig.apiUrl,
						enabled: editingConfig.enabled,
					});
					setSelectedProvider(editingConfig.provider);
				} else if (open) {
					form.resetFields();
					setSelectedProvider(null);
				}
			}}
		>
			<Form
				form={form}
				layout="vertical"
				onFinish={handleSaveConfig}
				className="mt-4"
			>
				{/* Provider select */}
				<Form.Item
					name="provider"
					label={t("search.provider", "搜索服务商", { ns: "settings" })}
					rules={[
						{
							required: true,
							message: t("search.providerRequired", "请选择搜索服务商"),
						},
					]}
				>
					<Select
						placeholder={t("search.selectProvider", "请选择服务商", {
							ns: "settings",
						})}
						onChange={handleProviderChange}
						disabled={!!editingConfig}
						options={[
							{
								label: t("search.apiSearch", "API 搜索", {
									ns: "settings",
								}),
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
								label: t("search.traditionalSearch", "传统搜索", {
									ns: "settings",
								}),
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

				{/* Provider description */}
				{currentProvider && (
					<div
						className="mb-4 p-3 rounded-lg text-sm"
						style={{
							backgroundColor: token.colorBgContainer,
							color: token.colorTextSecondary,
						}}
					>
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
									{t("search.getApiKey", "获取 API Key", {
										ns: "settings",
									})}
								</a>
							)}
						</div>
					</div>
				)}

				{/* Config name */}
				<Form.Item
					name="name"
					label={t("search.configName", "配置名称", { ns: "settings" })}
					rules={[
						{
							required: true,
							message: t("search.nameRequired", "请输入配置名称"),
						},
					]}
				>
					<Input
						placeholder={t("search.namePlaceholder", "例如：我的 Tavily 搜索", {
							ns: "settings",
						})}
					/>
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
						rules={
							currentProvider?.requiresApiKey
								? [
									{
										required: true,
										message: t("search.apiKeyRequired", "请输入 API Key", {
											ns: "settings",
										}),
									},
								]
								: []
						}
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
									{t("search.validate", "检测", {
										ns: "settings",
									})}
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
						rules={[
							{
								required: true,
								message: t("search.apiUrlRequired", "请输入 API URL", {
									ns: "settings",
								}),
							},
						]}
					>
						<Input placeholder={currentProvider?.apiUrlPlaceholder} />
					</Form.Item>
				)}

				{/* Enable toggle */}
				<Form.Item name="enabled" valuePropName="checked">
					<Switch
						checkedChildren={t("search.enabled", "已启用")}
						unCheckedChildren={t("search.disabled", "已禁用", {
							ns: "settings",
						})}
						defaultChecked
					/>
				</Form.Item>

				{/* Buttons */}
				<div className="flex justify-end gap-2 mt-6">
					<Button onClick={onClose}>
						{t("cancel", "取消", { ns: "common" })}
					</Button>
					<Button
						type="primary"
						htmlType="submit"
						loading={saving}
						icon={<SaveOutlined />}
					>
						{t("save", "保存", { ns: "common" })}
					</Button>
				</div>
			</Form>
		</Modal>
	);
}
