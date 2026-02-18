import { ThunderboltOutlined } from "@ant-design/icons";
import { App, Empty, Select, Typography, theme } from "antd";
import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useModelStore } from "../../stores/modelStore";
import { ProviderIcon } from "../models/ProviderIcon";

const { Text } = Typography;
const { useToken } = theme;

export const DefaultModelSettings: React.FC = () => {
	const { t } = useTranslation();
	const { message } = App.useApp();
	const { token } = useToken();
	const activeSelection = useModelStore((s) => s.activeSelection);
	const setActiveModel = useModelStore((s) => s.setActiveModel);
	const loadActiveModel = useModelStore((s) => s.loadActiveModel);
	const loadProviders = useModelStore((s) => s.loadProviders);
	const getAllEnabledModels = useModelStore((s) => s.getAllEnabledModels);
	const getActiveProviderModel = useModelStore(
		(s) => s.getActiveProviderModel,
	);

	useEffect(() => {
		loadProviders();
		loadActiveModel();
	}, [loadProviders, loadActiveModel]);

	const handleChange = useCallback(
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
	const activeProviderModel = getActiveProviderModel();

	if (enabledModels.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center py-16">
				<Empty
					image={Empty.PRESENTED_IMAGE_SIMPLE}
					description={
						<span style={{ color: token.colorTextSecondary }}>
							{t("noEnabledModels", { ns: "models" })}
						</span>
					}
				/>
			</div>
		);
	}

	// Group models by provider
	const groupedOptions = enabledModels.reduce<
		Record<string, { providerName: string; preset: string; models: { label: string; value: string }[] }>
	>((acc, { provider, model }) => {
		if (!acc[provider.id]) {
			acc[provider.id] = {
				providerName: provider.name,
				preset: provider.preset,
				models: [],
			};
		}
		acc[provider.id].models.push({
			label: model.name,
			value: `${provider.id}||${model.id}`,
		});
		return acc;
	}, {});

	const selectOptions = Object.entries(groupedOptions).map(
		([, group]) => ({
			label: group.providerName,
			options: group.models,
		}),
	);

	return (
		<div className="animate-fade-in">
			{/* Current active model display */}
			{activeProviderModel && (
				<div
					className="mb-6 rounded-xl border p-5"
					style={{ borderColor: token.colorPrimaryBorder, background: token.colorPrimaryBg }}
				>
					<div className="flex items-center gap-2 mb-3">
						<ThunderboltOutlined className="text-amber-500" />
						<Text strong className="text-sm">
							{t("activeModel", { ns: "models" })}
						</Text>
					</div>
					<div className="flex items-center gap-3">
						<ProviderIcon
							preset={activeProviderModel.provider.preset}
							size={40}
						/>
						<div>
							<div className="font-medium" style={{ color: token.colorText }}>
								{activeProviderModel.model.name}
							</div>
							<div className="text-xs" style={{ color: token.colorTextSecondary }}>
								{activeProviderModel.provider.name}
							</div>
						</div>
					</div>
				</div>
			)}

			{/* Model selector */}
			<div className="mb-2">
				<Text strong className="text-sm">
					{t("selectActiveModel", { ns: "models" })}
				</Text>
			</div>
			<Select
				className="w-full"
				size="large"
				placeholder={t("selectActiveModel", { ns: "models" })}
				value={activeValue}
				onChange={handleChange}
				allowClear
				showSearch
				optionFilterProp="label"
				options={selectOptions}
			/>
		</div>
	);
};
