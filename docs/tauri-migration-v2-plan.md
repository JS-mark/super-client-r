# Tauri Migration V2 Plan

> 入口：[refactor-plan](./refactor-plan.md) ·
> 当前 v1 进度：[refactor-progress](./refactor-progress.md)
>
> 本文是 **v2 重构计划**：只有在 v1 project/session/runtime 重构达到 `shippable`
> 后才开始执行。v2 目标是把当前 Electron 桌面壳迁移到最新稳定 Tauri 2.x，
> 首发平台为 macOS，并保留当前产品全部能力。

## 1. Scope And Timing

### 1.1 Start Gate

v2 不与当前 v1 重构并行推进。只有以下条件满足后，才允许创建 Tauri
迁移分支：

- v1 在 [refactor-execution-gates](./refactor-execution-gates.md) 中达到
  `shippable`：包含 verified 用户路径、回滚/feature flag、i18n、数据迁移安全。
- Project/session storage、runtime policy、export/recovery、Context/Memory 的 v1
  语义冻结，不能在 v2 中重新定义。
- 当前 Electron 版本有可回退构建，macOS 安装包、自动更新和用户数据目录都可恢复。
- 现有 `window.electronAPI` 调用面有契约清单，renderer 不再直接依赖 Electron
  import 或 Node API。

### 1.2 Product Goals

用户给出的 v2 目标同时成立：

- **包体积**：减少 Electron/Chromium runtime 带来的安装包和更新包体积。
- **性能**：降低冷启动、内存常驻和窗口创建成本，保留流式 Agent/PTY 体验。
- **安全**：用 Tauri capabilities/permissions 约束 WebView 能力，减少 renderer 可触达面。
- **跨平台**：v2 首发 macOS；架构不能阻断后续 Windows/Linux。
- **打包稳定性**：减少 Electron binary 下载、electron-builder、native dependency rebuild
  造成的打包问题。

### 1.3 Platform Order

1. macOS arm64/x64 parity build.
2. macOS signing/notarization/updater.
3. Windows/Linux 只做设计预留，不进入首发验收。

### 1.4 Version Policy

截至 2026-07-06，GitHub releases 显示最新 Tauri release 为 `tauri v2.11.5`。
v2 实施时应重新确认最新稳定版本，并在 `src-tauri/Cargo.toml` 与
`package.json` 中固定版本，不能长期使用未锁定的 `latest`。

官方参考：

- Tauri Architecture: https://v2.tauri.app/concept/architecture/
- Process Model: https://v2.tauri.app/concept/process-model/
- Calling Rust from the Frontend: https://v2.tauri.app/develop/calling-rust/
- Calling the Frontend from Rust: https://v2.tauri.app/develop/calling-frontend/
- Capabilities: https://v2.tauri.app/security/capabilities/
- Shell plugin: https://v2.tauri.app/plugin/shell/
- Updater plugin: https://v2.tauri.app/plugin/updater/
- Releases: https://github.com/tauri-apps/tauri/releases

## 2. Current Electron Surface To Preserve

当前 Electron 主进程不是薄壳。v2 必须先做迁移矩阵，不能只替换窗口。

| Current area | Electron/Node dependency | v2 owner |
| --- | --- | --- |
| Main window / frameless titlebar | `BrowserWindow`, custom titlebar, close-to-hide | Tauri window config + macOS window behavior |
| IPC request/response | `ipcMain.handle`, `ipcRenderer.invoke`, preload bridge | Tauri commands + compatibility bridge |
| Push events | `webContents.send`, `ipcRenderer.on` | Tauri events/channels |
| Agent runtime / LLM stream | main process services + IPC streaming | Rust runtime service + HTTP/SSE client adapters |
| PTY | `node-pty` | Rust PTY adapter, selected during V2-3 spike |
| MCP servers | Node MCP SDK, stdio/http transports | Rust MCP host/client layer |
| Local API server | Koa server, Swagger/static plugin dev pages | Rust HTTP server or Tauri custom protocol |
| Plugin system | Node filesystem, dynamic loading, CSS injection | Rust plugin registry + constrained frontend/plugin surfaces |
| Store/storage | `app.getPath`, `electron-store`, Node fs | migrate path provider; preserve v1 app-managed data buckets |
| File dialogs/open/reveal | Electron `dialog`, `shell` | Tauri dialog/opener/fs plugins or custom commands |
| Updates | `electron-updater` | Tauri updater plugin + signed update metadata |
| Deep link/single instance | Electron app events/protocol | Tauri deep-link + single-instance plugins |
| Tray/floating window | Electron Tray/window APIs | Tauri tray/window/positioner evaluation |
| Native dependencies | `better-sqlite3`, `node-pty`, AI/MCP Node packages | replace with Rust crates or remove dependency |

## 3. No Node Sidecar Decision

### 3.1 Decision

V2 explicitly does **not** use a Node sidecar. The Tauri app must not bundle a
Node runtime as a long-lived backend process, because that weakens the package-size
and operational-simplicity goals.

The existing Electron main-process TypeScript code remains valuable as:

- behavior reference;
- compatibility test oracle;
- migration source for API contracts and data formats;
- temporary Electron fallback during beta.

It is not packaged into the Tauri runtime.

### 3.2 Consequence

No-sidecar changes the migration from "desktop shell migration" to
"desktop shell plus backend runtime rewrite". This is the correct long-term
architecture for package size and security, but it raises the entry bar:

- Agent runtime, MCP, PTY, plugin, local API, remote IM, storage and update adapters
  all need Rust-native equivalents before macOS parity.
- The renderer can still be mostly reused, but the backend contract must be
  implemented by Tauri commands/events/channels backed by Rust services.
- V2 should expect a longer schedule than the sidecar path and must preserve the
  Electron stable channel until parity is proven.

### 3.3 Tradeoffs

| Dimension | Benefit | Cost |
| --- | --- | --- |
| Package size | Removes Chromium and avoids bundled Node runtime | More Rust implementation work before parity |
| Security | One Tauri/Rust trust boundary; smaller backend attack surface | Every native capability must be re-audited |
| Performance | No extra Node backend process; fewer IPC hops | Rust service maturity must match current Node behavior |
| Delivery risk | Cleaner final architecture | Higher short-term rewrite risk |
| Cross-platform | Rust backend can become the shared core | Platform-specific PTY/plugin/update gaps must be solved per OS |

### 3.4 First-Pass Decision

V2 first macOS parity uses **Tauri + Rust-native backend services**.

No Node sidecar is allowed in production Tauri builds. Temporary Node tooling may
still be used at build time or in tests, but not as a shipped runtime dependency.

## 4. Target V2 Architecture

```text
Renderer (React/Vite, mostly unchanged)
  -> platformBridge.ts
       - Electron implementation during v1
       - Tauri implementation during v2
  -> Tauri invoke/events/channels
       - native shell/window/dialog/update commands in Rust
       - backend RPC/event surface implemented by Rust services

Tauri Core (Rust)
  - window/tray/deep-link/single-instance/update
  - capabilities/permissions
  - Agent runtime / LLM / MCP / Skill / Plugin adapters
  - PTY / local API / remote IM / storage
  - JSONL project/session data model from v1
```

### 4.1 Compatibility Rule

Renderer migration must be incremental. The first Tauri build should expose a
typed `window.electronAPI` compatibility shim or a new `platformBridge` with the
same method/event surface. Broad UI rewrites are out of scope.

### 4.2 Transport Rule

Avoid exposing arbitrary channel access. The current generic `ipc.on/send/invoke`
surface must be removed or locked behind a dev-only capability before Tauri
shipping. V2 transport should support:

- request/response RPC for CRUD and commands;
- event subscription for broadcast state;
- backpressure-aware Tauri channels for Agent, LLM and PTY;
- request ids and cancellation for long-running operations;
- structured errors that preserve v1 IPC error codes.

### 4.3 Data Rule

V2 must preserve v1 storage semantics:

- project sessions live in app-managed `userData/projects/<projectId>/sessions/`;
- casual sessions live in app-managed `casual-sessions/`;
- project cwd is runtime working directory only;
- v2 must not create `.scr-data` in user projects;
- migration from Electron data dir to Tauri data dir must be explicit and reversible.

## 5. Phase Plan

### Phase V2-0: Readiness Audit

Goal: prove v1 is stable enough to migrate.

Tasks:

- Freeze v1 API contract from current `ElectronAPI` and generated/proxy IPC.
- Inventory every renderer call to `window.electronAPI` and every raw IPC channel.
- Inventory all Electron-only imports in `src/main`, `src/preload`, scripts and tests.
- Split current main process responsibilities into:
  - native shell/window/update;
  - backend business service;
  - streaming/event transport;
  - dev-only diagnostics.
- Define parity tests for macOS: create session, send Agent message, MCP tool call,
  PTY, plugin dev page, local API, remote IM, update check, archive/export.

Exit evidence:

- `docs/tauri-migration-v2-matrix.md` exists with every Electron API mapped.
- No unknown Electron-only feature remains.
- v1 full verification commands and macOS smoke are recorded.

### Phase V2-1: Tauri Shell Spike

Goal: create a Tauri app that can host the existing renderer without backend parity.

Tasks:

- Add `src-tauri/` with latest stable Tauri 2.x pinned.
- Keep existing React/Vite renderer build.
- Configure macOS app id/product name/icons/dev URL/dist dir.
- Implement main window with current dimensions, minimum size, hidden titlebar equivalent,
  close-to-hide behavior, external link handling and devtools policy.
- Add Tauri capabilities with minimum permissions for the main window.
- Add a `platformBridge.health()` command.
- Add CI/local scripts:
  - `pnpm tauri:dev`
  - `pnpm tauri:build:mac`
  - `pnpm tauri:check`

Exit evidence:

- Tauri shell launches on macOS and renders the app.
- Health command works from renderer.
- No Rust backend parity yet; all unavailable backend calls fail with structured
  `platform.notReady` errors.

### Phase V2-2: Platform Bridge Compatibility Layer

Goal: make renderer code platform-neutral before moving backend logic.

Tasks:

- Introduce `src/renderer/src/services/platformBridge.ts`.
- Add Electron adapter backed by current preload API.
- Add Tauri adapter backed by `@tauri-apps/api/core.invoke` and event APIs.
- Replace direct `window.electronAPI` access in renderer services with the bridge.
- Keep TypeScript contract aligned with `packages/shared-types/src/electron-api.ts`
  or rename it to a platform-neutral contract after v1.
- Remove or constrain raw generic IPC calls.
- Add adapter tests with mocked Electron and mocked Tauri APIs.

Exit evidence:

- Electron build still passes unchanged behavior.
- Tauri shell can use the same renderer bundle with mocked backend responses.
- Renderer code has a single platform integration boundary.

### Phase V2-3: Rust Backend Foundation

Goal: create the Rust service foundation that replaces Electron main-process
business services without shipping Node.

Tasks:

- Create Rust module layout under `src-tauri/src/`:
  - `commands/` for Tauri command entrypoints;
  - `events/` for frontend event/channel emitters;
  - `services/` for stateful business services;
  - `storage/` for JSONL/meta/project data;
  - `runtime_policy/` for v1 approval/sandbox semantics;
  - `providers/` for model/search/network integrations.
- Define shared command contracts:
  - request/response types;
  - structured error type;
  - stream event envelope;
  - cancellation tokens;
  - audit event envelope.
- Port path provider:
  - app data dir;
  - logs dir;
  - temp dir;
  - project cwd canonicalization;
  - redacted path display helper.
- Port JSONL storage core:
  - append-only events;
  - event id/seq/writtenAt;
  - meta repair;
  - malformed line recovery;
  - contentRef read/write.
- Port runtime policy evaluator before any command/file/network/PTY capability is enabled.
- Select Rust crates for:
  - async runtime and channels;
  - HTTP client/server;
  - SQLite if still needed;
  - PTY;
  - archive/export;
  - logging/tracing.

Exit evidence:

- Rust `platform.health`, path provider, logging, storage smoke and policy smoke pass.
- No production Tauri command depends on Node.
- Electron v1 fixtures can be replayed through Rust JSONL storage tests.

### Phase V2-4: Native Service Porting

Goal: port current Electron main-process services into Rust in risk-ranked slices.

Tasks:

- Port low-risk request/response namespaces first:
  - app/system/path;
  - config/theme/model/search;
  - project/session storage;
  - diagnostics/export.
- Port provider/network services:
  - model provider CRUD;
  - test connection/fetch models;
  - search providers;
  - proxy/network log policy where retained.
- Port skill service:
  - skill discovery;
  - manifest parsing/validation;
  - system/command prompt loading;
  - execution policy boundary.
- Port MCP service:
  - server config lifecycle;
  - stdio/http transports;
  - tool discovery;
  - tool call runtime gate;
  - builtin server replacements or wrappers.
- Port Agent runtime/LLM:
  - request lifecycle;
  - streaming text/reasoning/status;
  - approval/ask-user loops;
  - Plan/Execute product event projection;
  - stop/interruption.
- Port local API server:
  - status/start/stop;
  - API docs/plugin dev pages;
  - auth/cors policy.
- Port plugin system:
  - install dev/reload;
  - permission grants;
  - UI contributions;
  - theme/CSS contribution replacement.
- Port remote IM:
  - bot lifecycle;
  - bind/unbind;
  - send/receive/dedupe;
  - inactive/deleted/archived handling.
- Port event namespaces throughout:
  - theme/config updates;
  - server status;
  - plugin UI contributions;
  - remote events.
- Port streaming namespaces last in each subsystem:
  - Agent runtime stream;
  - LLM stream;
  - PTY data/exit;
  - Agent trace updates.
- Preserve v1 response shape or provide a typed compatibility conversion.
- Implement cancellation/stop paths before enabling long-running streams.

Exit evidence:

- Tauri build can create/list/update/delete project and casual sessions.
- Agent message send streams text and terminal status correctly.
- PTY input/output works with resize/kill.
- MCP tool calls and runtime denials match Electron v1 fixtures.
- Renderer tests pass against both Electron and Tauri adapters where practical.

### Phase V2-5: Native OS Feature Migration

Goal: replace Electron-only native shell features with Tauri equivalents.

Tasks:

- Window controls:
  - minimize/maximize/close/isMaximized;
  - maximize-change events;
  - close-to-hide;
  - focus/show from floating window or deep link.
- Dialog/opener:
  - select files;
  - reveal/open file/folder;
  - open external URL;
  - clipboard if current browser API is insufficient.
- Deep link/single instance:
  - `superclient://conversation/<id>`;
  - auth callback;
  - skill/config import links;
  - second-instance forwarding.
- Tray/floating window:
  - recreate current tray behavior;
  - floating widget size/position and pending message handoff.
- Global shortcuts:
  - preserve configured shortcuts;
  - verify conflict behavior on macOS.

Exit evidence:

- Existing window/sidebar/settings workflows pass macOS manual smoke.
- Deep links and auth callbacks reach the same renderer routes as Electron.
- File picker/open/reveal behavior matches Electron.

### Phase V2-6: Security And Runtime Policy Hardening

Goal: make Tauri's security model reinforce v1 runtime policy instead of bypassing it.

Tasks:

- Define capabilities per window:
  - main window;
  - floating widget;
  - plugin/webview surfaces if retained;
  - dev-only diagnostics.
- Remove broad permissions from production windows.
- Route file read/write/delete, command exec, network egress and external open through
  v1 `RuntimePolicyService` semantics.
- Ensure Tauri shell plugin permissions do not bypass v1 approval prompts.
- Add audit records for Tauri-native commands and spawned subprocesses.
- Ensure no local unauthenticated backend API exists unless explicitly required
  for the product local API server and gated by its own config/auth policy.
- Ensure no arbitrary method/channel is reachable from renderer.

Exit evidence:

- Each runtime operation kind has Tauri parity tests.
- Denied/needs-approval operations cannot be allowed by alternate native path.
- Production capability files are reviewed and minimal.

### Phase V2-7: Storage And Data Migration

Goal: move from Electron data paths to Tauri data paths without data loss.

Tasks:

- Compare Electron `app.getPath("userData")` and Tauri app data path on macOS.
- Decide one of:
  - reuse existing Electron userData directory for continuity;
  - copy/import Electron data into Tauri app data directory with rollback.
- Keep v1 project/session storage layout unchanged inside the chosen base dir.
- Migrate config/store:
  - `electron-store` equivalent to Rust JSON/store provider or Tauri store plugin;
  - preserve encryption/secret handling strategy where used;
  - preserve update channel and provider settings.
- Add migration lock and failure report.
- Add "open data directory" and "export backup before migration" UX.

Exit evidence:

- Existing Electron user can launch Tauri build and see previous projects/sessions.
- Failed migration does not mark completion.
- Electron app can still open original data after failed Tauri migration.

### Phase V2-8: Updater, Signing, Notarization, Packaging

Goal: produce a signed macOS Tauri release with update support.

Tasks:

- Configure macOS bundle:
  - app id/product name;
  - icons;
  - DMG layout;
  - minimum macOS version;
  - entitlements.
- Configure Tauri updater plugin:
  - signing key management;
  - static JSON or update server format;
  - channel strategy;
  - rollback policy;
  - update progress events mapped to existing UI.
- Replace `electron-updater` UI path with platform bridge updater API.
- Notarize macOS app.
- Verify no Node runtime/backend binary is included in production artifacts.
- Measure package size and update size against Electron baseline.

Exit evidence:

- `pnpm tauri:build:mac` produces signed/notarizable artifacts.
- Fresh install, update check, download and install paths work.
- App launches after install and after update with Rust services available.

### Phase V2-9: Full Capability Parity

Goal: reach "all current abilities" parity on macOS.

Required parity matrix:

| Feature | Required v2 evidence |
| --- | --- |
| Agent chat | create/send/stop/retry, streaming, approval, Plan/Execute replay |
| Project/session | casual/project sessions, JSONL replay, delete/archive/recovery/export |
| MCP | builtin/third-party server lifecycle, tool list, tool call, runtime gate |
| Skills | install/list/execute/validation/system prompt |
| Plugins | install dev/reload, UI contributions, CSS/markdown theme injection or replacement |
| PTY | create/write/resize/kill/list, output streaming |
| Local API | Koa API or replacement available, plugin dev docs page works |
| Remote IM | bind/unbind/send/receive/dedupe/offline/inactive session behavior |
| Search/model/settings | provider CRUD, active/session model, search execution |
| Diagnostics | agent trace, diagnostic export, redaction |
| Updates | check/download/install/progress/error |
| Native UX | tray, floating window, deep link, file dialogs, reveal/open external |

Exit evidence:

- macOS manual verification matrix passes.
- Focused tests pass for bridge, Rust services, transport, runtime policy and migration.
- Electron and Tauri builds can coexist during rollout.

### Phase V2-10: Rollout And Fallback

Goal: ship safely without stranding users.

Tasks:

- Release Tauri as separate beta channel first, not in-place replacement.
- Keep Electron stable channel available until Tauri parity is proven.
- Add data backup prompt before first Tauri migration.
- Add rollback instructions and in-app diagnostic export.
- Monitor:
  - Rust service initialization failures;
  - stream disconnects;
  - update failures;
  - data migration failures.

Exit evidence:

- Beta users can move back to Electron with data intact.
- Known failure classes have diagnostic export coverage.
- Tauri becomes default only after macOS beta passes agreed thresholds.

## 6. Risk Register

| Risk | Severity | Mitigation |
| --- | --- | --- |
| Rust rewrite scope delays parity | High | Slice by subsystem; keep Electron stable channel until Tauri reaches macOS parity |
| Missing Rust equivalent for PTY/MCP/plugin behavior | High | Spike crate choices in V2-3 before committing parity dates |
| Streaming transport loses events | High | Use request ids, sequence numbers, reconnect/replay from JSONL where possible |
| Tauri permissions accidentally too broad | High | Capability review gate before beta |
| Data path migration loses user history | High | backup/export first, no silent done flag, rollback test |
| Local API server exposed too broadly | High | keep explicit API service config/auth/cors policy; no hidden backend API |
| Package size reduction smaller than expected | Medium | measure Electron vs Tauri Rust-native at V2-3 and V2-8 |
| Behavior drift from Electron v1 | Medium | replay v1 fixtures and maintain parity matrix per subsystem |
| Windows/Linux assumptions leak into macOS phase | Medium | macOS first; other platforms only tracked as future constraints |

## 7. Metrics

Measure before v2 begins and at every major phase:

- cold start to first painted chat screen;
- time to first streamed token;
- idle memory after 60 seconds;
- package artifact size: DMG, app bundle, update package;
- Rust service initialization time;
- IPC/RPC roundtrip latency for representative CRUD calls;
- PTY throughput and resize latency;
- Agent stream dropped/duplicated event count;
- crash count split by Tauri Core, WebView and Rust service module;
- v1 Electron fallback success rate during beta.

## 8. Non-Goals For First macOS V2

- Shipping Windows/Linux Tauri builds.
- Redesigning renderer UI.
- Changing v1 project/session storage semantics.
- Changing Agent-only product model.
- Shipping any Node runtime or Node backend sidecar in production Tauri builds.
- Removing Electron stable channel before Tauri beta proves parity.

## 9. Open Decisions Before V2 Starts

- Exact latest Tauri version to pin at implementation start.
- Rust crate choices for PTY, MCP transport, HTTP server/client, archive/export,
  logging/tracing and optional SQLite.
- Whether all backend APIs use Tauri commands/channels or whether the product local
  API server remains a separate explicit HTTP surface.
- Whether Tauri reuses Electron userData path or imports into a new Tauri path.
- Whether plugin HTML/pages become Tauri custom protocol, dedicated webview surfaces,
  or static assets served by the explicit local API server.
- Exact Rust PTY strategy for macOS and future Windows/Linux parity.
- Update server format and signing key storage.
