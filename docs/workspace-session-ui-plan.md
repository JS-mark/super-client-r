# Workspace / Session Core Runtime, Feature, and UI Plan

> 当前重构总入口：[refactor-plan](./refactor-plan.md) ·
> 当前 project/session 主计划：[project-session-redesign-plan](./project-session-redesign-plan.md) ·
> 旧索引：[workspace-session-index.md](./workspace-session-index.md) ·
> 实现差距：[implementation-audit](./workspace-session-implementation-audit.md) ·
> 计划审查：[plan-review](./workspace-session-plan-review.md)
>
> 注意：本文是历史 Workspace/Session 主计划。所有"Workspace 作为独立配置实体"的章节已被 `project-session-redesign-plan.md` supersede；后续不要继续向本文追加新功能章节。

## 1. Review Summary

This document is the reviewed and corrected implementation plan for reshaping Super Client R around a `Workspace -> Session` model, with Claude desktop / Codex desktop style interaction profiles, unified extension management, session-level model switching, attachments, plan modes, permissions, and sandboxing.

The scope is not a UI refresh. The expected result requires kernel-level product behavior: durable workspace/session state, main-process-enforced runtime policy, real attachment context resolution, unified approval semantics across execution paths, and an extension model that controls both app UI contributions and agent/runtime capabilities.

### UI Reference Benchmark

The UI target is explicitly based on the provided Codex desktop and Claude desktop screenshots. These are product interaction references, not only visual references.

#### Codex Desktop Reference

Use Codex as the primary reference for coding-agent sessions and task execution.

Required interaction shape:

- A persistent left sidebar with global actions at the top, project-grouped sessions in the middle, and account/settings actions at the bottom.
- Project groups are visible first-class containers. Sessions are nested under their project and show recency/status inline.
- The active session is highlighted with a soft selected row, not a heavy card.
- The main content column is calm and sparse, with a narrow readable transcript width inside a larger canvas.
- The composer is bottom-anchored, wide, rounded, and always shows the current approval/permission mode plus model/effort controls.
- Running work is shown inline in the transcript with elapsed time and step status.
- A right environment panel is available for coding sessions. It summarizes changed files, local mode, branch, commit/push action, and sources/context.
- Right-panel status is operational, not decorative. File changes, branch, local/runtime mode, approvals, and source context must update from real runtime state.

Codex mode must not be reduced to larger spacing or green tags. It needs a real task workbench: project sessions on the left, transcript/timeline in the center, and environment/changes/context on the right.

#### Claude Desktop Reference

Use Claude as the primary reference for general chat, new-session start state, and lightweight non-coding sessions.

Required interaction shape:

- A persistent left sidebar with top mode tabs (`Chat`, `Cowork`, `Code`), quick actions, recent sessions, and account/status at the bottom.
- The new-session state is centered and welcoming, with a large greeting, a prominent composer, and quick intent chips.
- The composer is the main object on the page: large textarea, attachment button, model selector, effort selector, voice/action buttons, and subtle rounded border.
- Global plan/account notices can sit above the composer as compact banners.
- Recent sessions are simple rows with hover actions, not full cards.
- The visual tone is almost monochrome: white canvas, light gray panels, restrained borders, minimal shadows, strong typography.

Claude mode should feel like a fast personal assistant surface. It should not show the full Codex environment panel until the user enters a coding, plan, or tool-heavy workflow.

#### Product Mapping

The app should use these references by mode:

| App mode | Primary reference | Expected shell |
| --- | --- | --- |
| New chat / empty chat | Claude desktop | Center greeting + large composer + quick intent chips |
| General chat | Claude desktop | Left recents sidebar + centered transcript/composer |
| Code / agent / plan session | Codex desktop | Project/session sidebar + transcript/timeline + environment panel |
| Hybrid session | Claude first, Codex on demand | Start simple; reveal timeline/environment panel when tools, files, approvals, or plan state appear |

Design guardrails:

- Do not introduce marketing-page hero treatment, colorful gradients, or decorative cards.
- Keep the palette quiet: white/off-white background, gray text hierarchy, black primary text, one restrained accent.
- Prefer rows, panels, split panes, and status chips over card grids.
- Icons should be thin, functional, and paired with text where the action is not obvious.
- The shell must be responsive, but desktop behavior is the priority because the product is Electron-first.

The original plan was directionally correct, but several points needed tightening before development:

| Issue | Risk | Resolution |
| --- | --- | --- |
| Workspace and session boundaries were implied, not explicit enough. | Long-lived configuration could leak into individual sessions and become hard to migrate. | Treat `Workspace` as the durable configuration boundary. Treat `Session` as a runtime instance with temporary overrides and execution history. |
| Permission approval and sandboxing were mixed together. | `Full access` could be misunderstood as bypassing hard safety limits. | Separate approval policy from sandbox policy. Approval controls prompts; sandbox controls hard execution boundaries. |
| Model switching was described as a control, but not as a first-class chat workflow. | A small dropdown would not support provider comparison, capability warnings, or session override behavior. | Add a command-palette style `Model Switcher` modal with provider list, model list, advanced parameters, and explicit session/workspace actions. |
| Attachments did not define context behavior. | Large files or external resources could be silently injected into context or read without clear consent. | Every attachment gets a source, status, and context mode: include content, reference only, ask before read, or ignore for model. |
| Extension unification could blur agent capabilities with app UI plugins. | App UI extensions and agent runtime capabilities require different trust and permission models. | Rename existing app-level plugins to `App Plugins`. Keep MCP, Skills, Hooks, and capability packages under `Extensions`, but make their type and scope visible. |
| Interaction profile could become cosmetic only. | Claude desktop / Codex desktop mode would not meaningfully change behavior. | Define concrete layout, density, approval, timeline, command, and inspector differences per profile. |
| The plan still leaned too much toward UI aggregation. | The app could look like Claude desktop / Codex desktop while still running on old, inconsistent model, permission, attachment, and extension paths. | Move kernel work earlier: persistence, runtime policy, approval adapter, attachment resolver, and extension descriptors must land before final UI polish. |
| Migration was too broad. | A large rewrite would destabilize existing chat, MCP, skill, and plugin flows. | Use phased migration: stabilize the runtime contract first, then expose it through UI, then migrate backing services gradually. |
| Plan review found parallel implementations and missing wiring. | Types such as `WorkspaceConfig`, `ModelSelection`, approval grants, and runtime policy could exist without being authoritative. | Add explicit source-of-truth, API contract, resolver, dependency, rollback, and adapter boundaries before continuing feature work. |

## 2. Product Model

The core product model is:

```text
App
└── Workspace
    ├── Workspace Config
    │   ├── interaction profile
    │   ├── default model
    │   ├── enabled capabilities
    │   ├── permission policy
    │   ├── sandbox policy
    │   ├── hooks / commands / prompts
    │   ├── context policy
    │   └── app plugins
    └── Sessions
        ├── chat session
        ├── agent session
        ├── plan session
        ├── remote session
        └── automation session
```

Configuration inheritance:

```text
Global App Settings < Workspace Settings < Session Overrides
```

Design rules:

- Workspace stores durable configuration and security boundaries.
- Session stores runtime state, temporary overrides, tool history, approvals, plan state, and messages.
- Global settings only cover app-wide defaults, account settings, UI defaults, and developer options.
- A session must always belong to exactly one workspace.
- Session overrides should be visible in the UI and easy to reset to workspace defaults.
- The main process must be the authority for workspace/session runtime decisions. Renderer stores can cache and render state, but they must not be the security boundary.
- UI controls must reflect the effective runtime state, not maintain a separate parallel state.

Implementation note from Phase 0 audit:

- The current persisted runtime unit is `Conversation`, stored by `ConversationStorageService`.
- The first implementation should treat `Session` as a normalized wrapper around existing conversation metadata.
- Add `workspaceId` and session metadata to existing conversation metadata before introducing any separate session persistence layer.
- The current per-conversation `workspace/` directory is an execution directory, not the same thing as the user-facing `Workspace` entity.

Implementation note from plan review:

- Two workspace stores currently coexist: renderer `useWorkspaceStore` and main-process `WorkspaceConfig` in `StoreManager`.
- Main-process `WorkspaceConfig` must become the source of truth for runtime configuration.
- Renderer workspace state should become a read-through UI cache and local interaction state, not an independent runtime store.
- Existing persisted renderer workspaces must be backfilled into main-process `WorkspaceConfig` before settings UI is treated as authoritative.

## 3. Main Navigation

Reduce first-level navigation to:

1. `Chat` - current workspace sessions and agent interaction.
2. `Workspaces` - workspace creation, switching, and overview.
3. `Tasks` - long-running tasks, background sessions, plan sessions, automations, and remote sessions.
4. `Extensions` - MCP servers, skills, hooks, app plugins, themes, and capability packages.
5. `Settings` - global settings, account, shortcuts, logs, and developer tools.

The existing `MCP Market`, `Skills`, and `Plugins` pages should no longer appear as first-level navigation items after Phase 1. Keep the old routes temporarily for compatibility and redirects.

## 4. Pre-Phase 1 Corrections

The plan review identifies three blockers that must be resolved before Phase 1 is considered complete.

### Workspace Source of Truth

Main-process `WorkspaceConfig` is the source of truth for:

- workspace identity
- default model
- interaction profile
- runtime policy
- context policy
- enabled capabilities
- current/default workspace IDs

Renderer `useWorkspaceStore` may continue temporarily, but only as:

- UI cache for workspace lists
- optimistic interaction state
- compatibility layer for existing components

Required migration:

1. Read existing renderer persisted workspaces.
2. Convert them into main-process `WorkspaceConfig`.
3. Preserve renderer fields that do not yet exist in `WorkspaceConfig` as UI-only metadata.
4. Sync current/default workspace IDs from main process to renderer on startup.
5. Derive `sessionIds` and `activeSessionId` from conversation metadata instead of manually maintaining them as independent truth.

### Electron API Contract

The typed IPC proxy must have a single contract source.

Required direction:

- Add `packages/shared-types/src/electron-api.ts`.
- Move the actual `ElectronAPI` namespace shape out of `src/preload/index.ts`.
- Make preload bridge keys and main `apiImpl` conform to the shared interface.
- All new namespaces, including workspace runtime, approval runtime, file artifact actions, and extension descriptors, must extend this shared contract.

### Effective Runtime Resolver

`EffectiveSessionRuntime` must be implemented before UI surfaces depend on workspace/session state.

Resolver inputs:

- global app defaults
- main-process `WorkspaceConfig`
- conversation-backed `SessionMetadata`
- per-message overrides
- current model provider state
- enabled extension descriptors

Resolver consumers:

- direct/skill chat request construction
- Agent SDK query setup, initially with limited model support
- approval adapter
- runtime policy service
- attachment context resolver
- chat renderer profile selection
- composer/status chips

## 5. Interaction Profiles

Interaction profile is a workspace setting with optional session override.

```ts
type InteractionProfile = "claude-code" | "codex" | "hybrid";
```

### Claude Desktop Mode (`claude-code` profile id)

Use this profile for command-first, compact interaction. Visual and interaction density should be closer to Claude desktop than to a dense IDE.

- Input composer is the primary control surface.
- Empty state uses a centered greeting, large composer, model/effort controls, attachment action, and quick intent chips.
- Left sidebar shows mode tabs, quick actions, projects/artifacts/customization, recent sessions, and account controls.
- Slash commands are first-class: `/config`, `/model`, `/mcp`, `/skills`, `/permissions`, `/plan`, `/hooks`.
- Tool calls render as compact inline blocks.
- Approvals render inline when possible.
- Sidebar is minimized and session-focused.
- Status line is always visible.
- The right Codex-style environment panel is hidden by default and only appears when tools, files, approvals, or plan state need inspection.

### Codex Mode

Use this profile for task-first, inspectable workflows.

- Left pane: global actions plus project-grouped sessions, matching the Codex desktop project/session hierarchy.
- Center pane: conversation plus execution timeline.
- Right pane: environment inspector for changes, local/runtime mode, branch, commit/push action, source context, plan, files, tools, approvals, and logs.
- Composer: bottom-anchored rounded input with attachment action, approval mode, model/effort selector, voice/action affordances, and stop/send control.
- Approvals are queued in the inspector.
- Plan, command execution, diff, test, and summary states are visually separated.
- Changed files and source/context state must come from real runtime data, not static UI placeholders.

### Hybrid Mode

Default profile.

- Composer and slash commands remain fast.
- Task timeline and inspector are available when a session enters plan or agent mode.
- Approval UI favors inline blocks for simple actions and inspector queue for multi-step work.
- Empty/new-session state follows Claude. Active coding/session execution follows Codex.

## 6. Chat Page Layout

Target layout:

```text
App Sidebar | Workspace / Session Header | Runtime Controls
Project Sessions Sidebar | Conversation or Timeline | Environment Inspector
Bottom Composer + Status Bar
```

Header displays:

- current workspace
- current session
- current model
- interaction profile
- approval mode
- sandbox mode
- active MCP / skills / capabilities health

Sidebar rules:

- Global app sidebar stays visible on desktop.
- Project/session sidebar groups conversations under projects/workspaces and shows selected session, recency, and running status.
- Legacy right-side chat history drawer must be removed from the primary chat shell once the left project/session sidebar exists.

Environment inspector rules:

- Codex profile shows the inspector by default for coding/agent/plan sessions.
- Claude profile hides the inspector by default for empty and normal chat sessions.
- Hybrid profile auto-reveals the inspector when there are changes, approvals, active tools, plan steps, or captured sources.
- Inspector sections must map to runtime state: changes, local/runtime mode, branch, commit/push, sources/context, approvals, and logs.

Status bar displays:

```text
Model · Plan mode · Approval mode · Sandbox · Active capabilities · Context usage
```

The status bar should be compact, persistent, and clickable where useful. For example, clicking the model chip opens the model switcher.

## 7. Composer Design

The chat composer must support these controls:

1. Model switcher.
2. Attachment picker.
3. Plan mode selector.
4. Capability selector.
5. Slash command panel.
6. Send / stop / continue actions.

Recommended structure:

```text
┌──────────────────────────────────────────────────────────────┐
│ attachment chips / context chips                             │
│ message input                                                │
├──────────────────────────────────────────────────────────────┤
│ Model chip · Plan mode · Capabilities · Attach · Slash · Send │
└──────────────────────────────────────────────────────────────┘
```

Composer rules:

- Do not hide current model, plan mode, approval mode, or sandbox mode behind deep settings.
- Model and plan mode changes affect only the current session unless explicitly saved to workspace.
- If streaming is active, disable model switching and capability changes until stopped.
- If the selected model cannot support the current attachments or tools, show an inline compatibility warning before send.

## 8. Model Switcher

Chat must include a session-level model switching modal, not just a dropdown.

Entry points:

1. Header model chip.
2. Composer model chip.
3. `/model` slash command.

Modal structure:

```text
Model Switcher
├── Current session
│   ├── current model
│   ├── workspace default marker
│   ├── session override marker
│   └── reset to workspace default
├── Providers
│   ├── OpenAI
│   ├── Anthropic
│   ├── Gemini
│   ├── OpenRouter
│   └── Local
├── Models
│   ├── search
│   ├── capability tags
│   ├── context length
│   ├── vision / tools / reasoning support
│   ├── speed / cost hint
│   └── availability status
└── Advanced
    ├── reasoning effort
    ├── temperature
    ├── max output
    ├── context mode
    └── fallback model
```

Actions:

- `Use for this session`
- `Set as workspace default`
- `Reset to workspace default`

Rules:

- Session model changes create a visible `Session override` state.
- Workspace default changes update workspace config.
- If the session already has messages, switching model only affects future responses.
- If streaming is active, switching is disabled until the stream stops.
- If a target model lacks tool, vision, file, or long-context support required by the current session, the model row must show a warning.
- If the selected provider is not configured, show setup action instead of selection.
- First implementation scope: model switching applies to direct and skill chat paths. Agent SDK mode currently has a separate model configuration chain and should be wired in a later phase.

Model resolution order:

```text
global active model -> workspace default model -> session model override -> per-message override
```

Runtime wiring:

- Direct/skill chat must accept resolved `ModelSelection` from `EffectiveSessionRuntime` before calling `modelService.chatCompletion()`.
- The global `activeModelSelection` remains the fallback only, not the effective model once workspace/session values exist.
- Agent SDK sessions must have an explicit milestone for reading compatible fields from `EffectiveSessionRuntime`; until then the UI must label Agent SDK model switching as limited.
- The model switcher must write to session metadata for session overrides and to main-process `WorkspaceConfig` for workspace defaults.

## 9. Attachments

Supported attachment sources:

- local files
- folders
- images
- workspace files
- clipboard content
- historical message references
- external URLs
- MCP resources

Each attachment should display:

```text
name · source · size · context mode · status
```

Context modes:

```ts
type AttachmentContextMode =
  | "include-content"
  | "reference-only"
  | "ask-before-read"
  | "ignore-for-model";
```

Rules:

- Large files default to `reference-only`.
- Workspace-external paths default to `ask-before-read`.
- Images require a vision-capable model or a compatibility warning.
- Folders are references until file selection or indexing is confirmed.
- URLs follow network policy before fetch.
- MCP resources follow MCP server permission and workspace runtime policy.
- Current composer attachment upload is renderer-only and does not feed file content into model requests. Implement persistent attachment storage and request-time resolution before treating attachment chips as model context.
- Attachment context resolver must define model input mapping before implementation:
  - text/code/markdown can become text blocks with source headers and token budget accounting
  - images can become vision blocks only when the selected model supports vision
  - binary/archive/audio/video default to reference-only until a parser/transcriber exists
  - folders default to manifest/reference mode before indexing
- `reference-only` must include token budgeting and summarized file metadata.
- `ask-before-read` must create an approval prompt at send time before file content is read.
- Resolved attachment references must be saved with the message so later replay/debugging can explain what was actually sent.

## 10. Chat File Results and Operations

Conversation file display and file operations should follow the Codex-style interaction shown in the reference screenshot:

- file paths in assistant text render as inline path chips, not plain text only
- generated or modified files render as full-width file result cards inside the assistant turn
- file cards expose a primary `Open` action and an app picker menu
- the app picker should support configured external targets such as VS Code, Trae, Sublime Text, Terminal, iTerm, Warp, and Finder where available
- file write/edit results render a compact changed-files summary with added/deleted line counts
- changed-file summaries are collapsible and can expand to a file list and diff preview
- destructive or external actions still route through runtime policy and approval

Target assistant turn structure:

```text
Assistant text
Inline path chips
File result card(s)
Changed files summary: N files changed +added -deleted
Expandable diff / file list
Follow-up actions
```

File result card content:

```text
icon · filename
kind · extension · optional relative path
primary action: Open
secondary menu: open with app, reveal in Finder, copy path, attach/reference, view diff
```

Changed-file summary content:

```text
N files changed · +added · -deleted
file path · status · +added · -deleted
expandable hunks or diff preview
```

Runtime model:

```ts
interface ChatFileArtifact {
  id: string;
  conversationId: string;
  messageId: string;
  path: string;
  relativePath?: string;
  name: string;
  extension?: string;
  mimeType?: string;
  kind: "created" | "modified" | "read" | "referenced" | "attached";
  source: "tool" | "agent" | "attachment" | "user" | "plugin";
  openTargets: FileOpenTarget[];
  policy: {
    canOpen: boolean;
    canReveal: boolean;
    canDiff: boolean;
    requiresApproval?: boolean;
  };
}

interface ChatFileChangeSet {
  id: string;
  conversationId: string;
  messageId: string;
  files: Array<{
    path: string;
    status: "added" | "modified" | "deleted" | "renamed";
    additions: number;
    deletions: number;
    diffPreview?: string;
  }>;
  additions: number;
  deletions: number;
}

interface FileOpenTarget {
  id: string;
  label: string;
  kind: "editor" | "terminal" | "finder" | "custom";
  available: boolean;
}
```

Rules:

- File cards are output artifacts, not composer attachments. They may later be attached back into context, but they must be tracked separately.
- File cards must use workspace-relative paths where possible and preserve absolute paths only for actions.
- Opening an external app is an external-app operation and must respect `WorkspaceRuntimePolicy.externalAppAccess`.
- Revealing or opening files outside the workspace requires approval unless the session policy explicitly allows it.
- Diff previews should be generated from recorded change data when available; avoid re-reading arbitrary paths just to render UI.
- If a file operation came from a tool call, the file card should be linked to that tool/audit event.

Initial implementation should cover:

1. render file artifacts in assistant turns
2. render changed-files summary and expandable list
3. support safe `Open`, `Reveal`, and `Copy path`
4. defer per-app opening until the external app policy adapter exists

## 11. Plan Modes

Plan mode is selected per session and visible in the composer.

```ts
type PlanMode =
  | "chat"
  | "plan-only"
  | "plan-then-ask"
  | "auto-execute-safe"
  | "full-agent";
```

Modes:

| Mode | Behavior |
| --- | --- |
| `chat` | Normal conversation. |
| `plan-only` | Produce a plan but do not execute. |
| `plan-then-ask` | Produce a plan, then request confirmation before execution. |
| `auto-execute-safe` | Execute low-risk steps automatically; request approval for risky steps. |
| `full-agent` | Proceed according to the current approval and sandbox policy. |

Rules:

- `plan-only` must not trigger file writes, commands, network calls, or MCP mutations.
- `plan-then-ask` should create a visible plan object that can be approved, edited, or rejected.
- `auto-execute-safe` still respects sandbox policy.
- `full-agent` does not bypass sandbox policy.

## 12. Permissions and Approval

Approval mode:

```ts
type ApprovalMode = "request" | "auto-safe" | "full-access";
```

UI labels:

- `Request approval` - ask before any operation that can affect external state.
- `Auto approve safe` - auto-approve low-risk operations; ask for risky operations.
- `Full access` - minimize interruptions while still respecting sandbox boundaries and audit logging.

Approval actions:

- `Allow once`
- `Allow for session`
- `Deny`

Approval display must include:

- operation type
- risk level
- target scope
- whether files are written
- whether workspace-external paths are touched
- whether network is used
- whether external apps are used
- whether MCP tools or app plugins are invoked
- whether the grant is temporary or persistent

Prefer inline approval blocks or inspector queue over blocking modals. Use modals only for high-risk actions or when no inspector is visible.

Approval grants:

- Approval grants are stored on conversation-backed `SessionMetadata.approvalGrants`.
- Direct/skill tool approval must consult grants before asking the user.
- Agent SDK permission requests must route through the same grant lookup before resolving `canUseTool`.
- `Allow once` creates a non-persistent grant for the current operation.
- `Allow for session` persists a session-scoped grant to conversation metadata.
- Workspace/global grants require a separate settings surface and explicit user confirmation.
- Denials should be auditable but should not create broad persistent state unless the user chooses a persistent deny action.

## 13. Sandbox Policy

Approval policy and sandbox policy are separate.

```ts
interface WorkspaceRuntimePolicy {
  approvalMode: "request" | "auto-safe" | "full-access";
  sandboxMode: "read-only" | "workspace-write" | "system-access";
  writableRoots: string[];
  networkAccess: "blocked" | "approval-required" | "allowed";
  externalAppAccess: "blocked" | "approval-required" | "allowed";
}
```

Rules:

- `approvalMode` decides whether to ask the user.
- `sandboxMode` defines hard execution limits.
- `full-access` approval mode does not bypass sandbox limits.
- Sessions may become stricter without approval.
- Sessions require explicit approval to become less restrictive than workspace policy.
- MCP, skills, hooks, app plugins, search, file access, commands, and external app access must route through the same runtime policy.
- Current code has partial boundaries, not a central sandbox policy. Implement runtime policy as an adapter/guard layer over existing LLM tool execution, Agent SDK permission requests, MCP calls, and plugin APIs.
- Internal app storage writes under Electron `userData` are app-internal state and must be classified separately from user workspace file writes.
- Per-conversation execution directory is always a writable root for that conversation unless session policy is stricter.
- Workspace path and user-configured writable roots define user-file write boundaries.
- File, shell, network, external app, MCP, and plugin operations must call the same operation classifier before execution.

## 14. Extensions

Use one `Extensions` page and one normalized descriptor model.

Extension categories:

- `Capabilities` - agent capability packages.
- `MCP Servers` - tool and data connections.
- `Skills` - `SKILL.md` workflows.
- `Hooks` - lifecycle hooks.
- `App Plugins` - Super Client UI and app feature extensions.
- `Themes` - visual themes and markdown themes.

Existing `Plugin` should be renamed in the UI to `App Plugin`.

Rules:

- `App Plugin` extends application UI and app features: pages, sidebar items, settings panels, themes, windows, menus.
- Agent-facing capabilities should not be presented as generic app plugins.
- Every extension item must show type, scope, source, enabled state, permissions, health, and contribution points.
- Scope must be explicit: `global`, `workspace`, or `session`.
- `ExtensionDescriptor` is a read-only projection for UI, search, health, and policy.
- Write/admin operations stay on service-specific APIs: MCP connection management, Skill install/validation, App Plugin install/reload/permissions.
- Descriptor adapters must not hide lifecycle differences between MCP, Skill, and App Plugin.

## 15. Workspace Settings

Workspace settings should be organized as:

1. `Overview` - name, path, default session type.
2. `Interaction` - Claude desktop, Codex desktop, or Hybrid.
3. `Models` - default provider, model, reasoning, fallback model.
4. `Runtime & Permissions` - approval, sandbox, network, external app access.
5. `Capabilities` - enabled MCP, skills, hooks, app plugins.
6. `Context` - default attachments, workspace knowledge, ignore rules.
7. `Automation` - scheduled tasks and background sessions.
8. `Advanced` - logs, import/export, reset.

Global settings should remain separate and only manage app-wide preferences.

## 16. Data Model Direction

Introduce these durable concepts gradually.

```ts
interface ModelSelection {
  providerId: string;
  modelId: string;
  reasoningEffort?: "low" | "medium" | "high";
  temperature?: number;
  maxOutputTokens?: number;
  contextMode?: "auto" | "compact" | "full";
  fallbackModel?: {
    providerId: string;
    modelId: string;
  };
}

interface EnabledCapability {
  id: string;
  type: "mcp" | "skill" | "hook" | "app-plugin" | "theme" | "capability-package";
  scope: "global" | "workspace" | "session";
  enabled: boolean;
}

interface WorkspaceConfig {
  id: string;
  name: string;
  path?: string;
  interactionProfile: InteractionProfile;
  defaultModel: ModelSelection;
  runtimePolicy: WorkspaceRuntimePolicy;
  enabledCapabilities: EnabledCapability[];
  contextPolicy: WorkspaceContextPolicy;
}

interface SessionConfig {
  id: string;
  workspaceId: string;
  kind: "chat" | "agent" | "plan" | "remote" | "automation";
  modelOverride?: ModelSelection;
  planMode: PlanMode;
  attachmentIds: string[];
  enabledCapabilityOverrides?: EnabledCapability[];
  approvalGrants: SessionApprovalGrant[];
}
```

Avoid moving all existing stores at once. Add adapters first, then migrate consumers.

Initial persistence strategy:

- Store session-level fields on existing conversation metadata first.
- Backfill existing conversations into the default workspace.
- Derive or synchronize workspace `sessionIds` from conversation metadata.
- Keep the current conversation directory layout stable during early phases.

## 17. Core Runtime Requirements

These requirements decide whether the work is actually complete. UI is only valid when it is backed by these behaviors.

### Workspace and Session Kernel

- Workspace config must have a main-process-readable representation.
- Session config must be persisted on conversation metadata during the migration phase.
- Conversation creation must always resolve an effective workspace.
- Chat execution must receive an effective session runtime snapshot before model calls, Agent SDK calls, tool execution, MCP calls, or plugin calls.
- Session overrides must be recorded and auditable: model, plan mode, interaction profile, approval mode, sandbox override, enabled capabilities, and attachment context choices.

### Effective Runtime Snapshot

Every execution path should consume the same resolved shape:

```ts
interface EffectiveSessionRuntime {
  workspaceId: string;
  sessionId: string;
  model: ModelSelection;
  interactionProfile: InteractionProfile;
  planMode: PlanMode;
  runtimePolicy: WorkspaceRuntimePolicy;
  enabledCapabilities: EnabledCapability[];
  attachments: ResolvedAttachmentContext[];
  approvalGrants: SessionApprovalGrant[];
}
```

The resolver should apply:

```text
global defaults -> workspace config -> session metadata -> per-message overrides
```

The first resolver API should be small and explicit:

```ts
interface ResolveSessionRuntimeInput {
  workspaceId?: string;
  sessionId: string;
  messageOverride?: Partial<SessionMessageOverride>;
}

interface SessionRuntimeResolver {
  resolve(input: ResolveSessionRuntimeInput): Promise<EffectiveSessionRuntime>;
}
```

Do not let renderer components manually merge global, workspace, and session state. Renderer reads the resolved snapshot for display and sends explicit mutations through typed IPC.

### Approval and Sandbox Enforcement

- Direct/skill tool approval and Agent SDK permission requests must map to one normalized approval request type.
- MCP calls and App Plugin APIs must be classified before execution.
- Approval grants must be scoped: once, session, workspace, or global.
- Sandbox checks must run even when approval mode is `full-access`.
- Runtime decisions must be written to an audit log that can be surfaced in the inspector.
- Grant lookup must happen before prompting, and grant writes must happen only after an explicit `Allow once` or `Allow for session` user action.
- Internal app storage writes, conversation execution directory writes, workspace file writes, and workspace-external writes must be separate operation classes.

### Attachment Context Pipeline

Composer attachments must become real runtime context, not only UI chips.

Required behavior:

- Persist composer uploads through the main process.
- Attachments must have stable IDs, source metadata, content type, size, and trust state.
- Resolve context at send time according to attachment mode: include content, reference only, ask before read, or ignore.
- Apply model capability checks before injecting content.
- Apply runtime policy before reading files, URLs, external app data, or plugin-provided resources.
- Store the resolved attachment references with the message for replay/debugging.

### Chat File Artifact Pipeline

Tool and agent file operations must produce structured artifacts that the chat UI can render.

Required behavior:

- Capture files created, modified, read, referenced, or attached by tool/agent/plugin operations.
- Persist file artifacts with `conversationId`, `messageId`, workspace-relative path, absolute action path, operation source, and policy state.
- Capture changed-file summaries with additions/deletions and per-file status when write/edit tools mutate files.
- Link file artifacts and change sets back to the originating tool call or audit event.
- Expose safe actions: open, reveal, copy path, view diff, attach/reference.
- Route open/reveal/external-app actions through runtime policy before execution.
- Render file artifacts inline in the assistant turn, not only in a separate attachments manager.

### Extension Runtime Contract

The unified `Extensions` area must be backed by descriptors, not only tabs.

Required behavior:

- MCP server, Skill, Hook, App Plugin, Theme, and capability package each maps to an `ExtensionDescriptor`.
- Descriptor includes type, scope, source, enabled state, permissions, health, contribution points, and runtime entry points.
- Enabling an extension updates workspace/session effective capability state.
- App Plugin remains the term for app UI and app feature extensions.
- Agent-facing capabilities must be separately visible and permissioned even if they are delivered by an App Plugin.

### Agent SDK Runtime Milestone

Agent SDK integration should not be assumed complete just because the direct/skill chat path uses the new runtime.

Required staged behavior:

1. Phase 1: Agent sessions receive `workspaceId`, `sessionId`, and a readonly `EffectiveSessionRuntime` snapshot for display and audit. **✅ done.**
2. Phase 2: Agent SDK permission requests map into the normalized approval model and grant lookup. **✅ done** — `canUseTool` consults `ApprovalGrantStore` and writes new grants on user choice.
3. Phase 6: Agent SDK model switching remains labelled as limited until the provider/model chain can consume `ModelSelection`. Model in/out today still goes through `resolveOptimalConfig` separately. ⏳ pending provider chain refactor.
4. Final milestone: Agent SDK query setup reads compatible runtime fields for model, sandbox, enabled capabilities, and approval policy. ⚙️ partial — see §29 first slice below.

> **§29 first slice — done (2026-06-19).** `AgentSDKService.createQuery` now consults the resolved runtime to derive defaults the caller didn't supply:
>
> - `runtime.planMode === "plan-only"` → `permissionMode = "plan"` (Agent SDK plans without acting). Mirrors the LLMService gate from R-5.
> - `runtime.runtimePolicy.approvalMode === "full-access"` → `permissionMode = "bypassPermissions"` (skip `canUseTool`).
> - Other approvalModes → `"default"` (`canUseTool` runs and consults grants).
> - `cwd` falls back through `resolveConversationCwd(sessionId)` (R-4) before `process.cwd()`, so workspaces with `WorkspaceConfig.path` set drive Agent SDK's working directory too.
>
> Caller-supplied `request.permissionMode` and `request.cwd` still win. The runtime resolution is "fill the gaps" only.
>
> Out of scope this slice: model/sandbox/capability fields. Model still goes through `resolveOptimalConfig`; sandboxMode and enabledCapabilities aren't read by Agent SDK at all yet — both belong to the larger provider chain refactor.

## 18. Visual Direction

The app should feel like an engineering workbench, not a marketplace dashboard.

Guidelines:

- Remove dominant blue/purple gradients from core navigation and title markers.
- Use low-saturation surfaces and one restrained accent color.
- Keep radius around 6-8px for tool UI.
- Use compact panes, lists, timelines, and inspectors.
- Use cards only for extension marketplace items and settings sections.
- Avoid nested cards.
- Tool calls should render as compact blocks with expandable detail.
- Plan state should render as a timeline or stepper.
- Model, permissions, sandbox, and plan mode should render as chips/status controls.
- Approval UI should be inline or in inspector queue by default.

## 19. Migration Phases

### Phase 0 - Implementation Audit and Session Metadata

Goal: align the plan with the existing conversation-backed runtime.

Tasks:

- Treat existing `ConversationSummary` metadata as the first session backing store.
- Add session metadata types for `workspaceId`, `kind`, `planMode`, model override, interaction profile override, and runtime policy override.
- Backfill existing conversations into the default workspace.
- Keep the current per-conversation execution directory unchanged.

Validation:

- Existing conversations still load.
- New conversations are associated with a workspace.
- No separate session persistence layer is introduced yet.

### Phase 1 - Workspace and Session Runtime Contract

Goal: make `Workspace -> Session` real in data and execution before relying on UI changes.

Tasks:

- Define main-process-compatible `WorkspaceConfig`, `SessionMetadata`, `ModelSelection`, `WorkspaceRuntimePolicy`, and `EnabledCapability` types.
- Move the typed Electron API shape into `packages/shared-types/src/electron-api.ts` and make preload/main implementations conform to it.
- Make main-process `WorkspaceConfig` the source of truth for runtime configuration.
- Persist workspace config in a place readable by the main process.
- Backfill renderer-persisted `useWorkspaceStore` workspaces into main-process `WorkspaceConfig`.
- Add a runtime resolver that returns `EffectiveSessionRuntime`.
- Route conversation creation and conversation switching through workspace/session binding.
- Backfill existing conversations into the default workspace.
- Keep renderer workspace store as a UI cache until main-process state sync is complete.
- Define the model resolution adapter and apply it to direct/skill chat before `modelService.chatCompletion()`.

Validation:

- Existing conversations still load.
- Every new conversation has a workspace ID.
- Direct/skill chat can receive an effective runtime snapshot.
- Renderer state can be rebuilt from persisted workspace/conversation metadata.
- New IPC namespaces are represented in the shared Electron API contract.
- Global active model is only a fallback once workspace/session model state exists.

### Phase 2 - Runtime Policy and Approval Kernel

Goal: enforce permissions and sandbox behavior below the UI.

Tasks:

- Define normalized approval request, approval grant, operation classification, and audit event models.
- Add approval grant read/write helpers on conversation-backed session metadata.
- Map existing direct/skill tool approval into the normalized approval model.
- Map Agent SDK permission requests into the normalized approval model.
- Add runtime policy checks for file, command, network, MCP, external app, and plugin actions.
- Classify internal app storage, conversation execution directory, workspace path, configured writable roots, and workspace-external paths separately.
- Enforce workspace-write by default.
- Add explicit approval path for less restrictive session overrides.
- Persist approval and sandbox decisions to audit logs.

Validation:

- Existing approval flows still work.
- `full-access` approval mode does not bypass sandbox policy.
- Workspace-external writes are blocked or require approval according to policy.
- Approval grants are scoped to the current session unless explicitly promoted.
- `Allow for session` immediately changes later approval decisions in the same session.

### Phase 3 - Attachment, File Artifact, and Context Kernel

Goal: make attachments, generated files, changed-file summaries, and context selection affect actual runtime behavior safely.

Tasks:

- Replace renderer-only composer file handling with main-process persisted attachments.
- Add attachment metadata, content mode, trust state, and message references.
- Add attachment context resolver.
- Implement attachment-to-message-block mapping for text/code/markdown, image, binary, folder, URL, and MCP resource inputs.
- Add token budgeting and summarized metadata for `reference-only` attachments.
- Add send-time `ask-before-read` approval for workspace-external or sensitive attachment reads.
- Add chat file artifact and change-set models.
- Capture file artifacts from file-system, patch/write, and agent/tool result paths.
- Add safe open/reveal/copy action metadata for file artifacts.
- Add model capability checks for images, files, long context, and tool-required context.
- Apply runtime policy before reading attachment content or external resources.
- Apply runtime policy before opening files in external apps or revealing them in Finder.
- Preserve resolved context references for replay/debugging.

Validation:

- Sending a message with an attachment passes the expected context to the runtime.
- File write/edit results produce file cards and changed-file summaries in the assistant turn.
- Unsupported model/content combinations show warnings and do not silently inject data.
- Existing attachment management remains usable.
- Message history records which attachment references and content blocks were actually sent.

### Phase 4 - Extension Descriptor and Capability Kernel

Goal: normalize MCP, skills, app plugins, hooks, themes, and capability packages for runtime and UI.

Tasks:

- Add `ExtensionDescriptor` adapter layer.
- Map existing MCP servers to descriptors.
- Map existing skills to descriptors.
- Map existing plugins to `App Plugin` descriptors.
- Preserve existing MCP, Skill, and Plugin services as backing services.
- Connect descriptors to effective workspace/session enabled capabilities.
- Classify extension permissions for runtime policy.

Validation:

- Enabling/disabling existing MCP, skill, and plugin items still calls existing services.
- Effective runtime includes enabled capabilities.
- Descriptor layer does not replace runtime services yet.

### Phase 5 - Information Architecture and Settings UI

Goal: expose the new kernel model clearly without duplicating state.

Tasks:

- Add `Extensions` page as the unified entry.
- Move MCP, skills, and app plugins into tabs/sections under `Extensions`.
- Hide old `MCP`, `Skills`, and `Plugins` first-level sidebar items.
- Keep existing routes for compatibility, but redirect or render the matching `Extensions` tab.
- Add a menu migration for users with persisted menu config.
- Migrate navigation shortcuts that point to old extension routes.
- Add workspace settings pages: overview, interaction, models, runtime, capabilities, context, automation, advanced.
- Render settings from persisted/effective runtime state rather than independent UI-only state.

Legacy route strategy:

| Existing route/action | New target | Notes |
| --- | --- | --- |
| `/mcp` | `/extensions?tab=mcp` | Keep route shell during migration so deep links do not break. |
| `/skills` | `/extensions?tab=skills` | Preserve skill detail/use-in-chat flows. |
| `/plugins` | `/extensions?tab=app-plugins` | User-facing copy becomes `App Plugin`. |
| persisted menu id `mcp` | menu id `extensions`, tab `mcp` | Migrate only first-level nav state, not MCP service state. |
| persisted menu id `skills` | menu id `extensions`, tab `skills` | Shortcut labels should change to Extensions/Skills tab. |
| persisted menu id `plugins` | menu id `extensions`, tab `app-plugins` | Preserve plugin page routes under `/plugin/:pluginId/*`. |

Validation:

- Existing MCP, skill, and plugin flows still work.
- Changing workspace settings updates effective runtime.
- Legacy navigation entries do not remain as first-level items after migration.
- Old shortcuts and deep links land on the correct `Extensions` tab.

### Phase 6 - Composer, Model Switcher, and Plan Mode

Goal: make chat-time decisions explicit and backed by runtime state.

Tasks:

- Add composer model chip.
- Add command-palette style `Model Switcher` modal.
- Support save as session override and save as workspace default.
- Add plan mode selector and send-time propagation.
- Add attachment context chips driven by persisted attachment metadata.
- Add capability selector entry.
- Add status bar for model, plan mode, approval, sandbox, capabilities, and context.
- First model switcher version targets direct/skill chat; Agent SDK model switching requires provider-chain support before it is shown as fully supported.
- Model switcher writes through typed IPC to session metadata or main-process `WorkspaceConfig`; it must not mutate renderer-only model state as the effective source.

Validation:

- Sending a message still works.
- Session model override affects only future responses.
- Reset to workspace model works.
- Plan mode changes are persisted on session metadata.
- Model compatibility warnings reflect the resolved runtime model and current attachments/capabilities.

### Phase 7 - Approval UI and Runtime Inspector

Goal: expose runtime decisions in the conversation and inspector.

Tasks:

- Add inline approval block.
- Add inspector approval queue.
- Show operation type, risk level, target scope, sandbox decision, and grant duration.
- Support `Allow once`, `Allow for session`, and `Deny`.
- Show audit trail for tool/MCP/plugin/file/network decisions.

Validation:

- Existing tool approval still works.
- Agent SDK permission requests appear in the same UI.
- Approval grants affect runtime decisions immediately.

### Phase 8 - App Plugin Rename and Scope

Goal: clarify app UI extensions versus agent capabilities.

Tasks:

- Change user-facing copy from `Plugin` to `App Plugin`.
- Group permissions by app UI, app storage, agent runtime, network, file system.
- Add scope display: global, workspace, session.
- Keep internal type names initially for compatibility.

Validation:

- Existing installed plugins remain usable.
- Settings panels contributed by plugins still render.

### Phase 9 - Profile-Specific UI

Goal: make Claude and Codex references real workflow differences, using the provided screenshots as the benchmark.

Tasks:

- Claude mode: centered new-session greeting, large composer, quick intent chips, left recents/project sidebar, compact transcript, command-first composer, inline tools.
- Codex mode: persistent project/session sidebar, coding task transcript/timeline, right environment inspector, file/change cards, approval queue, branch/local/source status.
- Hybrid mode: Claude start state with Codex panels revealed when tools, files, approvals, sources, or plan state appear.
- Remove the legacy right-side chat history drawer from the primary shell after the left project/session sidebar is available.
- Replace purely cosmetic profile CSS with structural layout changes controlled by the effective interaction profile.

Validation:

- Switching interaction profile changes layout and workflow surfaces.
- Session override can temporarily switch profile.
- Empty/new chat visually matches the Claude screenshot: centered greeting, large composer, mode chips, minimal chrome.
- Coding/agent session visually matches the Codex screenshot: project sessions on the left, transcript/timeline in the center, environment inspector on the right.
- Codex environment inspector displays real change counts, runtime mode, branch, commit/push action, and source/context state.
- Claude profile does not show Codex's right inspector for ordinary empty/chat sessions.

## 20. Phase Dependencies and Rollback

Development must respect this dependency graph:

```text
Phase 0 audit
  -> Phase 1 workspace source of truth + Electron API contract + EffectiveSessionRuntime
    -> Phase 2 approval grants + runtime policy classifier
      -> Phase 3 attachment/file artifact context kernel
      -> Phase 4 extension descriptors
        -> Phase 5 IA/settings migration
          -> Phase 6 composer/model/plan UI
          -> Phase 7 approval UI/inspector
            -> Phase 8 app plugin naming
              -> Phase 9 profile-specific layouts
```

Phase 6 UI must not ship as final behavior before Phase 1 and Phase 2 are working, because model, plan, approval, sandbox, and attachment controls would otherwise be cosmetic.

Feature flags:

- `workspaceRuntime.enabled`: use main-process `WorkspaceConfig` and conversation-backed session metadata.
- `effectiveRuntimeResolver.enabled`: route chat execution through `EffectiveSessionRuntime`.
- `runtimePolicy.enforce`: enforce operation classifier decisions instead of logging only.
- `extensionsUnified.enabled`: show unified `Extensions` route and migrated navigation.
- `chatFileArtifacts.enabled`: render file cards and changed-file summaries.
- `profileLayouts.enabled`: enable Claude / Codex profile-specific layout changes.

Rollback strategy:

- Keep existing conversation storage and per-conversation workspace directories stable through Phase 3.
- Keep old MCP, Skill, and Plugin backing services active while descriptor adapters are introduced.
- Allow disabling unified `Extensions` navigation while old routes still render their existing pages.
- Allow runtime policy to run in audit-only mode before enforcement is enabled.
- Allow `EffectiveSessionRuntime` to fall back to global model/provider state only when workspace/session model state is absent.
- Store migrations must be additive and idempotent; do not delete renderer workspace or legacy menu data until a later cleanup phase.

## 21. Development Task Breakdown

Suggested initial task order:

1. `implementation-audit`: land Phase 0 audit notes.
2. `workspace-source-of-truth-migration`: make main-process `WorkspaceConfig` authoritative and backfill renderer-persisted workspaces.
3. `electron-api-contract`: add shared `ElectronAPI` contract and make preload/main implementations conform.
4. `session-metadata-types`: define session metadata on top of conversation metadata.
5. `workspace-conversation-binding`: assign conversations to workspace IDs and backfill defaults.
6. `workspace-config-main-readable`: persist workspace config in a main-process-readable form.
7. `effective-runtime-resolver`: resolve global/workspace/session/message settings into one runtime snapshot.
8. `model-resolution-adapter`: apply resolved model selection to direct/skill chat and define Agent SDK limitation state.
9. `runtime-policy-service-skeleton`: add operation classification and audit logs before hard enforcement expands.
10. `approval-grants-store`: add session-scoped grant lookup/write helpers and auditable deny records.
11. `approval-adapter`: normalize LLM tool approval and Agent SDK permission requests.
12. `runtime-policy-enforcement-file-command`: enforce file/command policy on the highest-risk local operations first.
13. `attachment-persistence-for-composer`: replace renderer-only chat upload with main-process persisted attachments.
14. `attachment-context-resolver`: add attachment context mode, model input mapping, token budget, and request-time resolution.
15. `chat-file-artifact-model`: define file artifact and change-set types tied to messages/tool calls.
16. `file-operation-action-adapter`: expose safe open, reveal, copy path, and later app-open actions through policy-aware IPC.
17. `chat-file-artifact-capture`: capture file artifacts from file-system/write/patch/tool result paths.
18. `chat-file-card`: render Codex-style file cards inside assistant turns.
19. `changed-files-summary`: render collapsible changed-files summary with additions/deletions and file rows.
20. `extension-descriptor-adapter`: normalize MCP/Skill/App Plugin for runtime and unified UI without replacing service-specific admin APIs.
21. `workspace-capability-state`: connect enabled extension descriptors to workspace/session runtime.
22. `extensions-shell`: create unified Extensions page shell and route.
23. `legacy-extension-route-redirects`: redirect `/mcp`, `/skills`, and `/plugins` to the correct Extensions tab.
24. `menu-migration-extensions`: add Extensions nav item and demote legacy MCP/Skills/Plugins entries.
25. `workspace-settings-shell`: add workspace settings pages wired to real config/effective runtime.
26. `model-switcher-direct-skill`: implement model switcher modal using effective runtime for direct/skill chat.
27. `composer-status-bar`: add model, plan mode, approval, sandbox, and context status chips.
28. `plan-mode-state`: add session-level plan mode state and send-time propagation.
29. `agent-sdk-runtime-alignment`: route Agent SDK approval first, then model/capability fields when provider-chain support exists.
30. `approval-ui`: replace modal-first approval with inline/inspector-capable UI.
31. `app-plugin-copy`: rename user-facing plugin terminology.
32. `claude-empty-chat-shell`: implement Claude-style centered greeting, large composer, quick intent chips, and recents sidebar for new/general chat.
33. `codex-task-workbench-shell`: implement Codex-style project/session sidebar, transcript/timeline center, and right environment inspector.
34. `profile-layouts`: wire Claude / Codex / Hybrid structural layout switching through the effective interaction profile.

### Session creation/deletion link refactor (plan §25)

These tasks replace the historical "5 surfaces, 3 implicit types" sprawl with the canonical 3-intent design. Sequence-wise they sit after the per-conversation workspace binding (§4) lands and after the right-click context menu (§23.2) ships, but before any further UI on top of creation flows.

35. `35-link-1` sidebar 新建对话 rebound to `default` workspace (drop "current workspace" semantics).
36. `35-link-2` remove TitleBar More menu's separate `新建 Agent 对话` / `新建远程对话` items; add unified `新建对话…` that opens the modal.
37. `35-link-3` build `<NewConversationModal>` (workspace / mode / remote-bot picker) wired to `chat:open-new-conversation` window event.
38. `35-link-4` add `chatStore.createConversationAdvanced` action that handles workspace switch + create + remote bind in one call.
39. `35-link-5` refactor `chatStore.deleteConversation` to resolve "next current" before delete, auto-unbind remote, and clear `fileArtifactStore`.
40. `35-link-6` `SessionContextMenu.handleDelete` surfaces remote-binding warning ("此会话已绑定 IM bot，删除会同时解绑") in the confirm modal.

Each task should be independently buildable and testable.

## 22. Acceptance Criteria

The redesign is complete when:

- Every session belongs to a workspace.
- Main-process `WorkspaceConfig` is the authoritative workspace runtime source; renderer workspace state is cache/UI state only.
- New IPC namespaces conform to the shared `ElectronAPI` contract.
- Sessions inherit workspace model, permission, sandbox, interaction, and capability config.
- Every execution path can receive or derive an `EffectiveSessionRuntime` snapshot.
- Chat supports fast session-level model switching.
- The model switcher can save either session override or workspace default.
- Model resolution follows global fallback, workspace default, session override, then per-message override.
- Chat supports attachments with explicit context mode.
- Attachments are resolved into actual model input or reference metadata according to context mode, token budget, model capability, and approval policy.
- Assistant turns render generated/modified files as Codex-style file cards.
- File cards support open, reveal, copy path, and later open-with-app actions through runtime policy.
- File write/edit turns render changed-files summaries with additions/deletions and expandable detail.
- Chat supports plan mode selection before sending.
- MCP, skills, hooks, app plugins, and themes appear under one Extensions area.
- Existing app plugins are presented as `App Plugins`.
- Approval mode has three options: request approval, auto approve safe, full access.
- `Allow once` and `Allow for session` are backed by real grant lookup/write behavior.
- Sandbox policy remains a hard boundary even in full access mode.
- Operation classification distinguishes internal app writes, conversation execution writes, workspace writes, external writes, commands, network, MCP, plugin, and external app actions.
- Claude and Codex interaction profiles materially change workflow, not only colors or spacing.
- Claude-style empty chat has a centered greeting, large composer, quick intent chips, and simple recents/project sidebar.
- Codex-style coding sessions have project-grouped sessions on the left, transcript/timeline in the center, and an environment inspector on the right.
- The Codex environment inspector displays real changes, runtime mode, branch, commit/push action, approvals, and source/context state.
- Existing MCP, skill, plugin, model, and chat flows continue to work during migration.
- Legacy `/mcp`, `/skills`, and `/plugins` navigation remains compatible while first-level navigation moves to `Extensions`.
- Rollback flags can disable unified navigation, runtime enforcement, file artifacts, and profile layouts without corrupting stored conversations.
- Session creation surfaces match the canonical three intents documented in §25.2; legacy "5 ad-hoc surfaces" is gone.
- Session list items expose the right-click context-menu actions defined in §23.2; deletion follows the §25.4 link (next-focus resolution → remote unbind → physical delete → artifact cleanup).
- Conversations with a remote binding surface the auto-unbind warning in the delete confirmation modal.
- `createConversationAdvanced` is the single entry point used by `<NewConversationModal>`; no callsite bypasses `chatStore` actions to write conversations or remote bindings directly.
- Sidebar exposes a draggable right edge with persisted width; the previously rendered "search" button and the collapse toggle are both removed (the latter per §24.3).

## 23. Session Lifecycle & Interactions

### 23.1 Creation surfaces

> **Authoritative spec moved to §25**. This subsection now only enumerates the surfaces; the contract for each surface (which workspace, which mode, what gets pre-selected) lives in §25.2 so there is one source of truth.

Allowed creation surfaces, post-refactor:

1. **Sidebar quick action 新建对话** — fixed to `default` workspace, `direct` mode. Shortcut `Cmd/Ctrl+N`.
2. **Sidebar project row hover `+`** — fixed to that project workspace, `direct` mode.
3. **TitleBar More menu 新建对话…** — opens `<NewConversationModal>` where workspace / mode / remote are explicit user choices.
4. **Empty home composer (Claude profile)** — first-message lazy creation under the current workspace + `direct` mode.

Removed surfaces (folded into the modal in surface 3):
- ❌ TitleBar `新建 Agent 对话` (subsumed by modal mode picker)
- ❌ TitleBar `新建远程对话` (subsumed by modal remote toggle)

Persistence shape, regardless of surface, remains a single `ConversationSummary` + `SessionMetadata` row.

Rules:
- Workspace inheritance: every surface must explicitly pass `workspaceId`. "Use whichever workspace happens to be current" is the historical bug fixed in §25.
- Mode lock: once first message is sent, `chatMode` becomes immutable.
- Session metadata defaults: `planMode = "chat"`, `attachmentIds = []`, `interactionProfile = workspace default`.

### 23.2 Right-click context menu

Right-clicking a session row in the sidebar opens a context menu with the items below. Disabled items render but show a tooltip explaining when they will work. The menu order matches the user-supplied reference design.

| Section | Item | Behavior |
|---|---|---|
| 1 | 置顶对话 / 取消置顶 | Toggle `session.pinned` flag. Pinned sessions sort to top within their project group. |
| 1 | 重命名对话 | Inline input on the row (focus + select). Saves on Enter, cancels on Esc. |
| 1 | 归档对话 / 取消归档 | Toggle `session.archived`. Archived sessions hide from main lists; visible under a collapsible "已归档" group. |
| 1 | 标记为未读 / 标记为已读 | Toggle `session.unread`. Renders a small dot on the row when unread. |
| 2 | 在 Finder 中显示 | `fileAction.reveal(conversationCwd)`. |
| 2 | 复制工作目录 | Copy `conversationCwd` to clipboard. |
| 2 | 复制会话 ID | Copy `conversation.id`. |
| 2 | 复制深度链接 | Copy `superclient://conversation/<id>` to clipboard. App's protocol handler resolves it back to switching to that session. |
| 3 | 派生到本地 | Create a new conversation in the same workspace whose metadata + messages are deep-cloned, but `cwd` is the same workspace folder (not a new one). Useful for forking a transcript without git. |
| 3 | 派生到新工作树 | macOS only. Run `git worktree add` from the conversation's cwd, point the new conversation's cwd to the worktree. Disabled when the cwd is not a git working tree. |
| 4 | 在新窗口中打开 | Open a secondary `BrowserWindow` showing only this conversation. Future task — disable with placeholder tooltip until window manager supports it. |
| 5 | 删除对话 | Danger style. Confirm modal calls `chatStore.deleteConversation`. Full deletion contract (next-focus resolution, remote auto-unbind, file-artifact cleanup) lives in §25.4. When the conversation has a remote binding the modal must surface "此会话已绑定 IM bot，删除会同时解绑". |

### 23.3 Conversation persistence additions

`SessionMetadata` is extended (optional fields, backward-compatible):

```ts
interface SessionMetadata {
  // existing fields
  pinned?: boolean;
  archived?: boolean;
  unread?: boolean;
  forkOriginId?: string;       // set by 派生到本地 / 派生到新工作树
  worktreePath?: string;       // set by 派生到新工作树 (absolute path on disk)
}
```

### 23.4 Sidebar list rules

- Pinned sessions appear above non-pinned within each project, separated by a thin divider.
- Archived sessions hide unless the "已归档" toggle is expanded.
- Unread sessions show a small primary-color dot on the right side of the row.
- Active session highlighted (already implemented).
- Session row right-click → context menu above; left-click → switch.

## 24. Sidebar Interactions

### 24.1 Resize handle

The left sidebar exposes an 8px-wide hit area on its right edge. At rest the seam is invisible; on hover a 1px vertical pin fades in (`colorBorder`); during drag the pin switches to `colorPrimary`. Cursor is `col-resize`. Drag adjusts width within `[220, 480]` px; double-click resets to default `280`. Width persists in zustand persist (`sidebarLayoutStore`).

### 24.2 Search button removal

Plan §6 originally listed a "搜索" quick action in the sidebar. With Cmd/Ctrl+K already triggering the same `chat:toggle-search` event globally, the dedicated row creates noise. Removed from both ClaudeSidebar and AppSidebar quick-action lists. Behavior remains accessible via:

- Cmd/Ctrl+K (global)
- TitleBar More menu (later iteration)

### 24.3 Collapse removed

The collapse toggle button was removed from both sidebars per user feedback ("不要收缩按钮，需要侧边可拖拽"). Resize is the only width-control affordance now. The persisted `collapsed` flag is force-reset to `false` on sidebar mount so legacy users who shipped with `collapsed=true` do not get stuck at 60px. The store key is kept (no schema migration) but treated as dead state; it can be removed in a follow-up cleanup.

## 25. Session Creation & Deletion Link

This section consolidates session lifecycle so creation and deletion stop sprawling across 5 ad-hoc surfaces.

### 25.1 Session-type taxonomy

All sessions persist as one `ConversationSummary` row. They differ along **three independent axes**, not as separate types:

| Axis | Values | Default | Notes |
|---|---|---|---|
| `workspaceId` | `default` \| user-created workspace id | current workspace | Every session belongs to exactly one workspace. |
| `chatMode` | `direct` \| `agent` | `direct` | Locked after first user message. |
| `remote` | `undefined` \| `RemoteBinding` | undefined | Set only when an IM bot bridges this conversation. |

Three product names from the user reference, mapped to the axes:

| Product name | workspaceId | chatMode | remote |
|---|---|---|---|
| 普通对话 (general) | `default` | `direct` | — |
| 项目对话 (project) | user workspace | `direct` or `agent` | — |
| 远端对话 (remote) | any workspace | `direct` (typically) | bound |

There is no "session without a workspace" — the seeded `default` workspace is the catch-all.

### 25.2 Creation entry points (canonical, after refactor)

Reduce the surfaces to **three clear intents**:

| Intent | Surface | Workspace | Mode | Remote | Speed |
|---|---|---|---|---|---|
| Quick general chat | Sidebar top quick action `新建对话` · `Cmd/Ctrl+N` | `default` | `direct` | — | 0 click after trigger |
| Project chat | Sidebar project row `+` (hover) | that project | `direct` | — | 0 click after trigger |
| Advanced (agent / remote / pick workspace) | TitleBar More menu `新建对话…` → modal | user picks | user picks | user picks | 1 modal |

After refactor:
- **Removed** from sidebars: `搜索` already removed; the standalone "新建对话" handler still exists but **always creates under the `default` workspace** (matches the visible "普通对话" intent — current code creates under whatever workspace happens to be selected, which is confusing).
- **Removed** from TitleBar More menu: the standalone `新建 Agent 对话` and `新建远程对话` items. They are subsumed by `新建对话…` modal where the user explicitly picks mode + remote.
- **Kept**: ClaudeEmptyChatHome composer first-message creation continues to lazily create a session in current workspace + `direct` mode. (Same as Cmd+N path.)

### 25.3 Advanced creation modal

Component: `<NewConversationModal>` (new). Trigger: TitleBar More menu, deep-link, or future "+" affordances.

Form fields (Antd `Form`):
1. **工作区** — Select listing all workspaces, default = current.
2. **模式** — Radio.Group: `direct (标准对话)` / `agent (Agent SDK，带工具)`.
3. **远端绑定** — optional Switch + secondary fields. When on, requires picking an IM bot from the registered bots and a chat id (or "create on send"). Disables `agent` mode (mutual exclusion: remote conversations must be `direct` for now).
4. **名称** — optional text. Defaults to `新对话` if omitted.

Submit:
- Call `chatStore.createConversationAdvanced({...})` (new wrapper around existing `createConversation` + remote-bind IPC).
- Switch workspace to the chosen one if different.
- Switch to the new conversation. Navigate to `/chat`.

### 25.4 Deletion link (unified)

Single deletion source: `SessionContextMenu` → `删除对话` (red) with confirmation modal.

After confirmed delete, `chatStore.deleteConversation(id)` MUST:

1. Resolve "next conversation to focus" BEFORE physically deleting:
   - If the deleted conversation is NOT the current one, do nothing post-delete.
   - If the deleted IS the current one, pick the next active (non-archived) conversation in the SAME workspace, sorted by `updatedAt desc`.
   - Otherwise pick the most-recently-updated active conversation in any workspace.
   - If still none, set `currentConversationId = null` and route to `/chat` (empty home will render).
2. If the deleted conversation has `remote` binding: call the existing `remoteChat.unbind(id)` IPC BEFORE physical delete to avoid orphan bindings on the IM bot side.
3. Physical delete via `chatHistoryService.deleteConversation(id)` (already removes the per-conversation directory).
4. Local state cleanup: drop from `useChatStore.conversations`, drop attached file artifacts (`useFileArtifactStore.clearForConversation(id)`).

No batch delete in this iteration. Soft delete = `archive`; hard delete = this menu item.

### 25.5 Behavior matrix (post-refactor)

| Trigger | Result |
|---|---|
| Sidebar `新建对话` | Create in `default` workspace, `direct`, navigate `/chat`. |
| Sidebar project row `+` | Create in that workspace, `direct`, expand the project group. |
| TitleBar `新建对话…` | Open modal. User chooses workspace + mode + remote. |
| `Cmd/Ctrl+N` | Equivalent to sidebar `新建对话`. |
| Right-click → 删除对话 | Confirm → unbind remote (if any) → delete → focus next. |
| Right-click → 派生到本地 | Create copy in same workspace (existing). |
| Right-click → 派生到新工作树 | Git worktree fork (existing). |

### 25.6 Implementation tasks

| ID | Task | Status |
|---|---|---|
| 35-link-1 | Sidebar `新建对话` rebound to `default` workspace path (drop "current workspace" semantics). | ✅ |
| 35-link-2 | Remove `新建 Agent 对话` / `新建远程对话` items from TitleBar More menu; replace with `新建对话…`. | ✅ |
| 35-link-3 | Build `<NewConversationModal>` (workspace / mode / remote bot picker). | ✅ |
| 35-link-4 | `chatStore.createConversationAdvanced` action + wire to modal. | ✅ |
| 35-link-5 | Refactor `chatStore.deleteConversation` to resolve "next current" and clear file artifacts; auto-unbind remote. | ✅ |
| 35-link-6 | Update `SessionContextMenu.handleDelete` to surface remote-binding warning when relevant ("此会话已绑定 IM bot，删除会同时解绑"). | ✅ |

Companion deliverable: `docs/workspace-session-creation-flow.md` — flowcharts and sequence diagrams of the post-refactor link.

## 26. Plan Review (2026-06-19)

This is a critical pass over the whole document. The user's framing was "感觉一直在新建功能没有重构" — and after walking the plan top-to-bottom, that's an accurate read of how new sections kept getting bolted on. This section records what's broken, what's redundant, and what should be done next so the plan stops drifting.

### 26.1 Health by section

| Section | State | Concern |
|---|---|---|
| §1–§3 product model & nav | Solid | None — these are still the right framing. |
| §4 Pre-Phase 1 | Partially landed; flagged "complete" in task queue | `useWorkspaceStore` is still authoritative for several fields in renderer code (e.g. order/icon/createdAt); main is source-of-truth only for `currentWorkspaceId / defaultWorkspaceId`. **Refactor needed**: see §26.4 R-1. |
| §5 interaction profiles | Done | Profile routing is shipping. |
| §6 chat page layout | Done | `shell-1..6` ✅. |
| §7 composer | Done structurally; missing capability/scope chips for Agent SDK constraints | Acceptable. |
| §8 model switcher | Done | Modal exists. |
| §9 attachments | "Text-only slice" only | Plan calls for include-content / reference-only / ask-before-read / ignore. Only include-content shipped. **Drift between plan and reality.** |
| §10 chat file results | Done minimal | File card + change set + open/reveal/copy-path; no diff view, no open-with-app via runtime policy. |
| §11 plan modes | UI only; not enforced | `plan-only` doesn't actually block tool execution. **Enforcement gap.** |
| §12 permissions/approval | UI present; grant store wired; **enforcement is audit-only** | Sandbox checks aren't actually blocking. Critical gap. |
| §13 sandbox | Audit-only | Same as above. |
| §14 extensions | Descriptor adapter + extensions page shipped; Hooks tab empty placeholder | Acceptable for now. |
| §15 workspace settings | Shell shipped | Some panels are placeholders. |
| §16 data model direction | Stable | `SessionConfig` interface in §16 is the *future* shape, not what's persisted. Today we still piggyback on `ConversationSummary` + `SessionMetadata`. **Need an explicit "current vs target" note.** |
| §17 core runtime requirements | Aspirational; partially achieved | EffectiveSessionRuntime resolver exists but only some callsites consume it. **Sweep needed** — see §26.4 R-2. |
| §18 visual direction | Done | UI matches the references. |
| §19 phases | Phases 0–9 marked "complete" but a chunk are minimum-viable slices | The phase model encourages "shipped a slice → mark phase done"; reality is enforcement / Agent SDK alignment / advanced approval flows still incomplete. |
| §20 dependencies & rollback | Stable | Feature flags shipped. |
| §21 task list | Was 32 tasks; 35-link 1–6 added in §25 | Task IDs in §25 don't match the §21 numbering style (35-link-1 vs `36`). Renumbered in this pass — §21 now lists items 35–40. |
| §22 acceptance criteria | Updated this pass | Now reflects §25 link refactor + §24.3 collapse removal. |
| §23 session lifecycle | Updated this pass to delegate creation/deletion contracts to §25 | OK. |
| §24 sidebar interactions | Updated this pass (resize redesign + collapse removed) | OK. |
| §25 creation/deletion link | New, fully implemented | OK. |

### 26.2 Things that look like "new features" but should be refactors

The user's instinct that recent work has been net-new rather than cleanup is correct in places. Here's the honest assessment:

| Recent work | New feature or refactor? | Comment |
|---|---|---|
| ClaudeEmptyChatHome | New surface | Justified — Phase 9 deliverable. |
| CodexEnvironmentInspector | New surface | Justified — Phase 9 deliverable. |
| TitleBar simplify | Refactor | Removed clutter. |
| IDE switcher in TitleBar | New feature | Convenient but doesn't reduce existing chaos. |
| Session right-click menu | New feature | Was missing from the product. |
| §25 creation/deletion link | **Refactor** | This is the first piece of recent work that's purely consolidation. |
| Sidebar resize handle redesign | Refactor | UI cleanup. |
| Collapse-button removal | Refactor | Reduce surface. |

So §25 + sidebar cleanup is on the right side of the line, but the body of recent work prior to §25 was net-new. The remaining refactor backlog is in §26.4.

### 26.3 Redundancy and stale content

Cleaned up in this review:
- §23.1 used to redeclare creation surfaces; now defers to §25.2.
- §23.2's deletion row used to redeclare next-focus behavior; now defers to §25.4.
- §24.3 used to describe collapse persistence; collapse is removed, the section now records that.
- §21 task list now includes items 35–40 (the 35-link refactor) instead of leaving them in §25 only.
- §22 acceptance criteria updated.

Still redundant after this pass:
- `SessionConfig` interface in §16 vs `SessionMetadata` actually persisted today. Add a "current shape" block in §16 alongside the target.
- §17.4 (attachment context pipeline) lists features the implementation hasn't shipped (`reference-only`, `ask-before-read`). Status note needed so the plan stops claiming behavior the code can't deliver.

### 26.4 Refactor backlog (the actual unfinished work)

Each item below is a **refactor**, not a feature. They are sequenced; doing them out of order leaves the contradictions in place.

**R-1 — Workspace store dual-source-of-truth cleanup.** Renderer `useWorkspaceStore` still owns several fields the plan said main should own (workspace order, icon, createdAt/updatedAt). Push these to `WorkspaceConfig` in main, make the renderer read-through. Without this, the §25 work ("always pass workspaceId explicitly") still leaves the underlying state divergent.

> **R-1 phase 1 — done (2026-06-19).** `WorkspaceConfig` extended with optional `icon` / `order`; backfill payload carries them; `useWorkspaceStore.{createWorkspace,updateWorkspace,reorderWorkspaces,deleteWorkspace}` dual-write to main via `workspaceRuntimeService.saveConfig` / `deleteConfig`. Main is now capable-of-truth.
>
> **R-1 phase 2 — done (2026-06-19).** `useWorkspaceConfigStore` extended with `defaultId` and a `useSortedWorkspaceConfigs()` hook (memoized; safe to use as a render selector). All simple-display consumers flipped:
>
> - TitleBar More-menu workspace switcher
> - ClaudeSidebar workspace nav and quick-action default workspace lookup
> - AppSidebar workspace list / per-project create / conversation switch
> - NewConversationModal workspace picker
> - useChatPageState float-widget lazy create
>
> Switch action goes through `useWorkspaceConfigStore.setCurrent(id)` which round-trips to main and updates the local mirror. The old `useWorkspaceStore.switchWorkspace` (which already chained through `workspaceRuntimeService.setCurrentId` and synced both stores) remains for the legacy rich-UI surfaces.
>
> Rich-UI surfaces still on `useWorkspaceStore` (intentional — main config doesn't carry color / description / type / sessionIds / stats yet): `Workspaces.tsx`, `WorkspaceSwitcher.tsx`, `WorkspaceCard.tsx`. Plus `chatStore.createConversation` for the renderer-only bookkeeping pair `addSessionToWorkspace / setActiveSession`. Deleting `useWorkspaceStore` outright is a follow-up (R-1 phase 3, blocked on moving rich UI fields into main and deciding session-id derivation source).
>
> Cleanup: dead component `WorkspaceSessionHeader.tsx` removed (no importers; same pattern as the §25 cleanups).

**R-2 — Resolver consumer audit.** `SessionRuntimeResolver` exists; grep for callsites and confirm direct chat send path, agent SDK setup, MCP execution, and approval adapter all consume it. Today only a subset do. Convert remaining consumers; delete the parallel "look up settings ad hoc" code paths.

**R-3 — `chatStore` god-store split.** The store currently owns: messages CRUD, conversations list, session metadata writes, file artifact dependencies, remote bind, worktree fork. Split into:
- `useMessageStore` — only messages of the current conversation.
- `useConversationListStore` — list, current id, CRUD, fork, delete.
- Move remote bind/unbind into a dedicated `remoteSessionService` so chatStore doesn't reach into IM bot APIs directly.

> **R-3 step 1 — done (2026-06-19).** `services/remoteSessionService.ts` introduced with `bind / unbind / getBinding / checkBotOnline`. `chatStore.createConversationAdvanced` and `chatStore.deleteConversation` now go through it; `useRemoteChat` also routes its bind/unbind/getBinding/checkBotOnline calls through the service. The 3 message-streaming calls (`getRemoteMessages / sendMessage / onIMMessage`) remain in `useRemoteChat` directly — extracting those is part of step 2 because they own subscription / optimistic-state shape.
>
> **R-3 step 2 — done (2026-06-19).** `useChatMessageStore` extracted (file `stores/chatMessageStore.ts`). Owns `messages / sessionStatus / isStreaming / streamingContent` + every message CRUD + streaming action + `persistMessages`. `useChatStore` keeps the conversation list, pending input, team selection, and conversation lifecycle (create / switch / delete / rename / fork / metadata). The two stores coordinate via `getState()` at action boundaries — `chatStore.switchConversation/deleteConversation/createConversation` call `useChatMessageStore.getState().setMessages()`.
>
> Naming: existing `useMessageStore` is for bookmarks/export/search history; the new live-message store is `useChatMessageStore` to avoid the collision.
>
> Consumer migration (11 files): `useChat / useAppShortcuts / Home / Markdown / ChatMessageList / CodexEnvironmentInspector / ComposerStatusBar / QuotePanel / AppSidebar` swap to the new store; `chatStore.ts` re-exports `Message / ToolCall / ChatSessionStatus / MessageRole / MessageType` types so existing `import type { Message } from "../stores/chatStore"` keeps working through the migration.
>
> Tests: `__tests__/chatStore.test.ts` renamed to `chatMessageStore.test.ts`; the long-standing stale-snapshot anti-pattern (7/8 red on `main`) was rewritten to read fresh state via a `fresh()` helper. All 8 now pass.

**R-4 — Conversation cwd reconciliation.** Today `getConversationCwd` (main IPC) and `WorkspaceConfig.path` are independent. Decide which is authoritative for "where this conversation runs", then collapse to one path resolution helper. Until done, fork-to-worktree, IDE app switcher, and file artifact open all need to know which to read.

> **R-4 — done (2026-06-19).** Audit revealed `WorkspaceConfig.path` was dead state — defined in shared types and persisted but never read anywhere. The "two sources of truth" framing was misread; the real problem was that the project-path field was inert. Fixed:
>
> - `src/main/services/runtime/conversationCwd.ts` introduces `resolveConversationCwd(id)` — returns `WorkspaceConfig.path` when the conversation's workspace has it set, else falls back to `ConversationStorageService.getConversationCwd(id)` (the per-conversation sandbox dir).
> - `chat.getConversationCwd` IPC handler delegates to the resolver, so every downstream consumer (file artifact open, IDE app switcher, fork-to-worktree, renderer-side AgentSDK request.cwd) sees the same answer.
> - `modelHandlers.ts` (LLM chat-completion tool path) routes through the same helper.
> - `WorkspaceRuntimeForm` gains a "项目路径 (cwd)" input so users can actually set the project path. Until this UI shipped, the field was unreachable.
>
> Behavior change: a workspace with `path` set now runs all tool/agent operations in that path. For users who never set the field, behavior is unchanged (sandbox-dir fallback).

**R-5 — Plan mode actually blocking.** `plan-only` mode is currently a chip; it doesn't gate tool execution. Either implement the gate or label the chip as "informational" until it does. Inconsistency between UI claim and runtime behavior is worse than the missing feature.

> **R-5 first slice — done (2026-06-19).** `LLMService.applyPlanModeGate` runs before either provider path. It resolves `planMode` via `SessionRuntimeResolver`; when `plan-only`, it strips `tools / toolMapping / toolPermission / toolExecutor` and prepends a system note ("You are in PLAN ONLY mode. Describe the plan you would carry out, but do NOT call any tools."). One audit deny is recorded so the gate is observable in the runtime inspector.
>
> Anthropic and OpenAI paths share the entry, so both are covered with one wrapper. AgentSDK path is not gated yet — Agent SDK has its own permissionMode/canUseTool surface; align with planMode there as part of the broader Agent SDK runtime alignment task (§29 in the original phase plan).
>
> The 4 remaining plan modes (`chat`, `plan-then-ask`, `auto-execute-safe`, `full-agent`) stay informational. Their richer flows (approval-then-execute, auto-approve safe ops only, full-agent unattended) need approval-UI or scheduler work that doesn't fit a small refactor.

**R-6 — Runtime policy enforcement (not audit-only).** `RuntimePolicyService.record` returns `audit-only` for everything. The flag exists (`runtimeEnforcement`); turn it on for the highest-risk classes first (workspace-external write, network egress to non-allowlist) with a fallback path. Pure audit-only is technical debt — it makes the approval UI a lie.

**R-7 — `useChatPageState` vs `chatStore` overlap.** `createConversation` is invoked from both `chatStore.createConversation` and `useChatPageState`'s send-path lazy create. Pick one (chatStore). Remove the parallel codepath — it's a known source of "which workspace did this conversation land in?" bugs.

> **R-7 — done (2026-06-19).** Dead handlers `handleNewChat / handleNewAgentChat / handleNewRemoteChat / handleNewConversation` removed from `useChatPageState` (they were only consumed by the now-unmounted `ChatInlineSidebar.tsx`). Two dead files (`ChatInlineSidebar.tsx`, `ChatPageTitle.tsx`) deleted. The float-widget auto-send lazy create (the only remaining one inside this hook) now explicitly passes `workspaceId: defaultId` per §25.2 contract. Send paths no longer create conversations behind chatStore's back.

**R-8 — Drop dead `collapsed` field after a release.** `sidebarLayoutStore.collapsed` is now always `false`. Remove the field next major release; keeping it as dead state invites future regressions.

> **R-8 — done (2026-06-19).** Field removed from `SidebarLayoutState`; `partialize` set so only `width` is persisted. Both sidebars dropped their force-reset effects and the `useEffect` imports they no longer needed. zustand persist tolerates the leftover localStorage key from older clients without throwing.

**R-9 — `SessionMetadata` field bloat.** `pinned / archived / unread / forkOriginId / worktreePath` were appended to `SessionMetadata` ad-hoc. Consider grouping into nested objects (`flags: { pinned, archived, unread }`, `lineage: { forkOriginId, worktreePath }`) before more fields are added. This is a refactor with visible blast radius (touches storage + types) — schedule it carefully.

> **R-9 — done (2026-06-19).** Schema: `SessionFlags` and `SessionLineage` introduced; flat fields removed from `SessionMetadata`. Persistence: `normalizeSessionMetadata` accepts both shapes (legacy flat OR new nested) on read, emits nested only on write — first read+write cycle migrates each conversation. `mergeSessionMetadata` deep-merges `flags` / `lineage`, so a partial patch like `{ flags: { pinned: true } }` only changes pinned. Renderer reads (4 files / 12 sites) and writes (`SessionContextMenu`, fork actions in chatStore) all updated.

### 26.5 What I will not put back into this plan

To stop the bolt-on pattern, the next planning cycle should either go into a new document or get a major version bump on this one. Specifically don't append:
- §27, §28… for any "small enhancement". Go through §21 task numbering.
- New "Session Lifecycle & ..." subsections — those belong inside §23 / §25.
- New sidebar interaction subsections — those belong inside §24.
- "Just one more flow chart" docs — append to `workspace-session-creation-flow.md`.

### 26.6 Recommended next 3 moves

If we do nothing else, do these in order:

1. **R-2** — Resolver consumer audit. Cheapest item that pays back the most: confirm or fix the foundation everything else relies on.
2. **R-6** — Flip runtime enforcement on for the safest-to-block class. Closes the gap between approval UI and runtime reality.
3. **R-7 + R-1** — Eliminate the two remaining "two sources of truth" pockets in renderer state. After this, the runtime story matches what the plan has been claiming since Phase 1.

Everything else (UI polish, more chips, more inspector content) should wait until those land.
