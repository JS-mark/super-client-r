import { Crepe, CrepeFeature } from "@milkdown/crepe";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";
import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

interface SystemPromptEditorProps {
	value?: string;
	onChange?: (value: string) => void;
	placeholder?: string;
}

export function SystemPromptEditor({
	value = "",
	onChange,
	placeholder,
}: SystemPromptEditorProps) {
	const { t } = useTranslation();
	const containerRef = useRef<HTMLDivElement>(null);
	const crepeRef = useRef<Crepe | null>(null);
	const onChangeRef = useRef(onChange);
	const valueRef = useRef(value);
	const isInternalUpdate = useRef(false);

	// Keep refs in sync
	onChangeRef.current = onChange;
	valueRef.current = value;

	const placeholderText =
		placeholder ||
		t("modelConfig.systemPromptPlaceholder", { ns: "models" });

	// Initialize Crepe editor
	useEffect(() => {
		if (!containerRef.current) return;

		const crepe = new Crepe({
			root: containerRef.current,
			defaultValue: valueRef.current,
			features: {
				[CrepeFeature.ImageBlock]: false,
				[CrepeFeature.Table]: false,
				[CrepeFeature.Latex]: false,
				[CrepeFeature.BlockEdit]: false,
			},
			featureConfigs: {
				[CrepeFeature.Placeholder]: {
					text: placeholderText,
				},
			},
		});

		crepe.on((listener) => {
			listener.markdownUpdated((_ctx, markdown, prevMarkdown) => {
				if (markdown !== prevMarkdown) {
					isInternalUpdate.current = true;
					onChangeRef.current?.(markdown);
				}
			});
		});

		crepe.create().then(() => {
			crepeRef.current = crepe;
		});

		return () => {
			crepeRef.current = null;
			crepe.destroy();
		};
	}, []); // Only mount once

	// Sync external value changes into the editor
	const setEditorContent = useCallback((markdown: string) => {
		const crepe = crepeRef.current;
		if (!crepe) return;

		try {
			const currentMarkdown = crepe.getMarkdown();
			if (currentMarkdown !== markdown) {
				// Destroy and recreate with new value
				// Milkdown doesn't have a setMarkdown API, so we must recreate
				// However, we avoid doing this during internal updates
				// For now, we accept that external value sync is one-way on init
			}
		} catch {
			// Editor might not be ready yet
		}
	}, []);

	useEffect(() => {
		if (isInternalUpdate.current) {
			isInternalUpdate.current = false;
			return;
		}
		setEditorContent(value);
	}, [value, setEditorContent]);

	return (
		<div
			ref={containerRef}
			className="milkdown-system-prompt rounded-lg border border-gray-200 min-h-[120px] max-h-[300px] overflow-y-auto text-sm"
		/>
	);
}
