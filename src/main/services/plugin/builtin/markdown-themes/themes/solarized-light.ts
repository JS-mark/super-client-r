export const css = `/* Solarized Light Markdown Theme */
.x-markdown {
  --md-font-mono: "Source Code Pro", ui-monospace, SFMono-Regular, monospace;
  --md-border-color: #d3cfc2;
  --md-border-color-muted: #e8e4d8;
  --md-fg-default: #586e75;
  --md-fg-muted: #93a1a1;
  --md-bg-subtle: #eee8d5;
  --md-accent-fg: #268bd2;
  --md-accent-emphasis: #2aa198;
  --md-danger-fg: #dc322f;
  --md-neutral-muted: rgba(147, 161, 161, 0.15);
  line-height: 1.65;
}

.dark .x-markdown {
  --md-border-color: #3a4a50;
  --md-border-color-muted: #2c3a40;
  --md-fg-default: #93a1a1;
  --md-fg-muted: #657b83;
  --md-bg-subtle: #073642;
  --md-accent-fg: #268bd2;
  --md-accent-emphasis: #2aa198;
  --md-danger-fg: #dc322f;
  --md-neutral-muted: rgba(101, 123, 131, 0.2);
}

.x-markdown :not(pre) > code {
  color: #d33682;
  background: var(--md-neutral-muted);
}

.dark .x-markdown :not(pre) > code {
  color: #d33682;
}

.x-markdown a { color: #268bd2; }
.x-markdown a:hover { color: #2aa198; }
.x-markdown strong { color: #073642; }
.dark .x-markdown strong { color: #fdf6e3; }
`;
