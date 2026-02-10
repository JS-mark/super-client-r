import { request, summary, tags, query, path, description } from "koa-swagger-decorator";
import { storeManager } from "../../store";

const SKILLSMP_API_BASE = "https://skillsmp.com/api/v1";

// 获取 API Key
const getSkillsMpApiKey = (): string => {
	return storeManager.getConfig("skillsmpApiKey") || "";
};

export class SkillsController {
	@request("get", "/api/skills")
	@summary("搜索 skills")
	@description("搜索 SkillsMP 平台的 skills，默认搜索 tools 分类")
	@tags(["Skills"])
	@query({
		page: { type: "number", default: 1, description: "页码" },
		limit: { type: "number", default: 12, description: "每页数量" },
		sortBy: { type: "string", default: "stars", description: "排序方式 (stars/name/createdAt)" },
		q: { type: "string", default: "tools", description: "搜索关键词" },
	})
	async getSkills(ctx: any) {
		try {
			const {
				page = "1",
				limit = "12",
				sortBy = "stars",
				q = "tools",
			} = ctx.query;

			// 构建查询参数 - 使用原始 API 格式
			const params = new URLSearchParams();
			params.set("page", String(page));
			params.set("limit", String(limit));
			params.set("sortBy", String(sortBy));
			params.set("q", String(q));
			const url = `${SKILLSMP_API_BASE}/skills/search?${params.toString()}`;
			const apiKey = getSkillsMpApiKey();

			console.log(`[SkillsMP] Requesting: ${url}`);
			console.log(`[SkillsMP] API Key present: ${apiKey ? "yes" : "no"}`);

			const response = await fetch(url, {
				method: "GET",
				headers: {
					accept: "*/*",
					"accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
					authorization: apiKey ? `Bearer ${apiKey}` : "",
					"user-agent":
						"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
				},
			});

			console.log(`[SkillsMP] Response status: ${response.status}`);

			if (!response.ok) {
				const errorText = await response.text();
				console.error(`[SkillsMP] Error response: ${errorText}`);
				ctx.status = response.status;
				ctx.body = {
					error: `SkillsMP API error: ${response.statusText}`,
					details: errorText,
				};
				return;
			}

			const data = await response.json();
			ctx.body = data;
		} catch (error) {
			console.error("[SkillsMP] Failed to fetch skills:", error);
			ctx.status = 500;
			ctx.body = {
				error: "Failed to fetch skills",
				message: error instanceof Error ? error.message : String(error),
			};
		}
	}

	@request("get", "/api/skills/search")
	@summary("搜索 skills (显式端点)")
	@description("使用 /skills/search 端点搜索 skills")
	@tags(["Skills"])
	@query({
		q: { type: "string", default: "", description: "搜索关键词" },
		page: { type: "number", default: 1, description: "页码" },
		limit: { type: "number", default: 12, description: "每页数量" },
	})
	async searchSkills(ctx: any) {
		try {
			const { q = "", page = "1", limit = "12" } = ctx.query;

			const params = new URLSearchParams();
			params.set("q", String(q));
			params.set("page", String(page));
			params.set("limit", String(limit));

			const url = `${SKILLSMP_API_BASE}/skills/search?${params.toString()}`;

			const response = await fetch(url, {
				method: "GET",
				headers: {
					accept: "application/json",
					"accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
					authorization: getSkillsMpApiKey()
						? `Bearer ${getSkillsMpApiKey()}`
						: "",
					"user-agent":
						"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
				},
			});

			if (!response.ok) {
				ctx.status = response.status;
				ctx.body = { error: `SkillsMP API error: ${response.statusText}` };
				return;
			}

			const data = await response.json();
			ctx.body = data;
		} catch (error) {
			console.error("Failed to search skills:", error);
			ctx.status = 500;
			ctx.body = { error: "Failed to search skills" };
		}
	}

}
