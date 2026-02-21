export const css = `/* Vue Green Markdown Theme */
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
