/**
 * Project / Session 重设计 B-1 — main-side wrapper.
 *
 * 实际转换逻辑已移至 `@super-client/shared-types/messageConverter` 让 renderer
 * 也能用（D-1 写路径需要相同转换）。本文件保留 `convertChatMessage*` 名字
 * 仅作向后兼容；新代码直接 import shared-types。
 */

import type { ChatMessagePersist } from "@super-client/shared-types/chat";
import type { SessionEvent } from "@super-client/shared-types/project";
import {
	messageToEvents,
	messagesToEvents,
} from "@super-client/shared-types/messageConverter";

export function convertChatMessageToEvents(
	msg: ChatMessagePersist,
): SessionEvent[] {
	return messageToEvents(msg);
}

export function convertChatMessagesToEvents(
	msgs: ChatMessagePersist[],
): SessionEvent[] {
	return messagesToEvents(msgs);
}
