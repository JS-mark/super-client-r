import type { Skill } from "../types/skills";

// 模拟的 Skill 市场数据，参考 https://skillsmp.com/zh
// 在实际生产环境中，这里应该调用 https://skillsmp.com/api/v1/skills/search 或读取 GitHub 仓库的 marketplace.json
const MOCK_MARKET_SKILLS: Skill[] = [];

let serverPort: number | null = null;
let apiKey: string | null = null;

const getProxyUrl = async (path: string) => {
	if (!serverPort) {
		try {
			serverPort = (await window.electron.ipc.invoke(
				"get-server-port",
			)) as number;
		} catch (e) {
			console.error("Failed to get server port", e);
			return null;
		}
	}
	return `http://localhost:${serverPort}${path}`;
};

const getApiKey = async (): Promise<string | null> => {
	if (apiKey) return apiKey;
	try {
		apiKey = (await window.electron.ipc.invoke("api:get-api-key")) as string;
		return apiKey;
	} catch (e) {
		console.error("Failed to get API key", e);
		return null;
	}
};

export const skillService = {
	async getMarketSkills(
		page = 1,
		limit = 12,
		sortBy = "stars",
		domain = "tools",
		search?: string,
	): Promise<{ skills: Skill[]; total: number }> {
		try {
			const params = new URLSearchParams({
				page: page.toString(),
				limit: limit.toString(),
				sortBy,
				domain,
			});

			// 如果有搜索关键词，使用搜索端点
			const endpoint = search
				? `/api/skills/search?q=${encodeURIComponent(search)}`
				: `/api/skills?${params.toString()}`;
			const url = await getProxyUrl(endpoint);
			if (!url) throw new Error("Proxy URL not available");

			const key = await getApiKey();
			console.log("[SkillService] Fetching:", url);

			const response = await fetch(url, {
				headers: {
					accept: "*/*",
					"accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
					...(key ? { authorization: `Bearer ${key}` } : {}),
				},
			});

			console.log("[SkillService] Response status:", response.status);

			if (response.ok) {
				const result = await response.json();
				console.log("[SkillService] Response data:", result);

				// 处理 SkillsMP API 格式: { success: true, data: { skills: [...], pagination: {...} } }
				let skills: Skill[] = [];
				let total = 0;

				if (result.success && result.data) {
					// SkillsMP API 格式
					const data = result.data;
					if (data.skills && Array.isArray(data.skills)) {
						skills = data.skills.map((item: any) => ({
							id: item.id,
							name: item.name,
							description: item.description,
							author: item.author,
							version: "1.0.0", // API 没有返回版本，使用默认值
							installed: false,
							homepage: item.skillUrl,
							repository: item.githubUrl,
						}));
						total = data.pagination?.total || skills.length;
					}
				} else if (Array.isArray(result)) {
					// 直接返回数组
					skills = result;
					total = result.length;
				} else if (result.skills && Array.isArray(result.skills)) {
					// 直接包含 skills 字段
					skills = result.skills;
					total = result.total || skills.length;
				} else {
					console.warn("[SkillService] Unexpected response format:", result);
				}

				return { skills, total };
			} else {
				const errorText = await response.text();
				console.warn(
					"[SkillService] API request failed:",
					response.status,
					response.statusText,
					errorText,
				);
			}
		} catch (error) {
			console.error("[SkillService] Failed to fetch market skills:", error);
		}

		// 降级使用 Mock 数据
		await new Promise((resolve) => setTimeout(resolve, 600));
		return {
			skills: MOCK_MARKET_SKILLS,
			total: MOCK_MARKET_SKILLS.length,
		};
	},

	async getSkillDetails(id: string): Promise<Skill | undefined> {
		await new Promise((resolve) => setTimeout(resolve, 300));
		return MOCK_MARKET_SKILLS.find((s) => s.id === id);
	},
};
