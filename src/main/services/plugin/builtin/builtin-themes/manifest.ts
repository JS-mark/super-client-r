export const manifest = {
	name: "builtin-themes",
	displayName: "Built-in Themes",
	version: "1.0.0",
	description:
		"A collection of beautiful themes including Ocean Blue, Rose Gold, and Forest Green.",
	author: "Super Client Team",
	main: "index.js",
	icon: "🎨",
	categories: ["theme"],
	engines: { "super-client-r": "^1.0.0" },
	contributes: {
		themes: [
			{
				id: "ocean-blue",
				label: "Ocean Blue",
				icon: "🌊",
				style: "ocean-blue.css",
				antdTokens: "ocean-blue.tokens.json",
			},
			{
				id: "rose-gold",
				label: "Rose Gold",
				icon: "🌸",
				style: "rose-gold.css",
				antdTokens: "rose-gold.tokens.json",
			},
			{
				id: "forest-green",
				label: "Forest Green",
				icon: "🌿",
				style: "forest-green.css",
				antdTokens: "forest-green.tokens.json",
			},
		],
	},
};
