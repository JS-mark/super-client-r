import {
	Button,
	Checkbox,
	Col,
	Divider,
	Drawer,
	Form,
	Input,
	InputNumber,
	Row,
	Select,
	Switch,
	Typography,
} from "antd";
import { useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type {
	ModelCapability,
	ModelPricing,
	PricingCurrency,
	ProviderModel,
} from "../../types/models";
import { SystemPromptEditor } from "./SystemPromptEditor";

const { Text } = Typography;

const ALL_CAPABILITIES: ModelCapability[] = [
	"vision",
	"web_search",
	"reasoning",
	"tool_use",
	"embedding",
	"reranking",
];

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
}

interface FormValues {
	name: string;
	group?: string;
	capabilities: ModelCapability[];
	supportsStreaming: boolean;
	pricingCurrency: PricingCurrency;
	inputPricePerMillion: number | null;
	outputPricePerMillion: number | null;
	systemPrompt: string;
	maxTokens: number | null;
	contextWindow: number | null;
}

const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_CONTEXT_WINDOW = 128000;

export function ModelConfigPanel({
	open,
	onClose,
	model,
	existingGroups,
	onSave,
}: ModelConfigPanelProps) {
	const { t } = useTranslation();
	const [form] = Form.useForm<FormValues>();

	useEffect(() => {
		if (model && open) {
			form.setFieldsValue({
				name: model.name,
				group: model.group,
				capabilities: model.capabilities,
				supportsStreaming: model.supportsStreaming ?? true,
				pricingCurrency: model.pricing?.currency ?? "USD",
				inputPricePerMillion: model.pricing?.inputPricePerMillion ?? 0,
				outputPricePerMillion: model.pricing?.outputPricePerMillion ?? 0,
				systemPrompt: model.systemPrompt ?? "",
				maxTokens: model.maxTokens ?? DEFAULT_MAX_TOKENS,
				contextWindow: model.contextWindow ?? DEFAULT_CONTEXT_WINDOW,
			});
		}
	}, [model, open, form]);

	const groupOptions = useMemo(
		() => existingGroups.map((g) => ({ label: g, value: g })),
		[existingGroups],
	);

	const handleSave = useCallback(
		(values: FormValues) => {
			if (!model) return;

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
				capabilities: values.capabilities,
				supportsStreaming: values.supportsStreaming,
				pricing,
				systemPrompt: values.systemPrompt || undefined,
				maxTokens: values.maxTokens ?? undefined,
				contextWindow: values.contextWindow ?? undefined,
			});
			onClose();
		},
		[model, onSave, onClose],
	);

	return (
		<Drawer
			title={t("modelConfig.title", { ns: "models" })}
			open={open}
			onClose={onClose}
			width={520}
			extra={
				<Button type="primary" onClick={() => form.submit()}>
					{t("modelConfig.save", { ns: "models" })}
				</Button>
			}
		>
			{model && (
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

					{/* Capabilities */}
					<Form.Item
						name="capabilities"
						label={t("modelConfig.capabilities", { ns: "models" })}
					>
						<Checkbox.Group>
							<div className="flex flex-wrap gap-x-4 gap-y-1">
								{ALL_CAPABILITIES.map((cap) => (
									<Checkbox key={cap} value={cap}>
										{t(`capabilities.${cap}`, { ns: "models" })}
									</Checkbox>
								))}
							</div>
						</Checkbox.Group>
					</Form.Item>

					<Divider style={{ margin: "8px 0 16px" }} />

					{/* Parameters: Streaming + MaxTokens + ContextWindow */}
					<Row gutter={16} align="middle">
						<Col span={8}>
							<Form.Item
								name="supportsStreaming"
								label={t("modelConfig.streaming", { ns: "models" })}
								valuePropName="checked"
							>
								<Switch />
							</Form.Item>
						</Col>
						<Col span={8}>
							<Form.Item
								name="maxTokens"
								label={t("modelConfig.maxTokens", { ns: "models" })}
							>
								<InputNumber min={1} className="!w-full" />
							</Form.Item>
						</Col>
						<Col span={8}>
							<Form.Item
								name="contextWindow"
								label={t("modelConfig.contextWindow", { ns: "models" })}
							>
								<InputNumber min={1} className="!w-full" />
							</Form.Item>
						</Col>
					</Row>

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
										className="!w-full"
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
										className="!w-full"
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

					{/* System Prompt */}
					<Form.Item
						name="systemPrompt"
						label={t("modelConfig.systemPrompt", { ns: "models" })}
					>
						<SystemPromptEditor />
					</Form.Item>
				</Form>
			)}
		</Drawer>
	);
}
