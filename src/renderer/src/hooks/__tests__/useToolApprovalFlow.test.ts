import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Message } from "../../stores/chatMessageStore";
import {
	buildToolApprovalPatch,
	createRespondToApproval,
	resolveToolApproval,
	type ToolApprovalFlowDeps,
} from "../useToolApprovalFlow";

describe("tool approval flow helpers", () => {
	it("builds an optimistic approve patch with updated input", () => {
		const patch = buildToolApprovalPatch({
			toolCallId: "call_1",
			approved: true,
			updatedInput: { path: "src/App.tsx" },
		});

		expect(patch).toEqual({
			messageId: "tool_call_1",
			patch: {
				status: "pending",
				result: { path: "src/App.tsx" },
			},
		});
	});

	it("builds a reject patch", () => {
		const patch = buildToolApprovalPatch({
			toolCallId: "call_1",
			approved: false,
			updatedInput: { ignored: true },
		});

		expect(patch).toEqual({
			messageId: "tool_call_1",
			patch: {
				status: "error",
				error: "Tool call rejected by user",
			},
		});
	});

	it("preserves AskUserQuestion answers on approval.userAnswers", () => {
		const answers = {
			"Which mode?": "Safe",
			"Which scopes?": "UI, Main",
		};

		const patch = buildToolApprovalPatch({
			toolCallId: "ask_1",
			approved: true,
			updatedInput: {
				questions: [{ question: "Which mode?" }],
				answers,
			},
			existingToolCall: {
				id: "ask_1",
				name: "AskUserQuestion",
				input: {},
				status: "awaiting_approval",
				approval: {
					kind: "ask-user-question",
					title: "Need input",
				},
			},
		});

		expect(patch.patch).toEqual({
			status: "pending",
			result: {
				questions: [{ question: "Which mode?" }],
				answers,
			},
			approval: {
				kind: "ask-user-question",
				title: "Need input",
				userAnswers: answers,
			},
		});
	});
});

describe("resolveToolApproval", () => {
	it("calls the Agent SDK resolver when the request is SDK-backed", async () => {
		const resolveAgentSDKPermission = vi.fn().mockResolvedValue(true);
		const resolveLegacyApproval = vi.fn().mockResolvedValue(true);
		const updatedInput = { path: "README.md" };
		const updatedPermissions = [{ scope: "session" }];

		await resolveToolApproval(
			{
				isAgentSDKRequest: () => true,
				resolveAgentSDKPermission,
				resolveLegacyApproval,
			},
			{
				toolCallId: "call_1",
				approved: true,
				updatedInput,
				updatedPermissions,
			},
		);

		expect(resolveAgentSDKPermission).toHaveBeenCalledWith(
			"call_1",
			true,
			updatedInput,
			updatedPermissions,
		);
		expect(resolveLegacyApproval).not.toHaveBeenCalled();
	});

	it("calls the legacy resolver when the request is not SDK-backed", async () => {
		const resolveAgentSDKPermission = vi.fn().mockResolvedValue(true);
		const resolveLegacyApproval = vi.fn().mockResolvedValue(true);
		const updatedInput = { answers: { Question: "Answer" } };

		await resolveToolApproval(
			{
				isAgentSDKRequest: () => false,
				resolveAgentSDKPermission,
				resolveLegacyApproval,
			},
			{
				toolCallId: "call_2",
				approved: false,
				updatedInput,
			},
		);

		expect(resolveLegacyApproval).toHaveBeenCalledWith(
			"call_2",
			false,
			updatedInput,
		);
		expect(resolveAgentSDKPermission).not.toHaveBeenCalled();
	});
});

describe("createRespondToApproval", () => {
	let messages: Message[];
	let deps: ToolApprovalFlowDeps;

	beforeEach(() => {
		messages = [
			{
				id: "tool_call_1",
				role: "tool",
				content: "Using tool",
				timestamp: 1,
				type: "tool_use",
				toolCall: {
					id: "call_1",
					name: "Read",
					input: { file: "a.ts" },
					status: "awaiting_approval",
				},
			},
		];
		deps = {
			getSessionStatus: vi.fn(() => "streaming"),
			hasCurrentRequest: vi.fn(() => true),
			setAwaitingUserApproval: vi.fn(),
			kickWatchdog: vi.fn(),
			getMessages: vi.fn(() => messages),
			updateMessageToolCall: vi.fn(),
			isAgentSDKRequest: vi.fn(() => false),
			resolveAgentSDKPermission: vi.fn().mockResolvedValue(true),
			resolveLegacyApproval: vi.fn().mockResolvedValue(true),
			onResolveError: vi.fn(),
		};
	});

	it("resumes the watchdog, applies the optimistic patch, then resolves", async () => {
		const respondToApproval = createRespondToApproval(deps);

		await respondToApproval("call_1", true, { file: "b.ts" });

		expect(deps.setAwaitingUserApproval).toHaveBeenCalledWith(false);
		expect(deps.kickWatchdog).toHaveBeenCalledTimes(1);
		expect(deps.updateMessageToolCall).toHaveBeenCalledWith("tool_call_1", {
			status: "pending",
			result: { file: "b.ts" },
		});
		expect(deps.resolveLegacyApproval).toHaveBeenCalledWith(
			"call_1",
			true,
			{ file: "b.ts" },
		);
	});
});
