import {
	ApiOutlined,
	DeleteOutlined,
	LinkOutlined,
	PlusOutlined,
} from "@ant-design/icons";
import { Badge, Button, Empty, Form, Input, List, Modal, Tag } from "antd";
import type * as React from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMcpStore } from "../../stores/mcpStore";
import type { McpServer } from "../../types/mcp";

interface McpConfigProps {
	addTrigger?: number;
}

export const McpConfig: React.FC<McpConfigProps> = ({ addTrigger }) => {
	const { t } = useTranslation();
	const servers = useMcpStore((state) => state.servers);
	const addServer = useMcpStore((state) => state.addServer);
	const removeServer = useMcpStore((state) => state.removeServer);
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [form] = Form.useForm();

	// Listen for addTrigger changes to open modal
	useEffect(() => {
		if (addTrigger && addTrigger > 0) {
			setIsModalOpen(true);
		}
	}, [addTrigger]);

	const handleAdd = (values: any) => {
		const newServer: McpServer = {
			id: Date.now().toString(),
			name: values.name,
			type: "third-party",
			transport: "http",
			url: values.url,
			status: "disconnected",
			enabled: true,
		};
		addServer(newServer);
		setIsModalOpen(false);
		form.resetFields();
	};

	const getStatusBadge = (status: string) => {
		switch (status) {
			case "connected":
				return (
					<Badge
						status="success"
						text={t("status.connected", "Connected", { ns: "mcp" })}
					/>
				);
			case "connecting":
				return (
					<Badge
						status="processing"
						text={t("status.connecting", "Connecting", { ns: "mcp" })}
					/>
				);
			case "error":
				return <Badge status="error" text={t("status.error", "Error", { ns: "mcp" })} />;
			default:
				return (
					<Badge
						status="default"
						text={t("status.disconnected", "Disconnected", { ns: "mcp" })}
					/>
				);
		}
	};

	return (
		<div className="animate-fade-in">
			{/* Server List */}
			{servers.length === 0 ? (
				<Empty
					image={Empty.PRESENTED_IMAGE_SIMPLE}
					description={
						<span className="text-gray-500 dark:text-gray-400">
							{t("empty", "No MCP servers configured yet", { ns: "mcp" })}
						</span>
					}
				>
					<Button
						type="primary"
						icon={<PlusOutlined />}
						onClick={() => setIsModalOpen(true)}
						className="!h-10 !rounded-lg !font-medium"
					>
						{t("add", { ns: "mcp" })}
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
										<span className="text-sm truncate max-w-md">
											{item.url}
										</span>
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
						<span className="font-semibold">{t("addModalTitle", { ns: "mcp" })}</span>
					</div>
				}
				open={isModalOpen}
				onCancel={() => setIsModalOpen(false)}
				onOk={() => form.submit()}
				okText={t("add", "Add", { ns: "mcp" })}
				cancelText={t("cancel", "Cancel", { ns: "mcp" })}
				width={480}
				destroyOnHidden={true}
				maskClosable={true}
			>
				<Form form={form} layout="vertical" onFinish={handleAdd}>
					<Form.Item
						name="name"
						label={t("form.name", { ns: "mcp" })}
						rules={[{ required: true, message: t("form.nameRequired", { ns: "mcp" }) }]}
					>
						<Input
							placeholder={t(
								"mcp.form.namePlaceholder",
								"e.g., Filesystem Server",
							)}
							className="!rounded-lg"
						/>
					</Form.Item>
					<Form.Item
						name="url"
						label={t("form.url", { ns: "mcp" })}
						rules={[
							{ required: true, message: t("form.urlRequired", { ns: "mcp" }) },
							{ type: "url", message: t("form.urlInvalid", { ns: "mcp" }) },
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
