/**
 * 内置插件定义
 * 包含市场元数据、清单和源代码
 */

// 市场插件元数据
export interface BuiltinMarketPlugin {
	id: string;
	name: string;
	displayName: string;
	description: string;
	version: string;
	author: string;
	icon?: string;
	categories: string[];
	downloads: number;
	rating: number;
	installed?: boolean;
}

// 内置市场插件列表
export const BUILTIN_MARKET_PLUGINS: BuiltinMarketPlugin[] = [
	{
		id: "prompt-templates",
		name: "prompt-templates",
		displayName: "Prompt Templates",
		description:
			"Curated AI prompt templates for common tasks: translate, summarize, code review, explain, fix grammar, write email, brainstorm, and refactor code.",
		version: "1.0.0",
		author: "Super Client Team",
		icon: "📝",
		categories: ["productivity", "prompts"],
		downloads: 12580,
		rating: 4.9,
	},
	{
		id: "builtin-themes",
		name: "builtin-themes",
		displayName: "Built-in Themes",
		description: "A collection of beautiful themes including Ocean Blue, Rose Gold, and Forest Green. Each theme supports both light and dark mode.",
		version: "1.0.0",
		author: "Super Client Team",
		icon: "🎨",
		categories: ["theme"],
		downloads: 20050,
		rating: 4.8,
	},
	{
		id: "markdown-themes",
		name: "markdown-themes",
		displayName: "Markdown Themes",
		description: "A collection of markdown rendering themes for chat messages. Includes Newsprint (serif), Vue Green, and Dracula styles.",
		version: "1.0.0",
		author: "Super Client Team",
		icon: "📖",
		categories: ["markdown"],
		downloads: 15200,
		rating: 4.7,
	},
];

// Prompt Templates 插件清单
export const PROMPT_TEMPLATES_MANIFEST = {
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

// Prompt Templates 插件源代码
export const PROMPT_TEMPLATES_SOURCE = `"use strict";

const TEMPLATES = [
  {
    id: "translate",
    command: "prompt-templates.translate",
    name: "Translate",
    description: "Translate text to a specified language",
    template: "Please translate the following text to {{language}}:\\n\\n{{text}}"
  },
  {
    id: "summarize",
    command: "prompt-templates.summarize",
    name: "Summarize",
    description: "Summarize content concisely",
    template: "Please summarize the following content in a concise manner, highlighting the key points:\\n\\n{{text}}"
  },
  {
    id: "codeReview",
    command: "prompt-templates.codeReview",
    name: "Code Review",
    description: "Review code for issues and improvements",
    template: "Please review the following code. Point out any bugs, security issues, performance problems, and suggest improvements:\\n\\n\\\`\\\`\\\`\\n{{code}}\\n\\\`\\\`\\\`"
  },
  {
    id: "explain",
    command: "prompt-templates.explain",
    name: "Explain",
    description: "Explain a concept or code in simple terms",
    template: "Please explain the following in simple, easy-to-understand terms:\\n\\n{{text}}"
  },
  {
    id: "fixGrammar",
    command: "prompt-templates.fixGrammar",
    name: "Fix Grammar",
    description: "Fix grammar and spelling errors",
    template: "Please fix any grammar, spelling, and punctuation errors in the following text. Only return the corrected text without explanations:\\n\\n{{text}}"
  },
  {
    id: "writeEmail",
    command: "prompt-templates.writeEmail",
    name: "Write Email",
    description: "Draft a professional email",
    template: "Please write a professional email with the following details:\\n\\nRecipient: {{recipient}}\\nSubject: {{subject}}\\nKey points: {{points}}"
  },
  {
    id: "brainstorm",
    command: "prompt-templates.brainstorm",
    name: "Brainstorm",
    description: "Brainstorm ideas on a topic",
    template: "Please brainstorm 10 creative ideas about the following topic. For each idea, provide a brief description:\\n\\nTopic: {{topic}}"
  },
  {
    id: "refactorCode",
    command: "prompt-templates.refactorCode",
    name: "Refactor Code",
    description: "Refactor code for better quality",
    template: "Please refactor the following code to improve readability, maintainability, and performance. Explain the changes you made:\\n\\n\\\`\\\`\\\`\\n{{code}}\\n\\\`\\\`\\\`"
  }
];

module.exports = {
  activate(context) {
    console.log("[Prompt Templates] Activating...");

    // Register list command
    context.commands.registerCommand("prompt-templates.list", function() {
      return TEMPLATES.map(function(t) {
        return { id: t.id, name: t.name, description: t.description, template: t.template };
      });
    });

    // Register individual template commands
    TEMPLATES.forEach(function(tmpl) {
      context.commands.registerCommand(tmpl.command, function() {
        return { id: tmpl.id, name: tmpl.name, description: tmpl.description, template: tmpl.template };
      });
    });

    console.log("[Prompt Templates] Activated with " + TEMPLATES.length + " templates");
  },
  deactivate() {
    console.log("[Prompt Templates] Deactivated");
  }
};
`;

// ============ 内置主题插件定义 ============

const THEMES_PLUGIN_ENTRY = `"use strict";
module.exports = {
  activate(context) {
    console.log("[Built-in Themes] Activated");
  },
  deactivate() {
    console.log("[Built-in Themes] Deactivated");
  }
};
`;

const BUILTIN_THEMES_MANIFEST = {
	name: "builtin-themes",
	displayName: "Built-in Themes",
	version: "1.0.0",
	description: "A collection of beautiful themes including Ocean Blue, Rose Gold, and Forest Green.",
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

const THEME_OCEAN_BLUE_CSS = `/* Ocean Blue Theme */
:root {
  --color-primary: #0969da;
  --color-primary-hover: #0550ae;
  --color-bg-layout: #f6f8fa;
  --color-bg-container: #ffffff;
  --color-border: #d0d7de;
  --color-text: #1f2328;
  --color-text-secondary: #656d76;
}

.dark {
  --color-primary: #58a6ff;
  --color-primary-hover: #79c0ff;
  --color-bg-layout: #0d1117;
  --color-bg-container: #161b22;
  --color-border: #30363d;
  --color-text: #e6edf3;
  --color-text-secondary: #8b949e;
}
`;

const THEME_OCEAN_BLUE_TOKENS = JSON.stringify({
	light: {
		token: {
			colorPrimary: "#0969da",
			colorInfo: "#0969da",
			colorLink: "#0969da",
			colorBgBase: "#ffffff",
			colorTextBase: "rgba(0, 0, 0, 0.88)",
		},
		components: {
			Layout: { headerBg: "#ffffff", siderBg: "#f6f8fa", triggerBg: "#ffffff", triggerColor: "rgba(0, 0, 0, 0.65)" },
			Card: { colorBgContainer: "#ffffff" },
			Input: { colorBgContainer: "#ffffff", colorBorder: "#d0d7de" },
			Select: { colorBgContainer: "#ffffff", colorBorder: "#d0d7de" },
			Button: { colorBgContainer: "#ffffff", colorBorder: "#d0d7de" },
			Modal: { contentBg: "#ffffff", headerBg: "#ffffff", footerBg: "#ffffff" },
			Drawer: { colorBgElevated: "#ffffff" },
			Table: { colorBgContainer: "#ffffff", headerBg: "#f6f8fa", borderColor: "#d0d7de" },
			Tooltip: { colorBgSpotlight: "rgba(0, 0, 0, 0.75)" },
			Popover: { colorBgElevated: "#ffffff" },
			Dropdown: { colorBgElevated: "#ffffff" },
		},
	},
	dark: {
		token: {
			colorPrimary: "#58a6ff",
			colorInfo: "#58a6ff",
			colorLink: "#58a6ff",
			colorBgBase: "#0d1117",
			colorTextBase: "rgba(255, 255, 255, 0.88)",
		},
		components: {
			Layout: { headerBg: "#161b22", siderBg: "#0d1117", triggerBg: "#1c2128", triggerColor: "rgba(255, 255, 255, 0.65)" },
			Card: { colorBgContainer: "#161b22" },
			Input: { colorBgContainer: "#0d1117", colorBorder: "#30363d" },
			Select: { colorBgContainer: "#0d1117", colorBorder: "#30363d" },
			Button: { colorBgContainer: "transparent", colorBorder: "#30363d" },
			Modal: { contentBg: "#161b22", headerBg: "#161b22", footerBg: "#161b22" },
			Drawer: { colorBgElevated: "#161b22" },
			Table: { colorBgContainer: "#161b22", headerBg: "#1c2128", borderColor: "#30363d" },
			Tooltip: { colorBgSpotlight: "#30363d" },
			Popover: { colorBgElevated: "#161b22" },
			Dropdown: { colorBgElevated: "#161b22" },
		},
	},
}, null, 2);

const THEME_ROSE_GOLD_CSS = `/* Rose Gold Theme */
:root {
  --color-primary: #d4507a;
  --color-primary-hover: #b83d64;
  --color-bg-layout: #fdf2f5;
  --color-bg-container: #ffffff;
  --color-border: #f0d0d9;
  --color-text: #2d1a22;
  --color-text-secondary: #8c6b78;
}

.dark {
  --color-primary: #e87da1;
  --color-primary-hover: #f09ab8;
  --color-bg-layout: #1a1015;
  --color-bg-container: #241820;
  --color-border: #3d2832;
  --color-text: #f0d8e0;
  --color-text-secondary: #b08898;
}
`;

const THEME_ROSE_GOLD_TOKENS = JSON.stringify({
	light: {
		token: {
			colorPrimary: "#d4507a",
			colorInfo: "#d4507a",
			colorLink: "#d4507a",
			colorBgBase: "#ffffff",
			colorTextBase: "rgba(0, 0, 0, 0.88)",
		},
		components: {
			Layout: { headerBg: "#ffffff", siderBg: "#fdf2f5", triggerBg: "#ffffff", triggerColor: "rgba(0, 0, 0, 0.65)" },
			Card: { colorBgContainer: "#ffffff" },
			Input: { colorBgContainer: "#ffffff", colorBorder: "#f0d0d9" },
			Select: { colorBgContainer: "#ffffff", colorBorder: "#f0d0d9" },
			Button: { colorBgContainer: "#ffffff", colorBorder: "#f0d0d9" },
			Modal: { contentBg: "#ffffff", headerBg: "#ffffff", footerBg: "#ffffff" },
			Drawer: { colorBgElevated: "#ffffff" },
			Table: { colorBgContainer: "#ffffff", headerBg: "#fdf2f5", borderColor: "#f0d0d9" },
			Tooltip: { colorBgSpotlight: "rgba(0, 0, 0, 0.75)" },
			Popover: { colorBgElevated: "#ffffff" },
			Dropdown: { colorBgElevated: "#ffffff" },
		},
	},
	dark: {
		token: {
			colorPrimary: "#e87da1",
			colorInfo: "#e87da1",
			colorLink: "#e87da1",
			colorBgBase: "#1a1015",
			colorTextBase: "rgba(255, 255, 255, 0.88)",
		},
		components: {
			Layout: { headerBg: "#241820", siderBg: "#1a1015", triggerBg: "#2a1e25", triggerColor: "rgba(255, 255, 255, 0.65)" },
			Card: { colorBgContainer: "#241820" },
			Input: { colorBgContainer: "#1a1015", colorBorder: "#3d2832" },
			Select: { colorBgContainer: "#1a1015", colorBorder: "#3d2832" },
			Button: { colorBgContainer: "transparent", colorBorder: "#3d2832" },
			Modal: { contentBg: "#241820", headerBg: "#241820", footerBg: "#241820" },
			Drawer: { colorBgElevated: "#241820" },
			Table: { colorBgContainer: "#241820", headerBg: "#2a1e25", borderColor: "#3d2832" },
			Tooltip: { colorBgSpotlight: "#3d2832" },
			Popover: { colorBgElevated: "#241820" },
			Dropdown: { colorBgElevated: "#241820" },
		},
	},
}, null, 2);

const THEME_FOREST_GREEN_CSS = `/* Forest Green Theme */
:root {
  --color-primary: #2da44e;
  --color-primary-hover: #218838;
  --color-bg-layout: #f0f7f2;
  --color-bg-container: #ffffff;
  --color-border: #c5deca;
  --color-text: #1a2e1f;
  --color-text-secondary: #5a7a62;
}

.dark {
  --color-primary: #3fb950;
  --color-primary-hover: #56d364;
  --color-bg-layout: #0d1510;
  --color-bg-container: #141f18;
  --color-border: #263d2e;
  --color-text: #d0f0d8;
  --color-text-secondary: #7eb88a;
}
`;

const THEME_FOREST_GREEN_TOKENS = JSON.stringify({
	light: {
		token: {
			colorPrimary: "#2da44e",
			colorInfo: "#2da44e",
			colorLink: "#2da44e",
			colorBgBase: "#ffffff",
			colorTextBase: "rgba(0, 0, 0, 0.88)",
		},
		components: {
			Layout: { headerBg: "#ffffff", siderBg: "#f0f7f2", triggerBg: "#ffffff", triggerColor: "rgba(0, 0, 0, 0.65)" },
			Card: { colorBgContainer: "#ffffff" },
			Input: { colorBgContainer: "#ffffff", colorBorder: "#c5deca" },
			Select: { colorBgContainer: "#ffffff", colorBorder: "#c5deca" },
			Button: { colorBgContainer: "#ffffff", colorBorder: "#c5deca" },
			Modal: { contentBg: "#ffffff", headerBg: "#ffffff", footerBg: "#ffffff" },
			Drawer: { colorBgElevated: "#ffffff" },
			Table: { colorBgContainer: "#ffffff", headerBg: "#f0f7f2", borderColor: "#c5deca" },
			Tooltip: { colorBgSpotlight: "rgba(0, 0, 0, 0.75)" },
			Popover: { colorBgElevated: "#ffffff" },
			Dropdown: { colorBgElevated: "#ffffff" },
		},
	},
	dark: {
		token: {
			colorPrimary: "#3fb950",
			colorInfo: "#3fb950",
			colorLink: "#3fb950",
			colorBgBase: "#0d1510",
			colorTextBase: "rgba(255, 255, 255, 0.88)",
		},
		components: {
			Layout: { headerBg: "#141f18", siderBg: "#0d1510", triggerBg: "#1a2b20", triggerColor: "rgba(255, 255, 255, 0.65)" },
			Card: { colorBgContainer: "#141f18" },
			Input: { colorBgContainer: "#0d1510", colorBorder: "#263d2e" },
			Select: { colorBgContainer: "#0d1510", colorBorder: "#263d2e" },
			Button: { colorBgContainer: "transparent", colorBorder: "#263d2e" },
			Modal: { contentBg: "#141f18", headerBg: "#141f18", footerBg: "#141f18" },
			Drawer: { colorBgElevated: "#141f18" },
			Table: { colorBgContainer: "#141f18", headerBg: "#1a2b20", borderColor: "#263d2e" },
			Tooltip: { colorBgSpotlight: "#263d2e" },
			Popover: { colorBgElevated: "#141f18" },
			Dropdown: { colorBgElevated: "#141f18" },
		},
	},
}, null, 2);

// ============ Markdown 主题插件定义 ============

const MARKDOWN_THEMES_ENTRY = `"use strict";
module.exports = {
  activate(context) {
    console.log("[Markdown Themes] Activated");
  },
  deactivate() {
    console.log("[Markdown Themes] Deactivated");
  }
};
`;

const MARKDOWN_THEMES_MANIFEST = {
	name: "markdown-themes",
	displayName: "Markdown Themes",
	version: "1.0.0",
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
		],
	},
};

// Newsprint: serif/newspaper typography with warm tones
const MARKDOWN_NEWSPRINT_CSS = `/* Newsprint Markdown Theme */
.x-markdown {
  --md-font-mono: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
  --md-border-color: #c8c0b8;
  --md-border-color-muted: #d8d0c8;
  --md-fg-default: #2c2416;
  --md-fg-muted: #6b5d4d;
  --md-bg-subtle: #f5f0e8;
  --md-accent-fg: #8b4513;
  --md-accent-emphasis: #6b3410;
  --md-danger-fg: #b22222;
  --md-neutral-muted: rgba(139, 119, 101, 0.15);
  font-family: Georgia, "Times New Roman", "Noto Serif", serif;
  line-height: 1.7;
}

.dark .x-markdown {
  --md-border-color: #4a4038;
  --md-border-color-muted: #3a3228;
  --md-fg-default: #e8dfd5;
  --md-fg-muted: #a8998a;
  --md-bg-subtle: #1e1a15;
  --md-accent-fg: #d4a574;
  --md-accent-emphasis: #e8b888;
  --md-danger-fg: #e87070;
  --md-neutral-muted: rgba(168, 153, 138, 0.25);
}

.x-markdown h1,
.x-markdown h2,
.x-markdown h3,
.x-markdown h4,
.x-markdown h5,
.x-markdown h6 {
  font-family: Georgia, "Times New Roman", serif;
  letter-spacing: -0.02em;
}

.x-markdown h1 { border-bottom-style: double; border-bottom-width: 3px; }
.x-markdown h2 { border-bottom-style: solid; border-bottom-width: 1px; }

.x-markdown blockquote {
  border-left-width: 3px;
  font-style: italic;
}
`;

// Vue Green: VuePress/VitePress documentation style
const MARKDOWN_VUE_GREEN_CSS = `/* Vue Green Markdown Theme */
.x-markdown {
  --md-font-mono: "JetBrains Mono", "Fira Code", ui-monospace, SFMono-Regular, monospace;
  --md-border-color: #c2d6c8;
  --md-border-color-muted: #d4e4d8;
  --md-fg-default: #213547;
  --md-fg-muted: #476582;
  --md-bg-subtle: #f1f8f3;
  --md-accent-fg: #42b883;
  --md-accent-emphasis: #33a06f;
  --md-danger-fg: #ed3c50;
  --md-neutral-muted: rgba(66, 184, 131, 0.08);
}

.dark .x-markdown {
  --md-border-color: #2e3f35;
  --md-border-color-muted: #283830;
  --md-fg-default: #d4e6dc;
  --md-fg-muted: #8ba89a;
  --md-bg-subtle: #0e1812;
  --md-accent-fg: #42d392;
  --md-accent-emphasis: #5ee8a8;
  --md-danger-fg: #ff6b6b;
  --md-neutral-muted: rgba(66, 211, 146, 0.1);
}

.x-markdown pre {
  border: 1px solid var(--md-border-color-muted);
}

.x-markdown :not(pre) > code {
  color: var(--md-accent-fg);
  background: var(--md-neutral-muted);
}

.x-markdown blockquote {
  border-left-color: var(--md-accent-fg);
  background: var(--md-neutral-muted);
  border-radius: 0 6px 6px 0;
  padding: 4px 16px;
}

.x-markdown a { font-weight: 500; }
.x-markdown a:hover { color: var(--md-accent-emphasis); }
`;

// Dracula: popular dark-friendly color scheme
const MARKDOWN_DRACULA_CSS = `/* Dracula Markdown Theme */
.x-markdown {
  --md-font-mono: "Fira Code", "JetBrains Mono", ui-monospace, SFMono-Regular, monospace;
  --md-border-color: #6272a4;
  --md-border-color-muted: #44475a;
  --md-fg-default: #f8f8f2;
  --md-fg-muted: #b0b8d1;
  --md-bg-subtle: #282a36;
  --md-accent-fg: #bd93f9;
  --md-accent-emphasis: #ff79c6;
  --md-danger-fg: #ff5555;
  --md-neutral-muted: rgba(68, 71, 90, 0.6);
  color: #f8f8f2;
}

.dark .x-markdown {
  --md-border-color: #6272a4;
  --md-border-color-muted: #44475a;
  --md-fg-default: #f8f8f2;
  --md-fg-muted: #b0b8d1;
  --md-bg-subtle: #21222c;
  --md-accent-fg: #bd93f9;
  --md-accent-emphasis: #ff79c6;
  --md-danger-fg: #ff5555;
  --md-neutral-muted: rgba(68, 71, 90, 0.6);
}

.x-markdown pre {
  background: #282a36;
  border: 1px solid #44475a;
}

.x-markdown :not(pre) > code {
  color: #50fa7b;
  background: rgba(68, 71, 90, 0.5);
}

.x-markdown h1,
.x-markdown h2 {
  border-bottom-color: #6272a4;
}

.x-markdown a { color: #8be9fd; }
.x-markdown a:hover { color: #ff79c6; }

.x-markdown strong { color: #ffb86c; }

.x-markdown blockquote {
  border-left-color: #bd93f9;
  color: #b0b8d1;
}

.x-markdown table:not(pre table) th {
  background: #44475a;
}

.x-markdown table:not(pre table) tr:nth-child(2n) {
  background-color: rgba(68, 71, 90, 0.3);
}
`;

// Map of builtin plugin IDs to their manifest and source
export const BUILTIN_PLUGIN_SOURCES: Record<
	string,
	{ manifest: Record<string, unknown>; source: string; extraFiles?: Record<string, string> }
> = {
	"prompt-templates": {
		manifest: PROMPT_TEMPLATES_MANIFEST,
		source: PROMPT_TEMPLATES_SOURCE,
	},
	"builtin-themes": {
		manifest: BUILTIN_THEMES_MANIFEST,
		source: THEMES_PLUGIN_ENTRY,
		extraFiles: {
			"ocean-blue.css": THEME_OCEAN_BLUE_CSS,
			"ocean-blue.tokens.json": THEME_OCEAN_BLUE_TOKENS,
			"rose-gold.css": THEME_ROSE_GOLD_CSS,
			"rose-gold.tokens.json": THEME_ROSE_GOLD_TOKENS,
			"forest-green.css": THEME_FOREST_GREEN_CSS,
			"forest-green.tokens.json": THEME_FOREST_GREEN_TOKENS,
		},
	},
	"markdown-themes": {
		manifest: MARKDOWN_THEMES_MANIFEST,
		source: MARKDOWN_THEMES_ENTRY,
		extraFiles: {
			"newsprint.css": MARKDOWN_NEWSPRINT_CSS,
			"vue-green.css": MARKDOWN_VUE_GREEN_CSS,
			"dracula.css": MARKDOWN_DRACULA_CSS,
		},
	},
};
