import {
	ApiOutlined,
	DeleteOutlined,
	EditOutlined,
	PlusOutlined,
} from "@ant-design/icons";
import {
	Button,
	Drawer,
	Empty,
	Form,
	Input,
	List,
	Select,
	Space,
	Switch,
	Tag,
} from "antd";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/utils";
import { useModelStore } from "../../stores/modelStore";
import type { ModelInfo } from "../../types/models";

interface ModelListProps {
	addTrigger?: number;
}

export const ModelList: React.FC<ModelListProps> = ({ addTrigger }) => {
	const { t } = useTranslation();
	const models = useModelStore((state) => state.models);
	const addModel = useModelStore((state) => state.addModel);
	const updateModel = useModelStore((state) => state.updateModel);
	const removeModel = useModelStore((state) => state.removeModel);
	const [isDrawerOpen, setIsDrawerOpen] = useState(false);
	const [editingModel, setEditingModel] = useState<ModelInfo | null>(null);
	const [form] = Form.useForm();

	const handleAdd = () => {
		setEditingModel(null);
		form.resetFields();
		setIsDrawerOpen(true);
	};

	// Listen for addTrigger changes to open drawer
	useEffect(() => {
		if (addTrigger && addTrigger > 0) {
			handleAdd();
		}
	});

	const handleEdit = (model: ModelInfo) => {
		setEditingModel(model);
		form.setFieldsValue({
			...model,
			apiKey: model.config.apiKey,
			baseUrl: model.config.baseUrl,
		});
		setIsDrawerOpen(true);
	};

	const handleSave = (values: any) => {
		const modelData: ModelInfo = {
			id: editingModel ? editingModel.id : Date.now().toString(),
			name: values.name,
			provider: values.provider,
			capabilities: [],
			enabled: true,
			config: {
				apiKey: values.apiKey,
				baseUrl: values.baseUrl,
			},
		};

		if (editingModel) {
			updateModel(editingModel.id, modelData);
		} else {
			addModel(modelData);
		}
		setIsDrawerOpen(false);
	};

	const getProviderColor = (provider: string) => {
		switch (provider) {
			case "openai":
				return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
			case "anthropic":
				return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400";
			case "gemini":
				return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
			default:
				return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400";
		}
	};

	const getProviderIcon = () => {
		return <ApiOutlined className="text-lg" />;
	};

	return (
		<div className="animate-fade-in">
			{/* Model List */}
			{models.length === 0 ? (
				<Empty
					image={Empty.PRESENTED_IMAGE_SIMPLE}
					description={
						<span className="text-gray-500 dark:text-gray-400">
							{t("empty", "No models configured yet")}
						</span>
					}
				>
					<Button
						type="primary"
						icon={<PlusOutlined />}
						onClick={handleAdd}
						className="!h-10 !rounded-lg !font-medium"
					>
						{t("add", { ns: "models" })}
					</Button>
				</Empty>
			) : (
				<List
					className="!bg-white dark:!bg-gray-800 !rounded-xl !shadow-sm"
					dataSource={models}
					renderItem={(item) => (
						<List.Item
							key={item.id}
							className="!px-6 !py-4 !border-b last:!border-b-0 hover:!bg-gray-50 dark:hover:!bg-gray-700/50 transition-colors"
							actions={[
								<Switch
									key="switch"
									checked={item.enabled}
									onChange={(checked) =>
										updateModel(item.id, { enabled: checked })
									}
									className="!ml-2"
								/>,
								<Button
									key="edit"
									type="text"
									icon={<EditOutlined />}
									onClick={() => handleEdit(item)}
									className="!text-gray-500 hover:!text-blue-500"
								/>,
								<Button
									key="delete"
									type="text"
									danger
									icon={<DeleteOutlined />}
									onClick={() => removeModel(item.id)}
									className="!text-gray-500 hover:!text-red-500"
								/>,
							]}
						>
							<List.Item.Meta
								avatar={
									<div
										className={cn(
											"w-10 h-10 rounded-lg flex items-center justify-center",
											getProviderColor(item.provider),
										)}
									>
										{getProviderIcon()}
									</div>
								}
								title={
									<div className="flex items-center gap-2">
										<span className="font-medium text-gray-900 dark:text-gray-100">
											{item.name}
										</span>
										<Tag
											className={cn(
												"!text-xs !font-medium",
												getProviderColor(item.provider),
											)}
										>
											{item.provider}
										</Tag>
										{!item.enabled && (
											<Tag color="default" className="!text-xs">
												{t("disabled", "Disabled", { ns: "models" })}
											</Tag>
										)}
									</div>
								}
								description={
									<span className="text-gray-500 dark:text-gray-400">
										{item.config.baseUrl || "Default endpoint"}
									</span>
								}
							/>
						</List.Item>
					)}
				/>
			)}

			{/* Drawer */}
			<Drawer
				title={
					<div className="flex items-center gap-2">
						<span className="font-semibold">
							{editingModel ? t("edit", { ns: "models" }) : t("add", { ns: "models" })}
						</span>
					</div>
				}
				size={420}
				styles={{
					body: { paddingBottom: 80 },
					// @ts-expect-error
					header: { borderBottom: "1px solid #f0f0f0", WebkitAppRegion: "no-drag" },
				}}
				onClose={() => setIsDrawerOpen(false)}
				open={isDrawerOpen}
				destroyOnHidden={true}
				maskClosable={true}
				extra={
					<Space>
						<Button onClick={() => setIsDrawerOpen(false)}>
							{t("cancel", { ns: "models" })}
						</Button>
						<Button type="primary" onClick={() => form.submit()}>
							{t("save", { ns: "models" })}
						</Button>
					</Space>
				}
			>
				<Form form={form} layout="vertical" onFinish={handleSave}>
					<Form.Item
						name="name"
						label={t("form.name", { ns: "models" })}
						rules={[{ required: true, message: t("form.nameRequired", { ns: "models" }) }]}
					>
						<Input
							placeholder={t("form.namePlaceholder", "e.g., GPT-4", { ns: "models" })}
							className="!rounded-lg"
						/>
					</Form.Item>
					<Form.Item
						name="provider"
						label={t("form.provider", { ns: "models" })}
						rules={[
							{ required: true, message: t("form.providerRequired", { ns: "models" }) },
						]}
					>
						<Select
							placeholder={t(
								"models.form.providerPlaceholder",
								"Select provider",
							)}
							className="!rounded-lg"
						>
							<Select.Option value="openai">OpenAI</Select.Option>
							<Select.Option value="anthropic">Anthropic</Select.Option>
							<Select.Option value="gemini">Gemini</Select.Option>
							<Select.Option value="custom">Custom</Select.Option>
						</Select>
					</Form.Item>
					<Form.Item
						name="apiKey"
						label={t("form.apiKey", { ns: "models" })}
						help={t(
							"models.form.apiKeyHelp",
							"Your API key for authentication",
						)}
					>
						<Input.Password
							placeholder={t("form.apiKeyPlaceholder", "sk-...", { ns: "models" })}
							className="!rounded-lg"
						/>
					</Form.Item>
					<Form.Item
						name="baseUrl"
						label={t("form.baseUrl", { ns: "models" })}
						help={t("form.baseUrlHelp", "Custom API endpoint URL", { ns: "models" })}
					>
						<Input
							placeholder={t(
								"models.form.baseUrlPlaceholder",
								"https://api.example.com",
							)}
							className="!rounded-lg"
						/>
					</Form.Item>
				</Form>
			</Drawer>
		</div>
	);
};
