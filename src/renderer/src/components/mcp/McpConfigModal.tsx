import { SettingOutlined } from "@ant-design/icons";
import { Form, Input, Modal, Switch } from "antd";
import type * as React from "react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { McpServer, BuiltinMcpDefinition } from "../../types/mcp";

interface McpConfigModalProps {
	open: boolean;
	server: McpServer | null;
	configSchema?: Record<string, unknown>;
	builtinDefinition?: BuiltinMcpDefinition;
	onSave: (serverId: string, config: Record<string, unknown>) => void;
	onCancel: () => void;
}

export const McpConfigModal: React.FC<McpConfigModalProps> = ({
	open,
	server,
	configSchema,
	builtinDefinition,
	onSave,
	onCancel,
}) => {
	const { t } = useTranslation();
	const [form] = Form.useForm();
	const [homedir, setHomedir] = useState<string>("");

	const hasSchema =
		!!configSchema &&
		Object.keys((configSchema as any)?.properties || {}).length > 0;

	// 获取用户主目录用于路径字段默认值
	useEffect(() => {
		window.electron.system
			.getHomedir()
			.then((res) => {
				if (res.success && res.data) {
					setHomedir(res.data);
				}
			})
			.catch(() => {});
	}, []);

	// 从 server 的 env/args 提取当前配置值
	useEffect(() => {
		if (!open || !server) {
			form.resetFields();
			return;
		}

		if (hasSchema) {
			// Schema-based form: extract values from server config
			const properties = (configSchema as any)?.properties || {};
			const initialValues: Record<string, unknown> = {};

			for (const [key, schema] of Object.entries(properties)) {
				const prop = schema as { type: string; description?: string };

				if (prop.type === "boolean") {
					if (key === "headless") {
						initialValues[key] = server.args?.includes("--headless") !== false;
					}
				} else if (prop.type === "array") {
					if (key === "allowedPaths" && builtinDefinition) {
						const baseArgsLen = builtinDefinition.args.length;
						const extraArgs = server.args?.slice(baseArgsLen) || [];
						// 预填用户主目录（如果没有已配置的路径）
						initialValues[key] =
							extraArgs.length > 0 ? extraArgs.join("\n") : homedir;
					}
				} else if (prop.type === "string") {
					if (server.env?.[key]) {
						initialValues[key] = server.env[key];
					} else if (key === "dbPath" && builtinDefinition) {
						const baseArgsLen = builtinDefinition.args.length;
						initialValues[key] = server.args?.[baseArgsLen] || "";
					}
				}
			}

			form.setFieldsValue(initialValues);
		} else {
			// Generic form: show raw command/args/env/url
			const initialValues: Record<string, unknown> = {};

			if (server.transport === "stdio") {
				initialValues._command = server.command || "";
				initialValues._args = server.args?.join(" ") || "";
				initialValues._env = server.env
					? Object.entries(server.env)
							.map(([k, v]) => `${k}=${v}`)
							.join("\n")
					: "";
			} else {
				initialValues._url = server.url || "";
			}

			form.setFieldsValue(initialValues);
		}
	}, [open, server, configSchema, builtinDefinition, form, hasSchema, homedir]);

	const handleSave = useCallback(() => {
		form.validateFields().then((values) => {
			if (server) {
				if (hasSchema) {
					// Schema mode: pass config values to parent
					onSave(server.id, values);
				} else {
					// Generic mode: pass raw fields with __generic flag
					onSave(server.id, { ...values, __generic: true });
				}
			}
		});
	}, [form, server, onSave, hasSchema]);

	if (!server) return null;

	const properties = hasSchema ? (configSchema as any)?.properties || {} : {};
	const required: string[] = hasSchema
		? (configSchema as any)?.required || []
		: [];

	return (
		<Modal
			title={
				<div className="flex items-center gap-2">
					<div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
						<SettingOutlined className="text-white text-sm" />
					</div>
					<span className="font-semibold">
						{t("config.title", { ns: "mcp" })} - {server.name}
					</span>
				</div>
			}
			open={open}
			onCancel={onCancel}
			onOk={handleSave}
			okText={t("config.saveAndReconnect", { ns: "mcp" })}
			cancelText={t("cancel", { ns: "mcp" })}
			width={520}
			destroyOnHidden={true}
		>
			<Form form={form} layout="vertical" className="mt-4">
				{hasSchema ? (
					// Schema-based fields
					Object.entries(properties).map(([key, schema]) => {
						const prop = schema as {
							type: string;
							description?: string;
							items?: { type: string };
						};
						const isRequired = required.includes(key);

						if (prop.type === "boolean") {
							return (
								<Form.Item
									key={key}
									name={key}
									label={key}
									valuePropName="checked"
									extra={prop.description}
								>
									<Switch />
								</Form.Item>
							);
						}

						if (prop.type === "array" && prop.items?.type === "string") {
							return (
								<Form.Item
									key={key}
									name={key}
									label={key}
									extra={
										prop.description
											? `${prop.description} (${t("config.onePerLine", { ns: "mcp" })})`
											: t("config.onePerLine", { ns: "mcp" })
									}
									rules={
										isRequired
											? [{ required: true, message: `${key} is required` }]
											: undefined
									}
								>
									<Input.TextArea
										rows={3}
										placeholder={`/path/one\n/path/two`}
									/>
								</Form.Item>
							);
						}

						// default: string
						return (
							<Form.Item
								key={key}
								name={key}
								label={key}
								extra={prop.description}
								rules={
									isRequired
										? [{ required: true, message: `${key} is required` }]
										: undefined
								}
							>
								<Input
									placeholder={prop.description || key}
									type={
										key.toLowerCase().includes("token") ||
										key.toLowerCase().includes("key")
											? "password"
											: "text"
									}
								/>
							</Form.Item>
						);
					})
				) : // Generic fields for servers without configSchema
				server.transport === "stdio" ? (
					<>
						<Form.Item
							name="_command"
							label={t("form.command", { ns: "mcp" })}
							rules={[
								{
									required: true,
									message: t("form.commandRequired", { ns: "mcp" }),
								},
							]}
						>
							<Input placeholder="npx" />
						</Form.Item>
						<Form.Item
							name="_args"
							label={t("form.args", { ns: "mcp" })}
							extra={t("config.argsHint", {
								ns: "mcp",
								defaultValue: "Space-separated arguments",
							})}
						>
							<Input placeholder="-y @modelcontextprotocol/server-filesystem /path/to/dir" />
						</Form.Item>
						<Form.Item
							name="_env"
							label={t("config.envVars", {
								ns: "mcp",
								defaultValue: "Environment Variables",
							})}
							extra={t("config.envHint", {
								ns: "mcp",
								defaultValue: "One per line, KEY=VALUE format",
							})}
						>
							<Input.TextArea
								rows={3}
								placeholder={"API_KEY=your-key\nOTHER_VAR=value"}
							/>
						</Form.Item>
					</>
				) : (
					<Form.Item
						name="_url"
						label={t("form.url", { ns: "mcp" })}
						rules={[
							{ required: true, message: t("form.urlRequired", { ns: "mcp" }) },
						]}
					>
						<Input placeholder="http://localhost:3000/mcp" />
					</Form.Item>
				)}
			</Form>
		</Modal>
	);
};
