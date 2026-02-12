import type * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
	GoogleIcon,
	BingIcon,
	BaiduIcon,
	SogouIcon,
} from "../icons/SearchEngineIcons";
import { cn } from "../../lib/utils";
import type { SearchConfig, SearchProviderType } from "../../types/search";
import { searchService } from "../../services/search/searchService";

interface SearchEngine {
	id: string;
	name: string;
	icon: React.ReactNode;
	key: string;
}

const SEARCH_ENGINES: SearchEngine[] = [
	{ id: "google", name: "Google", icon: <GoogleIcon size={16} />, key: "↑" },
	{ id: "bing", name: "Bing", icon: <BingIcon size={16} />, key: "↓" },
	{ id: "baidu", name: "百度", icon: <BaiduIcon size={16} />, key: "←" },
	{ id: "sogou", name: "搜狗", icon: <SogouIcon size={16} />, key: "→" },
];

export interface SearchEnginePanelProps {
	selectedEngine: string;
	onSelectEngine: (engine: string) => void;
	onClose: () => void;
}

export function SearchEnginePanel({ selectedEngine, onSelectEngine, onClose }: SearchEnginePanelProps) {
	const [searchConfigs, setSearchConfigs] = useState<SearchConfig[]>([]);
	const [activeCategory, setActiveCategory] = useState("all");
	const [searchQuery, setSearchQuery] = useState("");

	const categories = [
		{ id: "all", name: "全部", count: 12 },
		{ id: "question", name: "问题", count: null },
		{ id: "tool", name: "工具", count: null },
		{ id: "skill", name: "技能", count: null },
	];

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

	const getEngineIcon = useCallback((provider: string) => {
		switch (provider) {
			case "google": return <GoogleIcon size={16} />;
			case "bing": return <BingIcon size={16} />;
			case "baidu": return <BaiduIcon size={16} />;
			case "sogou": return <SogouIcon size={16} />;
			default: return <span className="text-lg">🔍</span>;
		}
	}, []);

	return (
		<div className="w-full bg-[#252526] rounded-lg overflow-hidden shadow-2xl border border-[#3c3c3c]">
			{/* Search Input */}
			<div className="px-3 py-3 border-b border-[#3c3c3c]">
				<div className="flex items-center gap-2 text-[#cccccc]">
					<svg className="w-4 h-4 text-[#858585]" viewBox="0 0 16 16" fill="currentColor">
						<path d="M11.7422 10.3439C12.5329 9.2673 13 7.9382 13 6.5C13 2.91015 10.0899 0 6.5 0C2.91015 0 0 2.91015 0 6.5C0 10.0899 2.91015 13 6.5 13C7.9382 13 9.2673 12.5329 10.3439 11.7422L14.1464 15.5446C14.3417 15.7399 14.6583 15.7399 14.8536 15.5446L15.5446 14.8536C15.7399 14.6583 15.7399 14.3417 15.5446 14.1464L11.7422 10.3439ZM6.5 11C8.98528 11 11 8.98528 11 6.5C11 4.01472 8.98528 2 6.5 2C4.01472 2 2 4.01472 2 6.5C2 8.98528 4.01472 11 6.5 11Z"/>
					</svg>
					<input
						type="text"
						placeholder="搜索问题、工具或AI..."
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						className="flex-1 bg-transparent text-[13px] text-[#cccccc] placeholder-[#6e6e6e] outline-none"
					/>
				</div>
			</div>

			{/* Category Tabs */}
			<div className="flex items-center px-2 py-2 border-b border-[#3c3c3c] gap-1">
				{categories.map((cat) => (
					<button
						key={cat.id}
						onClick={() => setActiveCategory(cat.id)}
						className={cn(
							"flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] transition-colors",
							activeCategory === cat.id
								? "bg-[#094771] text-white"
								: "text-[#cccccc] hover:bg-[#2a2d2e]"
						)}
					>
						<span>{cat.name}</span>
						{cat.count !== null && (
							<span className="text-[10px] opacity-70">{cat.count}</span>
						)}
					</button>
				))}
			</div>

			{/* Search Engine List */}
			<div className="py-1 max-h-[200px] overflow-y-auto">
				{/* Configured search engines */}
				{searchConfigs.length > 0 && (
					<>
						<div className="px-3 py-1.5 text-[11px] text-[#858585] uppercase tracking-wider">
							我的搜索
						</div>
						{searchConfigs.filter(c => c.enabled).map((config) => (
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
										: "hover:bg-[#2a2d2e]"
								)}
							>
								<div className="flex items-center gap-3">
									<span className="w-5 h-5 flex items-center justify-center flex-shrink-0">
										{getEngineIcon(config.provider)}
									</span>
									<span className={cn(
										"text-[13px]",
										selectedEngine === config.provider ? "text-white" : "text-[#cccccc]"
									)}>
										{config.name}
									</span>
								</div>
								{config.isDefault && (
									<span className="text-[11px] text-white/80 bg-white/20 px-1.5 py-0.5 rounded">默认</span>
								)}
							</button>
						))}
						<div className="my-2 border-t border-[#3c3c3c]" />
					</>
				)}
				{/* Basic search engines */}
				<div className="px-3 py-1.5 text-[11px] text-[#858585] uppercase tracking-wider">
					快速搜索
				</div>
				{SEARCH_ENGINES.map((engine) => (
					<button
						key={engine.id}
						onClick={() => {
							onSelectEngine(engine.id);
							onClose();
						}}
						className={cn(
							"w-full flex items-center justify-between px-3 py-2.5 transition-colors",
							selectedEngine === engine.id
								? "bg-[#094771]"
								: "hover:bg-[#2a2d2e]"
						)}
					>
						<div className="flex items-center gap-3">
							<span className="w-5 h-5 flex items-center justify-center flex-shrink-0">
								{engine.icon}
							</span>
							<span className={cn(
								"text-[13px]",
								selectedEngine === engine.id ? "text-white" : "text-[#cccccc]"
							)}>
								{engine.name}
							</span>
						</div>
						{selectedEngine === engine.id && !searchConfigs.find(c => c.provider === engine.id)?.isDefault && (
							<span className="text-[11px] text-white/80 bg-white/20 px-1.5 py-0.5 rounded">免费</span>
						)}
					</button>
				))}
			</div>

			{/* Footer */}
			<div className="flex items-center justify-between px-3 py-2 border-t border-[#3c3c3c] bg-[#252526]">
				<div className="flex items-center gap-2">
					<svg className="w-3.5 h-3.5 text-[#858585]" viewBox="0 0 16 16" fill="currentColor">
						<path d="M8.5 1.5a.5.5 0 00-1 0v5.793L5.354 5.146a.5.5 0 10-.707.707l3 3a.5.5 0 00.707 0l3-3a.5.5 0 00-.707-.707L8.5 7.293V1.5z"/>
						<path d="M3.5 9.5a.5.5 0 00-1 0v2A2.5 2.5 0 005 14h6a2.5 2.5 0 002.5-2.5v-2a.5.5 0 00-1 0v2A1.5 1.5 0 0111 13H5a1.5 1.5 0 01-1.5-1.5v-2z"/>
					</svg>
					<span className="text-[11px] text-[#cccccc]">网络搜索</span>
				</div>
				<div className="flex items-center gap-1.5 text-[10px] text-[#858585]">
					<span className="px-1 py-0.5 bg-[#3c3c3c] rounded">ESC</span>
					<span>关闭</span>
					<span className="mx-1">·</span>
					<span className="px-1 py-0.5 bg-[#3c3c3c] rounded">▲▼</span>
					<span>选择</span>
					<span className="mx-1">·</span>
					<span className="px-1 py-0.5 bg-[#3c3c3c] rounded">⌘</span>
					<span>+</span>
					<span className="px-1 py-0.5 bg-[#3c3c3c] rounded">▲▼</span>
					<span>翻页</span>
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
	const [defaultSearchProvider, setDefaultSearchProvider] = useState<SearchProviderType | undefined>();
	const [selectedEngine, setSelectedEngine] = useState<string>("baidu");

	const loadSearchConfigs = useCallback(async () => {
		try {
			const result = await searchService.getConfigs();
			if (result.success && result.data) {
				setSearchConfigs(result.data.configs);
				setDefaultSearchProvider(result.data.defaultProvider);
				if (result.data.defaultProvider) {
					setSelectedEngine(result.data.defaultProvider);
				}
			}
		} catch (error) {
			console.error("Failed to load search configs:", error);
		}
	}, []);

	useEffect(() => {
		loadSearchConfigs();
	}, [loadSearchConfigs]);

	const getEngineIcon = useCallback((provider: string) => {
		switch (provider) {
			case "google": return <GoogleIcon size={16} />;
			case "bing": return <BingIcon size={16} />;
			case "baidu": return <BaiduIcon size={16} />;
			case "sogou": return <SogouIcon size={16} />;
			default: return <span className="text-lg">🔍</span>;
		}
	}, []);

	const getEngineName = useCallback((provider: string) => {
		const config = searchConfigs.find(c => c.provider === provider);
		if (config) return config.name;
		switch (provider) {
			case "google": return "Google";
			case "bing": return "Bing";
			case "baidu": return "百度";
			case "sogou": return "搜狗";
			default: return provider;
		}
	}, [searchConfigs]);

	const currentEngine = useMemo(() => {
		const config = searchConfigs.find(c => c.provider === selectedEngine);
		if (config) {
			return {
				id: config.provider,
				name: config.name,
				icon: getEngineIcon(config.provider),
				key: "",
			};
		}
		return SEARCH_ENGINES.find(e => e.id === selectedEngine) || SEARCH_ENGINES[2];
	}, [selectedEngine, searchConfigs, getEngineIcon]);

	return {
		selectedEngine,
		setSelectedEngine,
		searchConfigs,
		currentEngine,
		getEngineIcon,
		getEngineName,
	};
}
