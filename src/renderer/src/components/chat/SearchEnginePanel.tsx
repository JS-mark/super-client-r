import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	GoogleIcon,
	BingIcon,
	BaiduIcon,
	SogouIcon,
} from "../icons/SearchEngineIcons";
import { cn } from "../../lib/utils";
import type { SearchConfig } from "../../types/search";
import { searchService } from "../../services/search/searchService";

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
		default:
			return <span style={{ fontSize: size }}>🔍</span>;
	}
}

export function SearchEnginePanel({
	selectedEngine,
	onSelectEngine,
	onClose,
}: SearchEnginePanelProps) {
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
		() => searchConfigs.filter((c) => c.enabled && c.apiKey),
		[searchConfigs],
	);

	return (
		<div
			ref={panelRef}
			className="w-full bg-[#252526] rounded-lg overflow-hidden shadow-2xl border border-[#3c3c3c]"
		>
			{/* Search Engine List */}
			<div className="py-1 max-h-[200px] overflow-y-auto">
				{enabledConfigs.length === 0 ? (
					<div className="px-3 py-6 text-center text-[13px] text-[#858585]">
						暂无可用搜索引擎，请在设置中配置
					</div>
				) : (
					<>
						<div className="px-3 py-1.5 text-[11px] text-[#858585] uppercase tracking-wider">
							网络搜索
						</div>
						{enabledConfigs.map((config) => (
							<button
								key={config.id}
								onClick={() => {
									onSelectEngine(config.provider);
									onClose();
								}}
								className={cn(
									"w-full flex items-center justify-between px-3 py-2.5 transition-colors",
									selectedEngine === config.provider
										? "bg-[#094771]"
										: "hover:bg-[#2a2d2e]",
								)}
							>
								<div className="flex items-center gap-3">
									<span className="w-5 h-5 flex items-center justify-center flex-shrink-0">
										{getEngineIcon(config.provider, 16)}
									</span>
									<span
										className={cn(
											"text-[13px]",
											selectedEngine === config.provider
												? "text-white"
												: "text-[#cccccc]",
										)}
									>
										{config.name}
									</span>
								</div>
								{config.isDefault && (
									<span className="text-[11px] text-white/80 bg-white/20 px-1.5 py-0.5 rounded">
										默认
									</span>
								)}
							</button>
						))}
					</>
				)}
			</div>

			{/* Footer */}
			<div className="flex items-center justify-between px-3 py-2 border-t border-[#3c3c3c] bg-[#252526]">
				<div className="flex items-center gap-2">
					<svg
						className="w-3.5 h-3.5 text-[#858585]"
						viewBox="0 0 16 16"
						fill="currentColor"
					>
						<path d="M8.5 1.5a.5.5 0 00-1 0v5.793L5.354 5.146a.5.5 0 10-.707.707l3 3a.5.5 0 00.707 0l3-3a.5.5 0 00-.707-.707L8.5 7.293V1.5z" />
						<path d="M3.5 9.5a.5.5 0 00-1 0v2A2.5 2.5 0 005 14h6a2.5 2.5 0 002.5-2.5v-2a.5.5 0 00-1 0v2A1.5 1.5 0 0111 13H5a1.5 1.5 0 01-1.5-1.5v-2z" />
					</svg>
					<span className="text-[11px] text-[#cccccc]">网络搜索</span>
				</div>
				<div className="flex items-center gap-1.5 text-[10px] text-[#858585]">
					<span className="px-1 py-0.5 bg-[#3c3c3c] rounded">ESC</span>
					<span>关闭</span>
					<span className="mx-1">·</span>
					<span className="px-1 py-0.5 bg-[#3c3c3c] rounded">↵</span>
					<span>确认</span>
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
					const firstEnabled = result.data.configs.find(
						(c) => c.enabled && c.apiKey,
					);
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
		() => searchConfigs.filter((c) => c.enabled && c.apiKey),
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
