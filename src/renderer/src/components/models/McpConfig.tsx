import { ApiOutlined, DeleteOutlined, PlusOutlined, LinkOutlined } from "@ant-design/icons";
import { Button, Form, Input, List, Modal, Tag, Empty, Badge } from "antd";
import type * as React from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMcpStore } from "../../stores/mcpStore";
import type { McpServer } from "../../types/mcp";
import { cn } from "../../lib/utils";

export const McpConfig: React.FC = () => {
	const { t } = useTranslation();
	const { servers, addServer, removeServer } = useMcpStore();
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [form] = Form.useForm();

	const handleAdd = (values: any) => {
		const newServer: McpServer = {
			id: Date.now().toString(),
			name: values.name,
			url: values.url,
			status: "disconnected",
			capabilities: [],
		};
		addServer(newServer);
		setIsModalOpen(false);
		form.resetFields();
	};

	const getStatusBadge = (status: string) => {
		switch (status) {
			case "connected":
				return <Badge status="success" text={t("mcp.status.connected", "Connected")} />;
			case "connecting":
				return <Badge status="processing" text={t("mcp.status.connecting", "Connecting")} />;
			case "error":
				return <Badge status="error" text={t("mcp.status.error", "Error")} />;
			default:
				return <Badge status="default" text={t("mcp.status.disconnected", "Disconnected")} />;
		}
	};

	return (
		<div className="animate-fade-in">
			{/* Header */}
			<div className="mb-6 flex justify-between items-center">
				<div>
					<h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
						{t("mcp.title")}
					</h2>
					<p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
						{t("mcp.description", "Manage Model Context Protocol servers")}
					</p>
				</div>
				<Button
					type="primary"
					icon={<PlusOutlined />}
					onClick={() => setIsModalOpen(true)}
					className="!h-10 !rounded-lg !font-medium"
				>
					{t("mcp.add")}
				</Button>
			</div>

			{/* Server List */}
			{servers.length === 0 ? (
				<Empty
					image={Empty.PRESENTED_IMAGE_SIMPLE}
					description={
						<span className="text-gray-500 dark:text-gray-400">
							{t("mcp.empty", "No MCP servers configured yet")}
						</span>
					}
				>
					<Button type="primary" icon={<PlusOutlined />} onClick={() => setIsModalOpen(true)}>
						{t("mcp.addFirst", "Add your first server")}
					</Button>
				</Empty>
			) : (
				<List
					className="!bg-white dark:!bg-gray-800 !rounded-xl !shadow-sm"
					dataSource={servers}
					renderItem={(item) => (
						<List.Item
							key={item.id}
							className="!px-6 !py-4 !border-b last:!border-b-0 hover:!bg-gray-50 dark:hover:!bg-gray-700/50 transition-colors"
							actions={[
								<Button
									key="delete"
									type="text"
									danger
									icon={<DeleteOutlined />}
									onClick={() => removeServer(item.id)}
									className="!text-gray-500 hover:!text-red-500"
								/>,
							]}
						>
							<List.Item.Meta
								avatar={
									<div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
										<ApiOutlined className="text-white text-lg" />
									</div>
								}
								title={
									<div className="flex items-center gap-2">
										<span className="font-medium text-gray-900 dark:text-gray-100">
											{item.name}
										</span>
										{getStatusBadge(item.status)}
									</div>
								}
								description={
									<div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
										<LinkOutlined className="text-xs" />
										<span className="text-sm truncate max-w-md">{item.url}</span>
									</div>
								}
							/>
						</List.Item>
					)}
				/>
			)}

			{/* Add Modal */}
			<Modal
				title={
					<div className="flex items-center gap-2">
						<div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
							<ApiOutlined className="text-white text-sm" />
						</div>
						<span className="font-semibold">{t("mcp.addModalTitle")}</span>
					</div>
				}
				open={isModalOpen}
				onCancel={() => setIsModalOpen(false)}
				onOk={() => form.submit()}
				okText={t("mcp.add", "Add")}
				cancelText={t("mcp.cancel", "Cancel")}
				width={480}
			>
				<Form form={form} layout="vertical" onFinish={handleAdd}>
					<Form.Item
						name="name"
						label={t("mcp.form.name")}
						rules={[{ required: true, message: t("mcp.form.nameRequired") }]}
					>
						<Input
							placeholder={t("mcp.form.namePlaceholder", "e.g., Filesystem Server")}
							className="!rounded-lg"
						/>
					</Form.Item>
					<Form.Item
						name="url"
						label={t("mcp.form.url")}
						rules={[
							{ required: true, message: t("mcp.form.urlRequired") },
							{ type: "url", message: t("mcp.form.urlInvalid") },
						]}
					>
						<Input
							placeholder={
								import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/mcp"
							}
							className="!rounded-lg"
							prefix={<LinkOutlined className="text-gray-400" />}
						/>
					</Form.Item>
				</Form>
			</Modal>
		</div>
	);
};