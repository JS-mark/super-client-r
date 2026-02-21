export const css = `/* GitHub Dimmed Markdown Theme */
.x-markdown {
  --md-font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  --md-border-color: #444c56;
  --md-border-color-muted: #373e47;
  --md-fg-default: #adbac7;
  --md-fg-muted: #768390;
  --md-bg-subtle: #2d333b;
  --md-accent-fg: #539bf5;
  --md-accent-emphasis: #539bf5;
  --md-danger-fg: #e5534b;
  --md-neutral-muted: rgba(99, 110, 123, 0.25);
}

.dark .x-markdown {
  --md-border-color: #444c56;
  --md-border-color-muted: #373e47;
  --md-fg-default: #adbac7;
  --md-fg-muted: #768390;
  --md-bg-subtle: #22272e;
  --md-accent-fg: #539bf5;
  --md-accent-emphasis: #6cb6ff;
  --md-danger-fg: #e5534b;
  --md-neutral-muted: rgba(99, 110, 123, 0.3);
}

.x-markdown :not(pre) > code {
  color: var(--md-accent-fg);
  background: var(--md-neutral-muted);
}

.x-markdown pre {
  background: #22272e;
  border: 1px solid var(--md-border-color-muted);
}

.x-markdown blockquote {
  border-left-color: #444c56;
  color: var(--md-fg-muted);
}
`;
