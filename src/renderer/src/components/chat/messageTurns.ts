import type { Message, MessagePart } from "@super-client/shared-types/chat";
import { messageToParts } from "./messagePartsAdapter";

export interface UserMessageTurn {
	id: string;
	type: "user";
	message: Message;
	parts: MessagePart[];
	hasPendingInteraction: boolean;
}

export interface AssistantMessageTurn {
	id: string;
	type: "ai";
	messages: Message[];
	parts: MessagePart[];
	hasPendingInteraction: boolean;
}

export type MessageTurn = UserMessageTurn | AssistantMessageTurn;

function hasPendingPart(parts: MessagePart[]): boolean {
	return parts.some(
		(part) =>
			part.state === "requires-approval" ||
			(part.type === "tool" &&
				part.approval?.kind === "ask-user-question" &&
				part.state !== "complete" &&
				part.state !== "denied" &&
				part.state !== "error"),
	);
}

export function buildMessageTurns(messages: Message[]): MessageTurn[] {
	const turns: MessageTurn[] = [];
	let currentAiMessages: Message[] | null = null;

	const flushAiTurn = () => {
		if (!currentAiMessages?.length) return;
		const parts = currentAiMessages.flatMap(messageToParts);
		turns.push({
			id: currentAiMessages[0].id,
			type: "ai",
			messages: currentAiMessages,
			parts,
			hasPendingInteraction: hasPendingPart(parts),
		});
		currentAiMessages = null;
	};

	for (const message of messages) {
		if (message.role === "system") continue;

		if (message.role === "user") {
			flushAiTurn();
			const parts = messageToParts(message);
			turns.push({
				id: message.id,
				type: "user",
				message,
				parts,
				hasPendingInteraction: hasPendingPart(parts),
			});
			continue;
		}

		if (!currentAiMessages) currentAiMessages = [];
		currentAiMessages.push(message);
	}

	flushAiTurn();
	return turns;
}

