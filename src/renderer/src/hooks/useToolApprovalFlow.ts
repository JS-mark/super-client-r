import { useCallback } from "react";
import type { Message, ToolCall } from "../stores/chatMessageStore";

export type ToolApprovalUpdatedInput = Record<string, unknown>;
export type ToolApprovalUpdatedPermissions = Array<Record<string, unknown>>;

export interface ToolApprovalDecision {
	toolCallId: string;
	approved: boolean;
	updatedInput?: ToolApprovalUpdatedInput;
	updatedPermissions?: ToolApprovalUpdatedPermissions;
}

export interface ToolApprovalPatchContext {
	toolCallId: string;
	approved: boolean;
	updatedInput?: ToolApprovalUpdatedInput;
	existingToolCall?: ToolCall;
}

export interface ToolApprovalPatchResult {
	messageId: string;
	patch: Partial<ToolCall>;
}

export interface ToolApprovalResolverDeps {
	isAgentSDKRequest: () => boolean;
	resolveAgentSDKPermission: (
		toolCallId: string,
		approved: boolean,
		updatedInput?: ToolApprovalUpdatedInput,
		updatedPermissions?: ToolApprovalUpdatedPermissions,
	) => Promise<unknown>;
	resolveLegacyApproval: (
		toolCallId: string,
		approved: boolean,
		updatedInput?: ToolApprovalUpdatedInput,
	) => Promise<unknown>;
}

export interface ToolApprovalFlowDeps extends ToolApprovalResolverDeps {
	getSessionStatus: () => string;
	hasCurrentRequest: () => boolean;
	setAwaitingUserApproval: (awaiting: boolean) => void;
	kickWatchdog: () => void;
	getMessages: () => Message[];
	updateMessageToolCall: (
		messageId: string,
		toolCall: Partial<ToolCall>,
	) => void;
	onResolveError?: (error: unknown) => void;
}

function getAskUserQuestionAnswers(
	updatedInput?: ToolApprovalUpdatedInput,
): Record<string, string> | undefined {
	if (
		!updatedInput ||
		typeof updatedInput !== "object" ||
		!("answers" in updatedInput)
	) {
		return undefined;
	}
	const answers = updatedInput.answers;
	if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
		return undefined;
	}
	return answers as Record<string, string>;
}

export function buildToolApprovalPatch({
	toolCallId,
	approved,
	updatedInput,
	existingToolCall,
}: ToolApprovalPatchContext): ToolApprovalPatchResult {
	const messageId = `tool_${toolCallId}`;

	if (!approved) {
		return {
			messageId,
			patch: {
				status: "error",
				error: "Tool call rejected by user",
			},
		};
	}

	const userAnswers = getAskUserQuestionAnswers(updatedInput);
	return {
		messageId,
		patch: {
			status: "pending",
			...(updatedInput ? { result: updatedInput } : {}),
			...(userAnswers
				? {
						approval: {
							...existingToolCall?.approval,
							userAnswers,
						},
					}
				: {}),
		},
	};
}

export async function resolveToolApproval(
	deps: ToolApprovalResolverDeps,
	decision: ToolApprovalDecision,
): Promise<void> {
	const {
		toolCallId,
		approved,
		updatedInput,
		updatedPermissions,
	} = decision;

	if (deps.isAgentSDKRequest()) {
		await deps.resolveAgentSDKPermission(
			toolCallId,
			approved,
			updatedInput,
			updatedPermissions,
		);
		return;
	}

	await deps.resolveLegacyApproval(toolCallId, approved, updatedInput);
}

export function createRespondToApproval(deps: ToolApprovalFlowDeps) {
	return async (
		toolCallId: string,
		approved: boolean,
		updatedInput?: ToolApprovalUpdatedInput,
		updatedPermissions?: ToolApprovalUpdatedPermissions,
	): Promise<void> => {
		deps.setAwaitingUserApproval(false);
		if (deps.getSessionStatus() !== "idle" && deps.hasCurrentRequest()) {
			deps.kickWatchdog();
		}

		const messageId = `tool_${toolCallId}`;
		const existingToolCall = deps.getMessages().find((m) => m.id === messageId)
			?.toolCall;
		const patch = buildToolApprovalPatch({
			toolCallId,
			approved,
			updatedInput,
			existingToolCall,
		});
		deps.updateMessageToolCall(patch.messageId, patch.patch);

		try {
			await resolveToolApproval(deps, {
				toolCallId,
				approved,
				updatedInput,
				updatedPermissions,
			});
		} catch (error) {
			deps.onResolveError?.(error);
		}
	};
}

export function useToolApprovalFlow(deps: ToolApprovalFlowDeps) {
	return useCallback(createRespondToApproval(deps), [deps]);
}
