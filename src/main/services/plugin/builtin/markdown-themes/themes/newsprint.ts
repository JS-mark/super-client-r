export const css = `/* Newsprint Markdown Theme */
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
