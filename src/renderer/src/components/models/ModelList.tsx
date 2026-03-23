import {
	AppstoreOutlined,
	CheckCircleOutlined,
	CloseCircleOutlined,
	DeleteOutlined,
	LinkOutlined,
	LoadingOutlined,
	PlusOutlined,
	RobotOutlined,
	SearchOutlined,
	ThunderboltOutlined,
} from "@ant-design/icons";
import {
	App,
	Button,
	Divider,
	Empty,
	Form,
	Input,
	Popconfirm,
	Select,
	Space,
	Switch,
	Tag,
	Typography,
	theme,
} from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { modelService } from "../../services/modelService";
import { useModelStore } from "../../stores/modelStore";
import type {
	ModelProvider,
	ModelProviderPreset,
	ProviderModel,
} from "../../types/models";
import { ModelManageModal } from "./ModelManageModal";
import {
	getPresetProvider,
	isClaudeCodeCompatible,
	PRESET_PROVIDERS,
	type PresetProviderInfo,
} from "./ModelProviders";
import { ProviderIcon } from "./ProviderIcon";

const { Text } = Typography;
const { useToken } = theme;

interface ModelListProps {
	addTrigger?: number;
}

export const ModelList: React.FC<ModelListProps> = ({ addTrigger }) => {
	const { t, i18n } = useTranslation();
	const { message } = App.useApp();
	const { token } = useToken();
	const providers = useModelStore((s) => s.providers);
	const loadProviders = useModelStore((s) => s.loadProviders);
	const activeSelection = useModelStore((s) => s.activeSelection);
	const setActiveModel = useModelStore((s) => s.setActiveModel);
	const loadActiveModel = useModelStore((s) => s.loadActiveModel);
	const getAllEnabledModels = useModelStore((s) => s.getAllEnabledModels);
	const saveProvider = useModelStore((s) => s.saveProvider);
	const deleteProvider = useModelStore((s) => s.deleteProvider);

	const [selectedProviderId, setSelectedProviderId] = useState<string | null>(
		null,
	);
	const [isAdding, setIsAdding] = useState(false);
	const [searchText, setSearchText] = useState("");
	const [form] = Form.useForm();
	const [isTesting, setIsTesting] = useState(false);
	const [testResult, setTestResult] = useState<{
		success: boolean;
		latencyMs: number;
		error?: string;
	} | null>(null);
	const [isFetchingModels, setIsFetchingModels] = useState(false);
	const [fetchedModels, setFetchedModels] = useState<ProviderModel[]>([]);
	const [selectedModelIds, setSelectedModelIds] = useState<string[]>([]);
	const [manageModalOpen, setManageModalOpen] = useState(false);
	const [claudeCodeEnabled, setClaudeCodeEnabled] = useState(false);
	const [claudeCodeModel, setClaudeCodeModel] = useState<string | undefined>(undefined);
	const watchedPreset = Form.useWatch("preset", form) as ModelProviderPreset | undefined;

	const isZh = i18n.language?.startsWith("zh");

	useEffect(() => {
		loadProviders();
		loadActiveModel();
	}, [loadProviders, loadActiveModel]);

	// Auto-select first provider when list loads
	useEffect(() => {
		if (providers.length > 0 && !selectedProviderId && !isAdding) {
			setSelectedProviderId(providers[0].id);
		}
	}, [providers, selectedProviderId, isAdding]);

	// Sync form when selecting existing provider
	const selectedProvider = useMemo(
		() => providers.find((p) => p.id === selectedProviderId) ?? null,
		[providers, selectedProviderId],
	);

	useEffect(() => {
		if (selectedProvider && !isAdding) {
			setTestResult(
				selectedProvider.tested ? { success: true, latencyMs: 0 } : null,
			);
			setFetchedModels([]);
			setSelectedModelIds(
				selectedProvider.models.filter((m) => m.enabled).map((m) => m.id),
			);
			setClaudeCodeEnabled(!!selectedProvider.claudeCodeEnabled);
			setClaudeCodeModel(selectedProvider.claudeCodeModel);
			form.setFieldsValue({
				preset: selectedProvider.preset,
				name: selectedProvider.name,
				baseUrl: selectedProvider.baseUrl,
				apiKey: selectedProvider.apiKey,
			});
		}
	}, [selectedProvider, isAdding, form]);

	// Default model selector logic
	const handleModelChange = useCallback(
		async (value: string | undefined) => {
			if (!value) {
				await setActiveModel(null);
				return;
			}
			const [providerId, modelId] = value.split("||");
			await setActiveModel({ providerId, modelId });
			message.success(t("messages.activeModelSet", { ns: "models" }));
		},
		[setActiveModel, message, t],
	);

	const enabledModels = getAllEnabledModels();
	const activeValue = activeSelection
		? `${activeSelection.providerId}||${activeSelection.modelId}`
		: undefined;

	const modelSelectOptions = useMemo(() => {
		const grouped = enabledModels.reduce<
			Record<
				string,
				{
					providerName: string;
					models: { label: string; value: string }[];
				}
			>
		>((acc, { provider, model }) => {
			if (!acc[provider.id]) {
				acc[provider.id] = { providerName: provider.name, models: [] };
			}
			acc[provider.id].models.push({
				label: model.name,
				value: `${provider.id}||${model.id}`,
			});
			return acc;
		}, {});
		return Object.entries(grouped).map(([, group]) => ({
			label: group.providerName,
			options: group.models,
		}));
	}, [enabledModels]);

	const handleAdd = useCallback(() => {
		setIsAdding(true);
		setSelectedProviderId(null);
		setTestResult(null);
		setFetchedModels([]);
		setSelectedModelIds([]);
		setClaudeCodeEnabled(false);
		setClaudeCodeModel(undefined);
		form.resetFields();
	}, [form]);

	useEffect(() => {
		if (addTrigger && addTrigger > 0) {
			handleAdd();
		}
	}, [addTrigger, handleAdd]);

	const handleSelectProvider = useCallback(
		(id: string) => {
			if (isAdding) {
				setIsAdding(false);
			}
			setSelectedProviderId(id);
			setTestResult(null);
			setFetchedModels([]);
		},
		[isAdding],
	);

	const handlePresetChange = useCallback(
		(preset: ModelProviderPreset) => {
			const info = getPresetProvider(preset);
			if (info) {
				form.setFieldsValue({
					name: isZh ? info.nameZh : info.name,
					baseUrl: info.defaultBaseUrl,
				});
				setTestResult(null);
				setFetchedModels([]);
				setSelectedModelIds([]);
			}
		},
		[form, isZh],
	);

	const handleTestConnection = useCallback(async () => {
		const baseUrl = form.getFieldValue("baseUrl");
		const apiKey = form.getFieldValue("apiKey");
		if (!baseUrl) {
			message.warning(t("form.baseUrlRequired", { ns: "models" }));
			return;
		}
		setIsTesting(true);
		setTestResult(null);
		try {
			const result = await modelService.testConnection(baseUrl, apiKey || "");
			if (result.success && result.data) {
				setTestResult(result.data);
				if (result.data.success) {
					message.success(
						t("messages.testSuccess", { ns: "models" }) +
							` (${result.data.latencyMs}ms)`,
					);
				} else {
					message.error(
						result.data.error || t("messages.testError", { ns: "models" }),
					);
				}
			} else {
				message.error(
					result.error || t("messages.testError", { ns: "models" }),
				);
			}
		} catch {
			message.error(t("messages.testError", { ns: "models" }));
		} finally {
			setIsTesting(false);
		}
	}, [form, message, t]);

	const handleFetchModels = useCallback(async () => {
		const baseUrl = form.getFieldValue("baseUrl");
		const apiKey = form.getFieldValue("apiKey");
		const preset = form.getFieldValue("preset") as
			| ModelProviderPreset
			| undefined;
		if (!baseUrl) return;
		setIsFetchingModels(true);
		try {
			const result = await modelService.fetchModels(
				baseUrl,
				apiKey || "",
				preset,
			);
			if (result.success && result.data) {
				setFetchedModels(result.data.models);
				if (selectedModelIds.length === 0) {
					setSelectedModelIds(result.data.models.map((m) => m.id));
				}
			} else {
				message.error(
					result.error || t("messages.fetchModelsError", { ns: "models" }),
				);
			}
		} catch {
			message.error(t("messages.fetchModelsError", { ns: "models" }));
		} finally {
			setIsFetchingModels(false);
		}
	}, [form, message, t, selectedModelIds.length]);

	const handleSave = useCallback(
		async (values: {
			preset: ModelProviderPreset;
			name: string;
			baseUrl: string;
			apiKey: string;
		}) => {
			const now = Date.now();
			const models: ProviderModel[] =
				fetchedModels.length > 0
					? fetchedModels.map((m) => ({
							...m,
							enabled: selectedModelIds.includes(m.id),
						}))
					: (selectedProvider?.models ?? []).map((m) => ({
							...m,
							enabled: selectedModelIds.includes(m.id),
						}));

			const provider: ModelProvider = {
				id: selectedProvider?.id ?? `provider_${now}`,
				name: values.name,
				preset: values.preset,
				baseUrl: values.baseUrl,
				apiKey: values.apiKey || "",
				enabled: selectedProvider?.enabled ?? testResult?.success === true,
				tested: testResult?.success === true,
				models,
				createdAt: selectedProvider?.createdAt ?? now,
				updatedAt: now,
				claudeCodeEnabled,
				claudeCodeModel,
			};

			try {
				await saveProvider(provider);
				message.success(t("messages.saveSuccess", { ns: "models" }));
				if (isAdding) {
					setIsAdding(false);
					setSelectedProviderId(provider.id);
				}
			} catch {
				message.error(t("messages.saveError", { ns: "models" }));
			}
		},
		[
			selectedProvider,
			fetchedModels,
			selectedModelIds,
			testResult,
			saveProvider,
			message,
			t,
			isAdding,
			claudeCodeEnabled,
			claudeCodeModel,
		],
	);

	const handleDelete = useCallback(
		async (id: string) => {
			try {
				await deleteProvider(id);
				message.success(t("messages.deleteSuccess", { ns: "models" }));
				if (selectedProviderId === id) {
					setSelectedProviderId(null);
				}
			} catch {
				message.error(t("messages.deleteError", { ns: "models" }));
			}
		},
		[deleteProvider, message, t, selectedProviderId],
	);

	const handleToggleEnabled = useCallback(
		async (provider: ModelProvider, checked: boolean) => {
			if (checked && !provider.tested) {
				message.warning(t("messages.testFirst", { ns: "models" }));
				return;
			}
			const updated = { ...provider, enabled: checked, updatedAt: Date.now() };
			await saveProvider(updated);
		},
		[saveProvider, message, t],
	);

	const getPresetName = (preset: ModelProviderPreset) => {
		const info = getPresetProvider(preset);
		if (!info) return preset;
		return isZh ? info.nameZh : info.name;
	};

	// Filter providers by search
	const filteredProviders = useMemo(() => {
		if (!searchText.trim()) return providers;
		const lower = searchText.toLowerCase();
		return providers.filter(
			(p) =>
				p.name.toLowerCase().includes(lower) ||
				getPresetName(p.preset).toLowerCase().includes(lower),
		);
	}, [providers, searchText, getPresetName]);

	// Current editing context: either a new provider or a selected existing provider
	const showRightPanel = isAdding || selectedProvider !== null;

	return (
		<div className="animate-fade-in">
			{/* Default Model Selector */}
			<div
				className="flex items-center justify-between gap-3 mb-3 px-4 py-2.5 rounded-xl border"
				style={{
					borderColor: token.colorBorderSecondary,
					background: token.colorBgContainer,
				}}
			>
				<div className="flex items-center gap-1.5 shrink-0">
					<ThunderboltOutlined className="text-amber-500" />
					<Text strong className="text-[13px]">
						{t("activeModel", { ns: "models" })}
					</Text>
				</div>
				<Select
					size="small"
					variant="borderless"
					className="flex-1 max-w-[360px]"
					placeholder={t("selectActiveModel", { ns: "models" })}
					value={activeValue}
					onChange={handleModelChange}
					allowClear
					showSearch
					optionFilterProp="label"
					options={modelSelectOptions}
					popupMatchSelectWidth={false}
				/>
			</div>

			{/* Split Panel Layout */}
			<div
				className="flex rounded-xl border overflow-hidden"
				style={{ height: "calc(100vh - 180px)", minHeight: 400, borderColor: token.colorBorderSecondary }}
			>
				{/* Left Panel - Provider List */}
				<div
					className="w-64 shrink-0 border-r flex flex-col"
					style={{
						borderColor: token.colorBorderSecondary,
						background: token.colorBgLayout,
					}}
				>
					{/* Search */}
					<div
						className="p-3 border-b"
						style={{ borderColor: token.colorBorderSecondary }}
					>
						<Input
							prefix={
								<SearchOutlined style={{ color: token.colorTextQuaternary }} />
							}
							placeholder={t("searchProvider", { ns: "models" })}
							value={searchText}
							onChange={(e) => setSearchText(e.target.value)}
							allowClear
							size="small"
							className="rounded-lg!"
						/>
					</div>

					{/* Provider List */}
					<div className="flex-1 overflow-y-auto">
						{filteredProviders.map((provider) => {
							const isSelected =
								selectedProviderId === provider.id && !isAdding;
							return (
								<div
									key={provider.id}
									className="flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors border-l-2"
									style={{
										borderLeftColor: isSelected
											? token.colorPrimary
											: "transparent",
										background: isSelected ? token.colorPrimaryBg : undefined,
									}}
									onMouseEnter={(e) => {
										if (!isSelected)
											e.currentTarget.style.background =
												token.colorFillTertiary;
									}}
									onMouseLeave={(e) => {
										if (!isSelected) e.currentTarget.style.background = "";
									}}
									onClick={() => handleSelectProvider(provider.id)}
								>
									<ProviderIcon preset={provider.preset} size={32} />
									<div className="flex-1 min-w-0">
										<div
											className="text-sm font-medium truncate"
											style={{ color: token.colorText }}
										>
											{provider.name}
										</div>
										<div
											className="text-xs truncate"
											style={{ color: token.colorTextSecondary }}
										>
											{getPresetName(provider.preset)}
										</div>
									</div>
									{provider.claudeCodeEnabled && (
										<RobotOutlined
											className="text-[11px]"
											style={{ color: token.colorPrimary }}
										/>
									)}
									{provider.enabled && (
										<Tag
											color="green"
											className="text-xs! leading-tight! px-1.5! py-0! m-0! rounded!"
										>
											ON
										</Tag>
									)}
								</div>
							);
						})}

						{providers.length === 0 && !isAdding && (
							<div className="flex flex-col items-center justify-center py-12 px-4 text-center">
								<Empty
									image={Empty.PRESENTED_IMAGE_SIMPLE}
									description={
										<span
											className="text-xs"
											style={{ color: token.colorTextSecondary }}
										>
											{t("empty", { ns: "models" })}
										</span>
									}
								/>
							</div>
						)}
					</div>

					{/* Add Button */}
					<div
						className="p-3 border-t"
						style={{ borderColor: token.colorBorderSecondary }}
					>
						<Button
							type="dashed"
							icon={<PlusOutlined />}
							onClick={handleAdd}
							block
							className="rounded-lg!"
						>
							{t("addProvider", { ns: "models" })}
						</Button>
					</div>
				</div>

				{/* Right Panel - Provider Detail */}
				<div
					className="flex-1 flex flex-col"
					style={{ background: token.colorBgContainer }}
				>
					{showRightPanel ? (
						<>
						<div className="flex-1 overflow-y-auto p-6">
							{/* Header */}
							<div className="flex items-center justify-between mb-6">
								<h3
									className="text-lg font-semibold m-0"
									style={{ color: token.colorText }}
								>
									{isAdding
										? t("addProvider", { ns: "models" })
										: selectedProvider?.name}
								</h3>
								<Space>
									{!isAdding && selectedProvider && (
										<>
											<Switch
												checked={selectedProvider.enabled}
												onChange={(checked) =>
													handleToggleEnabled(selectedProvider, checked)
												}
												checkedChildren={t("providerEnabled", { ns: "models" })}
												unCheckedChildren={t("providerDisabled", {
													ns: "models",
												})}
											/>
											<Popconfirm
												title={t("confirmDelete", { ns: "models" })}
												onConfirm={() => handleDelete(selectedProvider.id)}
											>
												<Button
													type="text"
													danger
													icon={<DeleteOutlined />}
													size="small"
												/>
											</Popconfirm>
										</>
									)}
								</Space>
							</div>

							{/* Form */}
							<Form form={form} layout="vertical" onFinish={handleSave}>
								<Form.Item
									name="preset"
									label={t("form.preset", { ns: "models" })}
									rules={[
										{
											required: true,
											message: t("form.presetRequired", { ns: "models" }),
										},
									]}
								>
									<Select
										placeholder={t("form.presetPlaceholder", { ns: "models" })}
										onChange={handlePresetChange}
										showSearch
										optionFilterProp="label"
										disabled={!isAdding && !!selectedProvider}
										options={PRESET_PROVIDERS.map((p: PresetProviderInfo) => ({
											label: isZh ? `${p.nameZh} (${p.name})` : p.name,
											value: p.id,
										}))}
									/>
								</Form.Item>

								<Form.Item
									name="name"
									label={t("form.name", { ns: "models" })}
									rules={[
										{
											required: true,
											message: t("form.nameRequired", { ns: "models" }),
										},
									]}
								>
									<Input
										placeholder={t("form.namePlaceholder", { ns: "models" })}
									/>
								</Form.Item>

								<Form.Item
									name="apiKey"
									label={t("form.apiKey", { ns: "models" })}
									help={t("form.apiKeyHelp", { ns: "models" })}
								>
									<Input.Password placeholder="sk-..." />
								</Form.Item>

								<Form.Item
									name="baseUrl"
									label={t("form.baseUrl", { ns: "models" })}
									rules={[
										{
											required: true,
											message: t("form.baseUrlRequired", { ns: "models" }),
										},
									]}
								>
									<Input placeholder="https://api.example.com/v1" />
								</Form.Item>

								{/* Test Connection */}
								<div className="flex items-center gap-3 mb-4">
									<Button
										icon={isTesting ? <LoadingOutlined /> : <LinkOutlined />}
										onClick={handleTestConnection}
										loading={isTesting}
									>
										{t("test", { ns: "models" })}
									</Button>
									{testResult && (
										<span
											className="text-sm"
											style={{
												color: testResult.success
													? token.colorSuccess
													: token.colorError,
											}}
										>
											{testResult.success ? (
												<>
													<CheckCircleOutlined className="mr-1" />
													{testResult.latencyMs > 0 &&
														`${testResult.latencyMs}ms`}
													{testResult.latencyMs === 0 &&
														t("messages.testSuccess", { ns: "models" })}
												</>
											) : (
												<>
													<CloseCircleOutlined className="mr-1" />
													{testResult.error ||
														t("messages.testError", { ns: "models" })}
												</>
											)}
										</span>
									)}
								</div>

								{/* Claude Code / Agent Section */}
								<ClaudeCodeSection
									preset={watchedPreset}
									claudeCodeEnabled={claudeCodeEnabled}
									onClaudeCodeChange={setClaudeCodeEnabled}
									claudeCodeModel={claudeCodeModel}
									onClaudeCodeModelChange={setClaudeCodeModel}
									models={
										fetchedModels.length > 0
											? fetchedModels
											: selectedProvider?.models ?? []
									}
									testPassed={testResult?.success === true}
									currentProviderId={selectedProvider?.id}
									providers={providers}
									token={token}
								/>

								</Form>
						</div>

						{/* Fixed bottom bar */}
						<div
							className="shrink-0 px-6 py-3 border-t flex items-center justify-between"
							style={{ borderColor: token.colorBorderSecondary }}
						>
							{/* Left: model management buttons */}
							<div>
								{testResult?.success && (
									<Space>
										<Button
											icon={
												isFetchingModels ? (
													<LoadingOutlined />
												) : (
													<ThunderboltOutlined />
												)
											}
											onClick={handleFetchModels}
											loading={isFetchingModels}
											size="small"
										>
											{t("fetchModels", { ns: "models" })}
										</Button>
										{(fetchedModels.length > 0 ||
											(selectedProvider &&
												selectedProvider.models.length > 0)) && (
											<Button
												icon={<AppstoreOutlined />}
												onClick={() => setManageModalOpen(true)}
												size="small"
												type="primary"
												ghost
											>
												{t("manageModels", { ns: "models" })}
											</Button>
										)}
									</Space>
								)}
							</div>
							{/* Right: save/cancel */}
							<Space>
								{isAdding && (
									<Button
										onClick={() => {
											setIsAdding(false);
											if (providers.length > 0) {
												setSelectedProviderId(providers[0].id);
											}
										}}
									>
										{t("cancel", { ns: "models" })}
									</Button>
								)}
								<Button type="primary" onClick={() => form.submit()}>
									{t("save", { ns: "models" })}
								</Button>
							</Space>
						</div>
						</>
					) : (
						<div className="flex flex-col items-center justify-center h-full text-center px-8">
							<ProviderIcon
								preset="custom"
								size={56}
								className="mb-4 opacity-30!"
							/>
							<Text type="secondary" className="text-sm">
								{t("noProviderSelected", { ns: "models" })}
							</Text>
							<Text type="secondary" className="text-xs mt-1">
								{t("noProviderSelectedHint", { ns: "models" })}
							</Text>
						</div>
					)}
				</div>
			</div>

			{/* Model Manage Modal */}
			{selectedProvider && (
				<ModelManageModal
					open={manageModalOpen}
					onClose={() => setManageModalOpen(false)}
					provider={selectedProvider}
					models={
						fetchedModels.length > 0 ? fetchedModels : selectedProvider.models
					}
					onModelsChange={(updatedModels) => {
						if (fetchedModels.length > 0) {
							setFetchedModels(updatedModels);
						}
						setSelectedModelIds(
							updatedModels.filter((m) => m.enabled).map((m) => m.id),
						);
					}}
					onRefresh={handleFetchModels}
					isRefreshing={isFetchingModels}
				/>
			)}
		</div>
	);
};

/* ------------------------------------------------------------------ */
/*  ClaudeCodeSection                                                   */
/* ------------------------------------------------------------------ */
function ClaudeCodeSection({
	preset,
	claudeCodeEnabled,
	onClaudeCodeChange,
	claudeCodeModel,
	onClaudeCodeModelChange,
	models,
	testPassed,
	currentProviderId,
	providers,
	token,
}: {
	preset: ModelProviderPreset | undefined;
	claudeCodeEnabled: boolean;
	onClaudeCodeChange: (v: boolean) => void;
	claudeCodeModel: string | undefined;
	onClaudeCodeModelChange: (model: string | undefined) => void;
	models: ProviderModel[];
	testPassed: boolean;
	currentProviderId: string | undefined;
	providers: ModelProvider[];
	token: ReturnType<typeof useToken>["token"];
}) {
	const { t } = useTranslation();
	const isCompatible = preset ? isClaudeCodeCompatible(preset) : false;

	// Find if another provider already has claudeCodeEnabled
	const existingCCProvider = useMemo(
		() =>
			providers.find(
				(p) => p.claudeCodeEnabled && p.id !== currentProviderId,
			),
		[providers, currentProviderId],
	);

	return (
		<>
			<Divider className="my-4!" />
			<div className="mb-3">
				<Text strong className="text-sm flex items-center gap-1.5">
					<RobotOutlined />
					{t("claudeCode.title", { ns: "models" })}
				</Text>
			</div>

			{isCompatible ? (
				<div
					className="py-2 px-3 rounded-lg"
					style={{ backgroundColor: token.colorFillQuaternary }}
				>
					<div className="flex items-center justify-between">
						<div>
							<div
								className="text-[13px]"
								style={{ color: token.colorText }}
							>
								{t("claudeCode.useForAgent", { ns: "models" })}
							</div>
							<div
								className="text-[11px] mt-0.5"
								style={{ color: token.colorTextQuaternary }}
							>
								{!testPassed
									? t("claudeCode.testFirst", { ns: "models" })
									: t("claudeCode.useForAgentHint", { ns: "models" })}
							</div>
						</div>
						<Switch
							checked={claudeCodeEnabled}
							onChange={onClaudeCodeChange}
							size="small"
							disabled={!testPassed}
						/>
					</div>
					{claudeCodeEnabled && (
					<div className="mt-2">
						<div
							className="text-[11px] mb-1"
							style={{ color: token.colorTextSecondary }}
						>
							{t("claudeCode.agentModel", { ns: "models" })}
						</div>
						<Select
							size="small"
							variant="borderless"
							placeholder={t("claudeCode.modelPlaceholder", { ns: "models" })}
							value={claudeCodeModel}
							onChange={onClaudeCodeModelChange}
							allowClear
							showSearch
							options={models
								.filter((m) => m.enabled)
								.map((m) => ({
									label: m.name || m.id,
									value: m.id,
								}))}
							className="w-full"
						/>
						<div
							className="text-[11px] mt-0.5"
							style={{ color: token.colorTextQuaternary }}
						>
							{t("claudeCode.modelHint", { ns: "models" })}
						</div>
					</div>
				)}
				{claudeCodeEnabled && existingCCProvider && (
						<div
							className="text-[11px] mt-1.5"
							style={{ color: token.colorWarning }}
						>
							{t("claudeCode.willReplace", {
								ns: "models",
								name: existingCCProvider.name,
							})}
						</div>
					)}
				</div>
			) : (
				<div
					className="text-center py-3 text-[11px] rounded-lg"
					style={{
						color: token.colorTextQuaternary,
						backgroundColor: token.colorFillQuaternary,
					}}
				>
					{t("claudeCode.incompatible", { ns: "models" })}
				</div>
			)}
		</>
	);
}
