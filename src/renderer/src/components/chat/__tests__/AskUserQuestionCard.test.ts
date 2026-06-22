import { describe, expect, it } from "vitest";
import {
	buildAskUserQuestionOutput,
	isAskUserQuestionComplete,
	type QuestionAnswer,
} from "../AskUserQuestionCard";

const questions = [
	{
		header: "Mode",
		question: "Which mode?",
		multiSelect: false,
		options: [
			{ label: "Fast", description: "Move quickly" },
			{ label: "Safe", description: "Check first", preview: "Run checks" },
		],
	},
	{
		header: "Scope",
		question: "Which scopes?",
		multiSelect: true,
		options: [
			{ label: "UI", description: "Renderer changes" },
			{ label: "Main", description: "Main process changes" },
		],
	},
];

describe("AskUserQuestionCard helpers", () => {
	it("requires every question to be answered", () => {
		const answers = new Map<number, QuestionAnswer>([
			[0, { selected: [1], otherText: "" }],
		]);

		expect(isAskUserQuestionComplete(questions, answers)).toBe(false);
		answers.set(1, { selected: [0, 1], otherText: "" });
		expect(isAskUserQuestionComplete(questions, answers)).toBe(true);
	});

	it("requires Other text when Other is selected", () => {
		const answers = new Map<number, QuestionAnswer>([
			[0, { selected: [-1], otherText: "" }],
			[1, { selected: [0], otherText: "" }],
		]);

		expect(isAskUserQuestionComplete(questions, answers)).toBe(false);
		answers.set(0, { selected: [-1], otherText: "Use existing pattern" });
		expect(isAskUserQuestionComplete(questions, answers)).toBe(true);
	});

	it("builds SDK-compatible output with questions and answers", () => {
		const answers = new Map<number, QuestionAnswer>([
			[0, { selected: [1], otherText: "" }],
			[1, { selected: [0, 1], otherText: "" }],
		]);

		expect(buildAskUserQuestionOutput(questions, answers)).toEqual({
			questions,
			answers: {
				"Which mode?": "Safe",
				"Which scopes?": "UI, Main",
			},
		});
	});
});
