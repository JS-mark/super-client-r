# Project Tasks

## Current Sprint

### Requirements (用户需求)
- [x] Requirement 1: Chat with Agent/Skill/MCP calls (聊天集成 Agent/Skill/MCP 调用)
- [x] Requirement 2: MCP market, MCP management, Skill market, Skill management (MCP和Skill市场管理)
- [x] Requirement 3: API Server with JWT auth and API key generation (API Server JWT认证)
- [x] Requirement 4: Beautiful UI interactions (精美UI界面)
- [x] Requirement 5: Comprehensive logging with UTF-8 encoding (完善日志系统)

### Implementation Tracking

| Feature | Status | Commit |
|---------|--------|--------|
| Logger system with rotation | ✅ Completed | `97b11de` |
| Chat integration (4 modes) | ✅ Completed | `3a6dad4` |
| MCP market & management | ✅ Completed | `7ce6113` |
| Skill market & management | ✅ Completed | `17fce24` |
| API Server JWT auth | ✅ Completed | `16a543d` |
| Skill hook enhancement | ✅ Completed | `7f72593` |
| Home page dashboard UI | ✅ Completed | `2152b5b` |
| i18n translations | ✅ Completed | `7f6033a` |
| Vitest testing framework | ✅ Completed | `bd907ca` |
| Cmd+K search & Cmd+B sidebar | ✅ Completed | `c946c15` |
| Attachments-message association | ✅ Completed | `790977a` |
| ChatToolbar extraction + prompt/quote/tools panels | ✅ Completed | `fd93cbf` |

### Next Steps / Backlog

**P1 — 快速补全（代码已就绪，接入即可）**
- [ ] JWT 认证集成到 HTTP 路由（`server/auth.ts` 已写好，仅需接入）
- [ ] 清理生产代码 console.*（232 处）

**P2 — 功能补全**
- [ ] Skill URL 下载安装（`SkillService.ts:381` TODO）
- [ ] API Server 业务端点（Chat/Agent/Skill 端点）
- [ ] 聊天工具栏剩余功能（doc/tags/translate 仍为 toast 占位）

**P3 — 质量提升**
- [ ] 核心服务单元测试（当前仅 2 个测试文件）
- [ ] 大文件拆分（McpMarket.tsx 1055 行、MenuSettings.tsx 802 行）
- [ ] Skill/Plugin 沙箱执行环境
- [ ] E2E testing with Playwright

---

## Workflow (工作流程)
1. Design → 2. Implementation → 3. Automated Testing → 4. Commit

## Commands
```bash
# Development
pnpm dev              # Start development
pnpm build            # Build for production
pnpm test             # Run unit tests
pnpm test:ui          # Run tests with UI

# Code Quality
pnpm lint             # Run oxlint
pnpm format           # Format with Biome
pnpm check            # Type check
pnpm i18n:check       # Check i18n keys
```
