import type { ResolvedAttachmentBlock } from "@super-client/shared-types";
import { attachmentResolverService } from "../services/attachmentResolverService";
import { searchService } from "../services/search/searchService";
import type { SearchConfig, SearchResult } from "../types/search";

export interface AgentPromptContextOptions {
	conversationId?: string | null;
	content: string;
	attachmentIds?: string[];
	searchEngine?: string;
	searchConfigs?: SearchConfig[];
	maxAttachmentBytes?: number;
	maxSearchResults?: number;
}

export interface AgentPromptContextBuildResult {
	prompt: string;
	attachmentCount: number;
	searchResultCount: number;
	warnings: string[];
}

export function formatAttachmentContext(
	blocks: ResolvedAttachmentBlock[],
): string {
	if (blocks.length === 0) return "";

	const sections = blocks.map((block, index) => {
		const header = [
			`### ${index + 1}. ${block.fileName}`,
			`- attachmentId: ${block.attachmentId}`,
			block.mimeType ? `- mimeType: ${block.mimeType}` : undefined,
			`- size: ${block.size} bytes`,
			block.truncated ? "- truncated: true" : undefined,
		]
			.filter(Boolean)
			.join("\n");

		if (block.resolution === "text" && block.text) {
			return `${header}\n\n\`\`\`text\n${block.text}\n\`\`\``;
		}

		return `${header}\n\n<attachment-ref id="${block.attachmentId}" name="${block.fileName}" />`;
	});

	return `--- Attached Files ---\nThe user attached files for this turn. Use these contents as context and cite file names when relevant.\n\n${sections.join("\n\n")}`;
}

export function formatSearchContext(
	query: string,
	provider: string,
	results: SearchResult[],
): string {
	if (results.length === 0) return "";

	const lines = results.map((result, index) => {
		return [
			`### ${index + 1}. ${result.title}`,
			`- url: ${result.url}`,
			result.snippet ? `- snippet: ${result.snippet}` : undefined,
		]
			.filter(Boolean)
			.join("\n");
	});

	return `--- Web Search Results ---\nSearch provider: ${provider}\nSearch query: ${query}\n\n${lines.join("\n\n")}`;
}

export async function buildAgentPromptWithContext(
	options: AgentPromptContextOptions,
): Promise<AgentPromptContextBuildResult> {
	const sections: string[] = [];
	const warnings: string[] = [];
	let attachmentCount = 0;
	let searchResultCount = 0;

	if (options.conversationId && options.attachmentIds?.length) {
		try {
			const response = await attachmentResolverService.resolveContext({
				conversationId: options.conversationId,
				attachmentIds: options.attachmentIds,
				maxBytesPerAttachment: options.maxAttachmentBytes,
			});

			if (response.success && response.data) {
				attachmentCount = response.data.length;
				const section = formatAttachmentContext(response.data);
				if (section) sections.push(section);
			} else {
				warnings.push(response.error || "Failed to resolve attachments.");
			}
		} catch (error) {
			warnings.push(
				error instanceof Error ? error.message : "Failed to resolve attachments.",
			);
		}
	}

	if (options.searchEngine) {
		const config = options.searchConfigs?.find(
			(item) => item.provider === options.searchEngine && item.enabled,
		);

		if (!config) {
			warnings.push(`Search provider is not configured: ${options.searchEngine}`);
		} else {
			try {
				// E1: 只传 configId，主进程按其解密取用密钥（密钥不出主进程）。
				const response = await searchService.execute({
					provider: config.provider,
					query: options.content,
					configId: config.id,
					apiUrl: config.apiUrl,
					config: config.config,
					maxResults: options.maxSearchResults ?? 5,
				});

				if (response.success && response.data) {
					searchResultCount = response.data.results.length;
					const section = formatSearchContext(
						options.content,
						response.data.provider,
						response.data.results,
					);
					if (section) sections.push(section);
				} else {
					warnings.push(response.error || "Search failed.");
				}
			} catch (error) {
				warnings.push(error instanceof Error ? error.message : "Search failed.");
			}
		}
	}

	if (warnings.length > 0) {
		sections.push(
			`--- Context Warnings ---\n${warnings.map((warning) => `- ${warning}`).join("\n")}`,
		);
	}

	const prompt =
		sections.length > 0
			? `${sections.join("\n\n")}\n\n--- User Request ---\n${options.content}`
			: options.content;

	return {
		prompt,
		attachmentCount,
		searchResultCount,
		warnings,
	};
}
