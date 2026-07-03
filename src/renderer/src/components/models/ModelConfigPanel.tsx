import {
	Button,
	Col,
	Divider,
	Drawer,
	Form,
	Input,
	InputNumber,
	Row,
	Select,
	Typography,
} from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useModelStore } from "../../stores/modelStore";
import type {
	ModelPricing,
	PricingCurrency,
	ProviderModel,
} from "../../types/models";
import { ModelCapabilityEditor } from "./ModelCapabilityEditor";

const { Text } = Typography;

const CURRENCY_OPTIONS: { label: string; value: PricingCurrency }[] = [
	{ label: "USD", value: "USD" },
	{ label: "CNY", value: "CNY" },
	{ label: "EUR", value: "EUR" },
];

interface ModelConfigPanelProps {
	open: boolean;
	onClose: () => void;
	model: ProviderModel | null;
	existingGroups: string[];
	onSave: (modelId: string, config: Partial<ProviderModel>) => void;
	/**
	 * When provided, the embedded {@link ModelCapabilityEditor} live-persists
	 * capability edits via `useModelStore.updateModelConfig(providerId, ...)`.
	 * The parent should keep passing the latest `model` snapshot so the drawer
	 * stays in sync after the persist round-trip.
	 */
	providerId?: string;
}

interface FormValues {
	name: string;
	group?: string;
	pricingCurrency: PricingCurrency;
	inputPricePerMillion: number | null;
	outputPricePerMillion: number | null;
}

export function ModelConfigPanel({
	open,
	onClose,
	model,
	existingGroups,
	onSave,
	providerId,
}: ModelConfigPanelProps) {
	const { t } = useTranslation();
	const [form] = Form.useForm<FormValues>();
	// Local draft that mirrors the current model's capability metadata so the
	// embedded editor stays in sync even before the store round-trip completes.
	const [capabilityDraft, setCapabilityDraft] = useState<ProviderModel | null>(
		model,
	);

	useEffect(() => {
		if (model && open) {
			form.setFieldsValue({
				name: model.name,
				group: model.group,
				pricingCurrency: model.pricing?.currency ?? "USD",
				inputPricePerMillion: model.pricing?.inputPricePerMillion ?? 0,
				outputPricePerMillion: model.pricing?.outputPricePerMillion ?? 0,
			});
			setCapabilityDraft(model);
		}
	}, [model, open, form]);

	const groupOptions = useMemo(
		() => existingGroups.map((g) => ({ label: g, value: g })),
		[existingGroups],
	);

	const handleCapabilityChange = useCallback(
		(patch: Partial<ProviderModel>) => {
			if (!capabilityDraft) return;
			const nextDraft = { ...capabilityDraft, ...patch };
			setCapabilityDraft(nextDraft);
			// Live-persist through the store when we know which provider owns
			// the model. Falls back to the parent-owned save flow otherwise.
			if (providerId) {
				void useModelStore
					.getState()
					.updateModelConfig(providerId, capabilityDraft.id, patch);
			}
		},
		[capabilityDraft, providerId],
	);

	const handleSave = useCallback(
		(values: FormValues) => {
			if (!model || !capabilityDraft) return;

			let pricing: ModelPricing | undefined;
			if (
				values.inputPricePerMillion != null ||
				values.outputPricePerMillion != null
			) {
				pricing = {
					currency: values.pricingCurrency,
					inputPricePerMillion: values.inputPricePerMillion ?? 0,
					outputPricePerMillion: values.outputPricePerMillion ?? 0,
				};
			}

			onSave(model.id, {
				name: values.name,
				group: values.group,
				pricing,
				// Capability fields already live-persisted via the store; include
				// them in the final save payload so callers that don't wire
				// `providerId` still receive the current draft.
				capabilities: capabilityDraft.capabilities,
				category: capabilityDraft.category,
				supportsStreaming: capabilityDraft.supportsStreaming,
				systemPrompt: capabilityDraft.systemPrompt,
				maxTokens: capabilityDraft.maxTokens,
				contextWindow: capabilityDraft.contextWindow,
			});
			onClose();
		},
		[model, capabilityDraft, onSave, onClose],
	);

	return (
		<Drawer
			title={t("modelConfig.title", { ns: "models" })}
			open={open}
			onClose={onClose}
			size={520}
			styles={{ header: { paddingBlock: 7 } }}
			extra={
				<Button type="primary" onClick={() => form.submit()}>
					{t("modelConfig.save", { ns: "models" })}
				</Button>
			}
		>
			{model && capabilityDraft && (
				<Form
					form={form}
					layout="vertical"
					onFinish={handleSave}
					size="middle"
					requiredMark={false}
				>
					{/* Model ID (readonly) */}
					<Form.Item
						label={t("modelConfig.modelId", { ns: "models" })}
						style={{ marginBottom: 16 }}
					>
						<Text code copyable className="text-xs">
							{model.id}
						</Text>
					</Form.Item>

					{/* Name + Group: side by side */}
					<Row gutter={16}>
						<Col span={14}>
							<Form.Item
								name="name"
								label={t("modelConfig.modelName", { ns: "models" })}
								rules={[{ required: true }]}
							>
								<Input />
							</Form.Item>
						</Col>
						<Col span={10}>
							<Form.Item
								name="group"
								label={t("modelConfig.group", { ns: "models" })}
							>
								<Select
									placeholder={t("modelConfig.groupPlaceholder", {
										ns: "models",
									})}
									allowClear
									showSearch
									options={groupOptions}
									filterOption={(input, option) =>
										(option?.label as string)
											?.toLowerCase()
											.includes(input.toLowerCase()) ?? false
									}
								/>
							</Form.Item>
						</Col>
					</Row>

					<Divider style={{ margin: "8px 0 16px" }} />

					{/* Capability metadata (streams live to modelStore.updateModelConfig
					    when `providerId` is set) */}
					<ModelCapabilityEditor
						value={capabilityDraft}
						onChange={handleCapabilityChange}
					/>

					<Divider style={{ margin: "16px 0 12px" }} />

					{/* Pricing */}
					<Form.Item
						label={t("modelConfig.pricing", { ns: "models" })}
						style={{ marginBottom: 8 }}
					>
						<Row gutter={12}>
							<Col span={6}>
								<Form.Item name="pricingCurrency" noStyle>
									<Select options={CURRENCY_OPTIONS} />
								</Form.Item>
							</Col>
							<Col span={9}>
								<Form.Item name="inputPricePerMillion" noStyle>
									<InputNumber
										min={0}
										step={0.01}
										className="w-full!"
										placeholder={t("modelConfig.inputPrice", {
											ns: "models",
										})}
										addonBefore="In"
									/>
								</Form.Item>
							</Col>
							<Col span={9}>
								<Form.Item name="outputPricePerMillion" noStyle>
									<InputNumber
										min={0}
										step={0.01}
										className="w-full!"
										placeholder={t("modelConfig.outputPrice", {
											ns: "models",
										})}
										addonBefore="Out"
									/>
								</Form.Item>
							</Col>
						</Row>
					</Form.Item>
					<div className="text-xs text-gray-400 mb-4">
						{t("modelConfig.inputPrice", { ns: "models" })} /{" "}
						{t("modelConfig.outputPrice", { ns: "models" })}
					</div>
				</Form>
			)}
		</Drawer>
	);
}
