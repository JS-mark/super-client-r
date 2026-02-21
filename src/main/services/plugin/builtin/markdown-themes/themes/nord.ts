export const css = `/* Nord Markdown Theme */
.x-markdown {
  --md-font-mono: "JetBrains Mono", "Fira Code", ui-monospace, SFMono-Regular, monospace;
  --md-border-color: #d8dee9;
  --md-border-color-muted: #e5e9f0;
  --md-fg-default: #2e3440;
  --md-fg-muted: #4c566a;
  --md-bg-subtle: #eceff4;
  --md-accent-fg: #5e81ac;
  --md-accent-emphasis: #81a1c1;
  --md-danger-fg: #bf616a;
  --md-neutral-muted: rgba(76, 86, 106, 0.1);
}

.dark .x-markdown {
  --md-border-color: #3b4252;
  --md-border-color-muted: #434c5e;
  --md-fg-default: #d8dee9;
  --md-fg-muted: #8690a3;
  --md-bg-subtle: #2e3440;
  --md-accent-fg: #88c0d0;
  --md-accent-emphasis: #81a1c1;
  --md-danger-fg: #bf616a;
  --md-neutral-muted: rgba(67, 76, 94, 0.5);
}

.x-markdown :not(pre) > code {
  color: #a3be8c;
  background: var(--md-neutral-muted);
}

.x-markdown pre {
  border: 1px solid var(--md-border-color-muted);
}

.x-markdown strong { color: #2e3440; }
.dark .x-markdown strong { color: #eceff4; }
.x-markdown blockquote { border-left-color: #81a1c1; }
`;
