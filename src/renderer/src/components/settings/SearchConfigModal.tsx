import {
	CheckCircleOutlined,
	KeyOutlined,
	LinkOutlined,
	QuestionCircleOutlined,
	SaveOutlined,
	SearchOutlined,
} from "@ant-design/icons";
import { App, Button, Form, Input, Modal, Select, Switch, theme } from "antd";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { searchService } from "../../services/search/searchService";
import type { SearchConfig, SearchProviderType } from "../../types/search";
import { getProviderInfo, SEARCH_PROVIDERS } from "./SearchProviders";

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
	const { message } = App.useApp();
	const { token } = useToken();
	const [form] = Form.useForm();
	const [selectedProvider, setSelectedProvider] =
		useState<SearchProviderType | null>(null);
	const [saving, setSaving] = useState(false);
	const [validating, setValidating] = useState(false);

	// Reactively watch apiKey so the validate button enables/disables properly
	const watchedApiKey = Form.useWatch("apiKey", form);

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
			message.warning(t("search.selectProviderFirst", { ns: "settings" }));
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
				message.success(t("search.validateSuccess", { ns: "settings" }));
			} else {
				message.error(
					result.data?.error ||
						result.error ||
						t("search.validateError", { ns: "settings" }),
				);
			}
		} catch {
			message.error(t("search.validateError", { ns: "settings" }));
		} finally {
			setValidating(false);
		}
	}, [form, t, message]);

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
					message.success(t("search.saveSuccess", { ns: "settings" }));
					onClose();
					onSaved();
				} else {
					message.error(
						result.error || t("search.saveError", { ns: "settings" }),
					);
				}
			} catch {
				message.error(t("search.saveError", { ns: "settings" }));
			} finally {
				setSaving(false);
			}
		},
		[editingConfig, onClose, onSaved, t, message],
	);

	return (
		<Modal
			title={
				<div className="flex items-center gap-2">
					<SearchOutlined />
					{editingConfig
						? t("search.editConfig", { ns: "settings" })
						: t("search.addConfig", { ns: "settings" })}
				</div>
			}
			open={open}
			onCancel={onClose}
			footer={null}
			width={560}
			destroyOnHidden
			afterOpenChange={(visible) => {
				if (visible && editingConfig) {
					form.setFieldsValue({
						provider: editingConfig.provider,
						name: editingConfig.name,
						apiKey: editingConfig.apiKey,
						apiUrl: editingConfig.apiUrl,
						enabled: editingConfig.enabled,
					});
					setSelectedProvider(editingConfig.provider);
				} else if (visible) {
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
					label={t("search.provider", { ns: "settings" })}
					rules={[
						{
							required: true,
							message: t("search.providerRequired", { ns: "settings" }),
						},
					]}
				>
					<Select
						placeholder={t("search.selectProvider", { ns: "settings" })}
						onChange={handleProviderChange}
						disabled={!!editingConfig}
						options={[
							{
								label: t("search.apiSearch", { ns: "settings" }),
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
								label: t("search.traditionalSearch", { ns: "settings" }),
								options: localSearchProviders.map((p) => ({
									value: p.id,
									label: (
										<div className="flex items-center gap-2">
											<span
												style={{ color: token.colorPrimary }}
												className="font-bold"
											>
												{p.icon}
											</span>
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
							backgroundColor: token.colorFillQuaternary,
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
									className="flex items-center gap-1 hover:opacity-80"
									style={{ color: token.colorPrimary }}
								>
									<QuestionCircleOutlined />
									{t("search.getApiKey", { ns: "settings" })}
								</a>
							)}
						</div>
					</div>
				)}

				{/* Config name */}
				<Form.Item
					name="name"
					label={t("search.configName", { ns: "settings" })}
					rules={[
						{
							required: true,
							message: t("search.nameRequired", { ns: "settings" }),
						},
					]}
				>
					<Input
						placeholder={t("search.namePlaceholder", { ns: "settings" })}
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
											message: t("search.apiKeyRequired", {
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
									disabled={!watchedApiKey}
								>
									<CheckCircleOutlined />
									{t("search.validate", { ns: "settings" })}
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
								message: t("search.apiUrlRequired", { ns: "settings" }),
							},
						]}
					>
						<Input placeholder={currentProvider?.apiUrlPlaceholder} />
					</Form.Item>
				)}

				{/* Enable toggle */}
				<Form.Item name="enabled" valuePropName="checked">
					<Switch
						checkedChildren={t("search.enabled", { ns: "settings" })}
						unCheckedChildren={t("search.disabled", { ns: "settings" })}
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
