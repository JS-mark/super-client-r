import { DeleteOutlined, EditOutlined, PlusOutlined, ApiOutlined } from "@ant-design/icons";
import { Button, Drawer, Form, Input, List, Select, Space, Switch, Tag, Empty } from "antd";
import type * as React from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useModelStore } from "../../stores/modelStore";
import type { ModelInfo } from "../../types/models";
import { cn } from "../../lib/utils";

export const ModelList: React.FC = () => {
	const { t } = useTranslation();
	const { models, addModel, updateModel, removeModel } = useModelStore();
	const [isDrawerOpen, setIsDrawerOpen] = useState(false);
	const [editingModel, setEditingModel] = useState<ModelInfo | null>(null);
	const [form] = Form.useForm();

	const handleAdd = () => {
		setEditingModel(null);
		form.resetFields();
		setIsDrawerOpen(true);
	};

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

	const getProviderIcon = (provider: string) => {
		return <ApiOutlined className="text-lg" />;
	};

	return (
		<div className="animate-fade-in">
			{/* Header */}
			<div className="mb-6 flex justify-between items-center">
				<div>
					<h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
						{t("models.listTitle")}
					</h2>
					<p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
						{t("models.listDescription", "Manage your AI model configurations")}
					</p>
				</div>
				<Button
					type="primary"
					icon={<PlusOutlined />}
					onClick={handleAdd}
					className="!h-10 !rounded-lg !font-medium"
				>
					{t("models.add")}
				</Button>
			</div>

			{/* Model List */}
			{models.length === 0 ? (
				<Empty
					image={Empty.PRESENTED_IMAGE_SIMPLE}
					description={
						<span className="text-gray-500 dark:text-gray-400">
							{t("models.empty", "No models configured yet")}
						</span>
					}
				>
					<Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
						{t("models.addFirst", "Add your first model")}
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
										{getProviderIcon(item.provider)}
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
												{t("models.disabled", "Disabled")}
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
						<div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
							<ApiOutlined className="text-white text-sm" />
						</div>
						<span className="font-semibold">
							{editingModel ? t("models.edit") : t("models.add")}
						</span>
					</div>
				}
				width={420}
				styles={{
					body: { paddingBottom: 80 },
					header: { borderBottom: "1px solid #f0f0f0" },
				}}
				onClose={() => setIsDrawerOpen(false)}
				open={isDrawerOpen}
				extra={
					<Space>
						<Button onClick={() => setIsDrawerOpen(false)}>
							{t("models.cancel")}
						</Button>
						<Button type="primary" onClick={() => form.submit()}>
							{t("models.save")}
						</Button>
					</Space>
				}
			>
				<Form form={form} layout="vertical" onFinish={handleSave}>
					<Form.Item
						name="name"
						label={t("models.form.name")}
						rules={[{ required: true, message: t("models.form.nameRequired") }]}
					>
						<Input
							placeholder={t("models.form.namePlaceholder", "e.g., GPT-4")}
							className="!rounded-lg"
						/>
					</Form.Item>
					<Form.Item
						name="provider"
						label={t("models.form.provider")}
						rules={[{ required: true, message: t("models.form.providerRequired") }]}
					>
						<Select
							placeholder={t("models.form.providerPlaceholder", "Select provider")}
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
						label={t("models.form.apiKey")}
						help={t("models.form.apiKeyHelp", "Your API key for authentication")}
					>
						<Input.Password
							placeholder={t("models.form.apiKeyPlaceholder", "sk-...")}
							className="!rounded-lg"
						/>
					</Form.Item>
					<Form.Item
						name="baseUrl"
						label={t("models.form.baseUrl")}
						help={t("models.form.baseUrlHelp", "Custom API endpoint URL")}
					>
						<Input
							placeholder={t("models.form.baseUrlPlaceholder", "https://api.example.com")}
							className="!rounded-lg"
						/>
					</Form.Item>
				</Form>
			</Drawer>
		</div>
	);
};