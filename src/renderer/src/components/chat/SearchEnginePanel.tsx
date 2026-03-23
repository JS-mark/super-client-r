import { theme } from "antd";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	GoogleIcon,
	BingIcon,
	BaiduIcon,
	SogouIcon,
} from "../icons/SearchEngineIcons";
import type { SearchConfig } from "../../types/search";
import { searchService } from "../../services/search/searchService";
import { SEARCH_PROVIDERS } from "../settings/SearchProviders";

export interface SearchEnginePanelProps {
	selectedEngine: string;
	onSelectEngine: (engine: string) => void;
	onClose: () => void;
}

function getEngineIcon(provider: string, size = 14) {
	switch (provider) {
		case "google":
			return <GoogleIcon size={size} />;
		case "bing":
			return <BingIcon size={size} />;
		case "baidu":
			return <BaiduIcon size={size} />;
		case "sogou":
			return <SogouIcon size={size} />;
		default: {
			const info = SEARCH_PROVIDERS.find((p) => p.id === provider);
			return <span style={{ fontSize: size }}>{info?.icon ?? "🔍"}</span>;
		}
	}
}

export function SearchEnginePanel({
	selectedEngine,
	onSelectEngine,
	onClose,
}: SearchEnginePanelProps) {
	const { t } = useTranslation();
	const { token } = theme.useToken();
	const [searchConfigs, setSearchConfigs] = useState<SearchConfig[]>([]);
	const panelRef = useRef<HTMLDivElement>(null);

	// Load configs from settings
	useEffect(() => {
		(async () => {
			try {
				const result = await searchService.getConfigs();
				if (result.success && result.data) {
					setSearchConfigs(result.data.configs);
				}
			} catch (error) {
				console.error("Failed to load search configs:", error);
			}
		})();
	}, []);

	// Click outside to close
	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
				onClose();
			}
		};
		const timer = setTimeout(() => {
			document.addEventListener("mousedown", handleClickOutside);
		}, 0);
		return () => {
			clearTimeout(timer);
			document.removeEventListener("mousedown", handleClickOutside);
		};
	}, [onClose]);

	// ESC to close
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				onClose();
			}
		};
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [onClose]);

	// Only show enabled configs with apiKey
	const enabledConfigs = useMemo(
		() => searchConfigs.filter((c) => c.enabled),
		[searchConfigs],
	);

	return (
		<div
			ref={panelRef}
			className="w-full rounded-lg overflow-hidden shadow-2xl"
			style={{
				backgroundColor: token.colorBgElevated,
				borderColor: token.colorBorderSecondary,
				borderWidth: 1,
				borderStyle: "solid",
			}}
		>
			{/* Search Engine List */}
			<div className="py-1 max-h-[200px] overflow-y-auto">
				{enabledConfigs.length === 0 ? (
					<div
						className="px-3 py-6 text-center text-[13px]"
						style={{ color: token.colorTextQuaternary }}
					>
						{t("searchEngine.noEnginesAvailable", { ns: "chat" })}
					</div>
				) : (
					<>
						<div
							className="px-3 py-1.5 text-[11px] uppercase tracking-wider"
							style={{ color: token.colorTextQuaternary }}
						>
							{t("searchEngine.webSearch", { ns: "chat" })}
						</div>
						{enabledConfigs.map((config) => (
							<button
								key={config.id}
								onClick={() => {
									onSelectEngine(config.provider);
									onClose();
								}}
								className="w-full flex items-center justify-between px-3 py-2.5 transition-colors"
								style={{
									backgroundColor:
										selectedEngine === config.provider
											? token.colorPrimaryBg
											: "transparent",
								}}
								onMouseEnter={(e) => {
									if (selectedEngine !== config.provider) {
										e.currentTarget.style.backgroundColor =
											token.colorBgTextHover;
									}
								}}
								onMouseLeave={(e) => {
									e.currentTarget.style.backgroundColor =
										selectedEngine === config.provider
											? token.colorPrimaryBg
											: "transparent";
								}}
							>
								<div className="flex items-center gap-3">
									<span className="w-5 h-5 flex items-center justify-center flex-shrink-0">
										{getEngineIcon(config.provider, 16)}
									</span>
									<span
										className="text-[13px]"
										style={{
											color:
												selectedEngine === config.provider
													? token.colorPrimaryText
													: token.colorText,
										}}
									>
										{config.name}
									</span>
								</div>
								{config.isDefault && (
									<span
										className="text-[11px] px-1.5 py-0.5 rounded"
										style={{
											color: token.colorTextSecondary,
											backgroundColor: token.colorFillSecondary,
										}}
									>
										{t("default", { ns: "common" })}
									</span>
								)}
							</button>
						))}
					</>
				)}
			</div>

			{/* Footer */}
			<div
				className="flex items-center justify-between px-3 py-2"
				style={{
					borderTop: `1px solid ${token.colorBorderSecondary}`,
					backgroundColor: token.colorBgElevated,
				}}
			>
				<div className="flex items-center gap-2">
					<svg
						className="w-3.5 h-3.5"
						style={{ color: token.colorTextQuaternary }}
						viewBox="0 0 16 16"
						fill="currentColor"
					>
						<path d="M8.5 1.5a.5.5 0 00-1 0v5.793L5.354 5.146a.5.5 0 10-.707.707l3 3a.5.5 0 00.707 0l3-3a.5.5 0 00-.707-.707L8.5 7.293V1.5z" />
						<path d="M3.5 9.5a.5.5 0 00-1 0v2A2.5 2.5 0 005 14h6a2.5 2.5 0 002.5-2.5v-2a.5.5 0 00-1 0v2A1.5 1.5 0 0111 13H5a1.5 1.5 0 01-1.5-1.5v-2z" />
					</svg>
					<span
						className="text-[11px]"
						style={{ color: token.colorTextTertiary }}
					>
						{t("searchEngine.webSearch", { ns: "chat" })}
					</span>
				</div>
				<div
					className="flex items-center gap-1.5 text-[10px]"
					style={{ color: token.colorTextQuaternary }}
				>
					<span
						className="px-1 py-0.5 rounded"
						style={{ backgroundColor: token.colorFillTertiary }}
					>
						ESC
					</span>
					<span>{t("close", { ns: "common" })}</span>
					<span className="mx-1">·</span>
					<span
						className="px-1 py-0.5 rounded"
						style={{ backgroundColor: token.colorFillTertiary }}
					>
						↵
					</span>
					<span>{t("confirm", { ns: "common" })}</span>
				</div>
			</div>
		</div>
	);
}

// Hook for search engine state management
export function useSearchEngine() {
	const [searchConfigs, setSearchConfigs] = useState<SearchConfig[]>([]);
	const [selectedEngine, setSelectedEngine] = useState<string>("");

	const loadSearchConfigs = useCallback(async () => {
		try {
			const result = await searchService.getConfigs();
			if (result.success && result.data) {
				setSearchConfigs(result.data.configs);
				if (result.data.defaultProvider) {
					setSelectedEngine(result.data.defaultProvider);
				} else {
					const firstEnabled = result.data.configs.find((c) => c.enabled);
					if (firstEnabled) {
						setSelectedEngine(firstEnabled.provider);
					}
				}
			}
		} catch (error) {
			console.error("Failed to load search configs:", error);
		}
	}, []);

	useEffect(() => {
		loadSearchConfigs();
	}, [loadSearchConfigs]);

	const enabledConfigs = useMemo(
		() => searchConfigs.filter((c) => c.enabled),
		[searchConfigs],
	);

	const currentEngine = useMemo(() => {
		const config = enabledConfigs.find((c) => c.provider === selectedEngine);
		if (config) {
			return {
				id: config.provider,
				name: config.name,
				icon: getEngineIcon(config.provider, 14),
			};
		}
		return null;
	}, [selectedEngine, enabledConfigs]);

	return {
		selectedEngine,
		setSelectedEngine,
		searchConfigs,
		enabledConfigs,
		currentEngine,
		hasSearchEngines: enabledConfigs.length > 0,
	};
}
