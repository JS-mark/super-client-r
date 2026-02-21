export const css = `/* One Dark Markdown Theme */
.x-markdown {
  --md-font-mono: "JetBrains Mono", "Fira Code", ui-monospace, SFMono-Regular, monospace;
  --md-border-color: #3e4451;
  --md-border-color-muted: #2c313a;
  --md-fg-default: #abb2bf;
  --md-fg-muted: #7f848e;
  --md-bg-subtle: #282c34;
  --md-accent-fg: #61afef;
  --md-accent-emphasis: #c678dd;
  --md-danger-fg: #e06c75;
  --md-neutral-muted: rgba(62, 68, 81, 0.5);
  color: #abb2bf;
}

.dark .x-markdown {
  --md-border-color: #3e4451;
  --md-border-color-muted: #2c313a;
  --md-fg-default: #abb2bf;
  --md-fg-muted: #7f848e;
  --md-bg-subtle: #21252b;
  --md-accent-fg: #61afef;
  --md-accent-emphasis: #c678dd;
  --md-danger-fg: #e06c75;
  --md-neutral-muted: rgba(44, 49, 58, 0.6);
}

.x-markdown pre {
  background: #282c34;
  border: 1px solid #3e4451;
}

.x-markdown :not(pre) > code {
  color: #98c379;
  background: rgba(62, 68, 81, 0.5);
}

.x-markdown a { color: #61afef; }
.x-markdown a:hover { color: #c678dd; }
.x-markdown strong { color: #e5c07b; }

.x-markdown h1,
.x-markdown h2 {
  border-bottom-color: #3e4451;
}

.x-markdown blockquote {
  border-left-color: #c678dd;
  color: #7f848e;
}

.x-markdown table:not(pre table) th { background: #2c313a; }
.x-markdown table:not(pre table) tr:nth-child(2n) { background-color: rgba(44, 49, 58, 0.4); }
`;
