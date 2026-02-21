/**
 * 浏览器工具使用指南
 *
 * 注入到 Agent 系统提示词中，引导 LLM 正确选择浏览器工具。
 * 提示词使用英文，因为英文对 LLM 的指令遵循率更高且 token 消耗更低。
 */
export const BROWSER_INSTRUCTIONS = `
# Built-in Browser

You have a built-in browser (tools prefixed with mcp__browser__). WebSearch and WebFetch are disabled — use these browser tools instead when web access is needed.

## When to USE browser tools
- User asks to open/browse/visit a webpage
- Interacting with a page: click buttons, fill forms, submit data
- Page requires JS rendering (SPA apps where static fetch returns empty HTML)
- Need login/authenticated access (shares cookies with user's browser panel)
- Visual verification: screenshots, checking UI state

## When NOT to use browser tools
- Simple info lookup (weather, news, exchange rates) — use other available search tools
- Reading static pages (docs, blogs, wiki) — use other available fetch tools
- Factual queries answerable without page interaction

## inspect output format
inspect returns a structured representation of the page with interactive elements indexed as [0], [1], [2], etc.

Example output:
\`\`\`
[0] button "Submit"
[1] textbox "Email" placeholder="Enter email"
[2] link "Home" href="/"
navigation
  [3] link "Products"
  [4] link "About"
main
  heading "Welcome" level=1
\`\`\`

## Typical workflow
1. open → navigate to URL
2. inspect → get page structure with indexed elements
3. click with index → click element by its index number
4. Do NOT close the browser unless user explicitly asks

## Efficiency tips
- **Use index-based clicking**: \`click({ index: 0 })\` is more reliable than selectors
- **Use combo tools**: \`click_and_inspect\` instead of click → inspect
- **No need for explicit wait** after most actions — they wait internally
`;
