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

### Next Steps / Backlog
- [ ] API Server routes implementation (聊天/Agent/Skill/MCP 端点)
- [ ] WebSocket support for real-time chat
- [ ] Agent session management persistence
- [ ] MCP server auto-reconnection
- [ ] Skill execution sandbox
- [ ] Settings page API key management UI
- [ ] Dark mode polish
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
