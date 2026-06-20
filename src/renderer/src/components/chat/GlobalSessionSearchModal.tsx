import type { ConversationSummary } from "../../types/electron";

/**
 * 过滤 conversation 列表：title + preview 包含 query（不区分大小写）。
 * 空 query 返回全部。
 */
export function filterConversations(
	list: ConversationSummary[],
	query: string,
): ConversationSummary[] {
	const q = query.trim().toLowerCase();
	if (!q) return list;
	return list.filter((conv) => {
		const title = (conv.name ?? "").toLowerCase();
		const preview = (conv.preview ?? "").toLowerCase();
		return title.includes(q) || preview.includes(q);
	});
}
