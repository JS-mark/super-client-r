export const css = `/* Monokai Markdown Theme */
.x-markdown {
  --md-font-mono: "Fira Code", "JetBrains Mono", ui-monospace, SFMono-Regular, monospace;
  --md-border-color: #595450;
  --md-border-color-muted: #49443f;
  --md-fg-default: #f8f8f2;
  --md-fg-muted: #b0ab9f;
  --md-bg-subtle: #2e2a27;
  --md-accent-fg: #66d9ef;
  --md-accent-emphasis: #a6e22e;
  --md-danger-fg: #f92672;
  --md-neutral-muted: rgba(73, 68, 63, 0.6);
  color: #f8f8f2;
}

.dark .x-markdown {
  --md-border-color: #595450;
  --md-border-color-muted: #3e3a36;
  --md-fg-default: #f8f8f2;
  --md-fg-muted: #b0ab9f;
  --md-bg-subtle: #272320;
  --md-accent-fg: #66d9ef;
  --md-accent-emphasis: #a6e22e;
  --md-danger-fg: #f92672;
  --md-neutral-muted: rgba(62, 58, 54, 0.6);
}

.x-markdown pre {
  background: #272822;
  border: 1px solid #49443f;
}

.x-markdown :not(pre) > code {
  color: #e6db74;
  background: rgba(73, 68, 63, 0.5);
}

.x-markdown a { color: #66d9ef; }
.x-markdown a:hover { color: #a6e22e; }
.x-markdown strong { color: #fd971f; }

.x-markdown blockquote {
  border-left-color: #ae81ff;
  color: #b0ab9f;
}

.x-markdown table:not(pre table) th { background: #3e3a36; }
.x-markdown table:not(pre table) tr:nth-child(2n) { background-color: rgba(73, 68, 63, 0.3); }
`;
