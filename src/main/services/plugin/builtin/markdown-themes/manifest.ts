export const manifest = {
	name: "markdown-themes",
	displayName: "Markdown Themes",
	version: "1.1.0",
	description: "A collection of markdown rendering themes for chat messages.",
	author: "Super Client Team",
	main: "index.js",
	icon: "📖",
	categories: ["markdown"],
	engines: { "super-client-r": "^1.0.0" },
	contributes: {
		themes: [
			{
				id: "newsprint",
				label: "Newsprint",
				icon: "📰",
				style: "newsprint.css",
			},
			{
				id: "vue-green",
				label: "Vue Green",
				icon: "💚",
				style: "vue-green.css",
			},
			{
				id: "dracula",
				label: "Dracula",
				icon: "🧛",
				style: "dracula.css",
			},
			{
				id: "solarized-light",
				label: "Solarized Light",
				icon: "☀️",
				style: "solarized-light.css",
			},
			{
				id: "nord",
				label: "Nord",
				icon: "❄️",
				style: "nord.css",
			},
			{
				id: "monokai",
				label: "Monokai",
				icon: "🎨",
				style: "monokai.css",
			},
			{
				id: "github-dimmed",
				label: "GitHub Dimmed",
				icon: "🌙",
				style: "github-dimmed.css",
			},
			{
				id: "one-dark",
				label: "One Dark",
				icon: "🔮",
				style: "one-dark.css",
			},
		],
	},
};
