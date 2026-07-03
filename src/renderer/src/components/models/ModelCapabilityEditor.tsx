/**
 * ModelCapabilityEditor —— 单个模型能力元数据的编辑器。
 *
 * 与 {@link ./ModelConfigPanel.tsx} 的 Drawer/Form 表单不同，本组件是纯
 * 受控组件：接收当前 model 的完整对象，把用户编辑作为「patch」传给
 * 上层。合并/持久化由外层（`useModelStore.updateModelConfig`）负责。
 *
 * R7 中要求的模型能力元数据字段：
 *   - `contextWindow` (context length)
 *   - `maxTokens` (max output tokens)
 *   - `supportsStreaming`
 *   - `capabilities` (vision / web_search / reasoning / tool_use / embedding / reranking)
 *   - `category` (chat / embedding / reranking / vision / code / image_generation / audio / custom)
 *   - `systemPrompt`
 *
 * 空/负数值会 coerce 成 undefined（而不是 0）；这样上层拿到的 patch 可以
 * 用 spread 合并而不需要再做非法值过滤。
 */

import { Checkbox, InputNumber, Select, Switch, theme, Typography } from "antd";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type {
	ModelCapability,
	ModelCategory,
	ProviderModel,
} from "../../types/models";

const { Text } = Typography;
const { useToken } = theme;

const ALL_CAPABILITIES: ModelCapability[] = [
	"vision",
	"web_search",
	"reasoning",
	"tool_use",
	"embedding",
	"reranking",
];

const ALL_CATEGORIES: ModelCategory[] = [
	"chat",
	"embedding",
	"reranking",
	"vision",
	"code",
	"image_generation",
	"audio",
	"custom",
];

export interface ModelCapabilityEditorProps {
	value: ProviderModel;
	onChange: (patch: Partial<ProviderModel>) => void;
	disabled?: boolean;
}

/**
 * Normalize an InputNumber value into `number | undefined`.
 *
 * `null`, `undefined`, `NaN` and non-positive values collapse to `undefined`
 * so the patch never writes an invalid `0` or negative token count into the
 * model config.
 *
 * Exported for focused unit tests; not part of the component's public API.
 */
export function coerceNumericField(raw: number | string | null | undefined): number | undefined {
	if (raw == null || raw === "") return undefined;
	const num = typeof raw === "string" ? Number(raw) : raw;
	if (!Number.isFinite(num) || num <= 0) return undefined;
	return num;
}

export function ModelCapabilityEditor({
	value,
	onChange,
	disabled,
}: ModelCapabilityEditorProps) {
	const { t } = useTranslation();
	const { token } = useToken();

	const capabilities = value.capabilities ?? [];

	const handleToggleCapability = useCallback(
		(cap: ModelCapability, checked: boolean) => {
			const next = checked
				? Array.from(new Set([...capabilities, cap]))
				: capabilities.filter((c) => c !== cap);
			onChange({ capabilities: next });
		},
		[capabilities, onChange],
	);

	const handleCategory = useCallback(
		(category: ModelCategory) => {
			onChange({ category });
		},
		[onChange],
	);

	const handleStreaming = useCallback(
		(checked: boolean) => {
			onChange({ supportsStreaming: checked });
		},
		[onChange],
	);

	const handleContextWindow = useCallback(
		(raw: number | string | null) => {
			onChange({ contextWindow: coerceNumericField(raw) });
		},
		[onChange],
	);

	const handleMaxTokens = useCallback(
		(raw: number | string | null) => {
			onChange({ maxTokens: coerceNumericField(raw) });
		},
		[onChange],
	);

	const handleSystemPrompt = useCallback(
		(event: React.ChangeEvent<HTMLTextAreaElement>) => {
			const raw = event.target.value;
			onChange({ systemPrompt: raw.length > 0 ? raw : undefined });
		},
		[onChange],
	);

	return (
		<div
			className="flex flex-col gap-3"
			data-testid="model-capability-editor"
		>
			{/* Numeric limits + streaming */}
			<div className="grid grid-cols-3 gap-3">
				<label className="flex flex-col gap-1">
					<Text type="secondary" style={{ fontSize: 12 }}>
						{t("modelConfig.contextWindow", { ns: "models" })}
					</Text>
					<InputNumber
						aria-label={t("modelConfig.contextWindow", { ns: "models" })}
						min={1}
						disabled={disabled}
						value={value.contextWindow}
						onChange={handleContextWindow}
						className="w-full!"
					/>
				</label>
				<label className="flex flex-col gap-1">
					<Text type="secondary" style={{ fontSize: 12 }}>
						{t("modelConfig.maxTokens", { ns: "models" })}
					</Text>
					<InputNumber
						aria-label={t("modelConfig.maxTokens", { ns: "models" })}
						min={1}
						disabled={disabled}
						value={value.maxTokens}
						onChange={handleMaxTokens}
						className="w-full!"
					/>
				</label>
				<label className="flex flex-col gap-1">
					<Text type="secondary" style={{ fontSize: 12 }}>
						{t("modelConfig.streaming", { ns: "models" })}
					</Text>
					<div>
						<Switch
							aria-label={t("modelConfig.streaming", { ns: "models" })}
							checked={value.supportsStreaming}
							disabled={disabled}
							onChange={handleStreaming}
						/>
					</div>
				</label>
			</div>

			{/* Category */}
			<label className="flex flex-col gap-1">
				<Text type="secondary" style={{ fontSize: 12 }}>
					{t("modelConfig.category", { ns: "models" })}
				</Text>
				<Select<ModelCategory>
					aria-label={t("modelConfig.category", { ns: "models" })}
					disabled={disabled}
					value={value.category}
					onChange={handleCategory}
					options={ALL_CATEGORIES.map((c) => ({
						value: c,
						label: t(`categories.${c}`, { ns: "models" }),
					}))}
					className="w-full!"
				/>
			</label>

			{/* Capabilities */}
			<div className="flex flex-col gap-1">
				<Text type="secondary" style={{ fontSize: 12 }}>
					{t("modelConfig.capabilities", { ns: "models" })}
				</Text>
				<div className="flex flex-wrap gap-x-4 gap-y-1">
					{ALL_CAPABILITIES.map((cap) => (
						<Checkbox
							key={cap}
							checked={capabilities.includes(cap)}
							disabled={disabled}
							onChange={(e) => handleToggleCapability(cap, e.target.checked)}
						>
							{t(`capabilities.${cap}`, { ns: "models" })}
						</Checkbox>
					))}
				</div>
			</div>

			{/* System prompt */}
			<label className="flex flex-col gap-1">
				<Text type="secondary" style={{ fontSize: 12 }}>
					{t("modelConfig.systemPrompt", { ns: "models" })}
				</Text>
				<textarea
					aria-label={t("modelConfig.systemPrompt", { ns: "models" })}
					disabled={disabled}
					value={value.systemPrompt ?? ""}
					onChange={handleSystemPrompt}
					rows={3}
					placeholder={t("modelConfig.systemPromptPlaceholder", {
						ns: "models",
					})}
					style={{
						width: "100%",
						fontFamily:
							"ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
						fontSize: 12,
						resize: "vertical",
						padding: "6px 8px",
						border: `1px solid ${token.colorBorder}`,
						borderRadius: token.borderRadius,
						background: token.colorBgContainer,
						color: token.colorText,
					}}
				/>
			</label>
		</div>
	);
}
