export const css = `/* Dracula Markdown Theme */
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
