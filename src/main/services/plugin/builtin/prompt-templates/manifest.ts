export const manifest = {
	name: "prompt-templates",
	displayName: "Prompt Templates",
	version: "1.0.0",
	description:
		"Curated AI prompt templates for common tasks: translate, summarize, code review, explain, fix grammar, write email, brainstorm, and refactor code.",
	author: "Super Client Team",
	main: "index.js",
	icon: "📝",
	categories: ["productivity", "prompts"],
	engines: { "super-client-r": "^1.0.0" },
	activationEvents: ["onStartup"],
	contributes: {
		commands: [
			{
				command: "prompt-templates.list",
				title: "List Templates",
				category: "Prompt Templates",
			},
			{
				command: "prompt-templates.translate",
				title: "Translate",
				category: "Prompt Templates",
			},
			{
				command: "prompt-templates.summarize",
				title: "Summarize",
				category: "Prompt Templates",
			},
			{
				command: "prompt-templates.codeReview",
				title: "Code Review",
				category: "Prompt Templates",
			},
			{
				command: "prompt-templates.explain",
				title: "Explain",
				category: "Prompt Templates",
			},
			{
				command: "prompt-templates.fixGrammar",
				title: "Fix Grammar",
				category: "Prompt Templates",
			},
			{
				command: "prompt-templates.writeEmail",
				title: "Write Email",
				category: "Prompt Templates",
			},
			{
				command: "prompt-templates.brainstorm",
				title: "Brainstorm",
				category: "Prompt Templates",
			},
			{
				command: "prompt-templates.refactorCode",
				title: "Refactor Code",
				category: "Prompt Templates",
			},
		],
	},
};
