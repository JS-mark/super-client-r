import { Form, Input, InputNumber, Select, Switch, theme } from "antd";
import { useCallback, useEffect, useState } from "react";
import { pluginService } from "../../services/pluginService";

const { useToken } = theme;

interface ConfigProperty {
	type: string;
	default?: unknown;
	description: string;
	enum?: string[];
	enumDescriptions?: string[];
}

interface PluginConfigPanelProps {
	pluginId: string;
	title: string;
	properties: Record<string, ConfigProperty>;
}

export function PluginConfigPanel({
	pluginId,
	title,
	properties,
}: PluginConfigPanelProps) {
	const { token } = useToken();
	const [values, setValues] = useState<Record<string, unknown>>({});
	const [loading, setLoading] = useState(true);

	// Load current values
	useEffect(() => {
		const loadValues = async () => {
			setLoading(true);
			const loaded: Record<string, unknown> = {};
			for (const [key, prop] of Object.entries(properties)) {
				try {
					const val = await pluginService.getStorage(
						pluginId,
						`config.${key}`,
					);
					loaded[key] = val ?? prop.default;
				} catch {
					loaded[key] = prop.default;
				}
			}
			setValues(loaded);
			setLoading(false);
		};
		loadValues();
	}, [pluginId, properties]);

	const handleChange = useCallback(
		async (key: string, value: unknown) => {
			setValues((prev) => ({ ...prev, [key]: value }));
			try {
				await pluginService.setStorage(pluginId, `config.${key}`, value);
			} catch (error) {
				console.error("Failed to save plugin config:", error);
			}
		},
		[pluginId],
	);

	const renderField = useCallback(
		(key: string, prop: ConfigProperty) => {
			const value = values[key];

			if (prop.type === "boolean") {
				return (
					<Switch
						checked={!!value}
						onChange={(checked) => handleChange(key, checked)}
					/>
				);
			}

			if (prop.type === "number") {
				return (
					<InputNumber
						value={value as number}
						onChange={(val) => handleChange(key, val)}
						style={{ width: "100%" }}
					/>
				);
			}

			if (prop.type === "string" && prop.enum) {
				return (
					<Select
						value={value as string}
						onChange={(val) => handleChange(key, val)}
						style={{ width: "100%" }}
						options={prop.enum.map((opt, idx) => ({
							value: opt,
							label: prop.enumDescriptions?.[idx] || opt,
						}))}
					/>
				);
			}

			return (
				<Input
					value={String(value ?? "")}
					onChange={(e) => handleChange(key, e.target.value)}
				/>
			);
		},
		[values, handleChange],
	);

	if (loading) return null;

	return (
		<div>
			<h3
				className="text-base font-medium mb-4"
				style={{ color: token.colorText }}
			>
				{title}
			</h3>
			<Form layout="vertical">
				{Object.entries(properties).map(([key, prop]) => (
					<Form.Item
						key={key}
						label={key}
						help={prop.description}
						style={{ marginBottom: 16 }}
					>
						{renderField(key, prop)}
					</Form.Item>
				))}
			</Form>
		</div>
	);
}
