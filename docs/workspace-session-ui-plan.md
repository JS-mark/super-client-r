# Workspace / Session Core Runtime, Feature, and UI Plan

## 1. Review Summary

This document is the reviewed and corrected implementation plan for reshaping Super Client R around a `Workspace -> Session` model, with Claude Code / Codex style interaction profiles, unified extension management, session-level model switching, attachments, plan modes, permissions, and sandboxing.

The scope is not a UI refresh. The expected result requires kernel-level product behavior: durable workspace/session state, main-process-enforced runtime policy, real attachment context resolution, unified approval semantics across execution paths, and an extension model that controls both app UI contributions and agent/runtime capabilities.

The original plan was directionally correct, but several points needed tightening before development:

| Issue | Risk | Resolution |
| --- | --- | --- |
| Workspace and session boundaries were implied, not explicit enough. | Long-lived configuration could leak into individual sessions and become hard to migrate. | Treat `Workspace` as the durable configuration boundary. Treat `Session` as a runtime instance with temporary overrides and execution history. |
| Permission approval and sandboxing were mixed together. | `Full access` could be misunderstood as bypassing hard safety limits. | Separate approval policy from sandbox policy. Approval controls prompts; sandbox controls hard execution boundaries. |
| Model switching was described as a control, but not as a first-class chat workflow. | A small dropdown would not support provider comparison, capability warnings, or session override behavior. | Add a command-palette style `Model Switcher` modal with provider list, model list, advanced parameters, and explicit session/workspace actions. |
| Attachments did not define context behavior. | Large files or external resources could be silently injected into context or read without clear consent. | Every attachment gets a source, status, and context mode: include content, reference only, ask before read, or ignore for model. |
| Extension unification could blur agent capabilities with app UI plugins. | App UI extensions and agent runtime capabilities require different trust and permission models. | Rename existing app-level plugins to `App Plugins`. Keep MCP, Skills, Hooks, and capability packages under `Extensions`, but make their type and scope visible. |
| Interaction profile could become cosmetic only. | Claude Code / Codex mode would not meaningfully change behavior. | Define concrete layout, density, approval, timeline, command, and inspector differences per profile. |
| The plan still leaned too much toward UI aggregation. | The app could look like Claude Code / Codex while still running on old, inconsistent model, permission, attachment, and extension paths. | Move kernel work earlier: persistence, runtime policy, approval adapter, attachment resolver, and extension descriptors must land before final UI polish. |
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

### Claude Code Mode

Use this profile for command-first, compact interaction.

- Input composer is the primary control surface.
- Slash commands are first-class: `/config`, `/model`, `/mcp`, `/skills`, `/permissions`, `/plan`, `/hooks`.
- Tool calls render as compact inline blocks.
- Approvals render inline when possible.
- Sidebar is minimized and session-focused.
- Status line is always visible.

### Codex Mode

Use this profile for task-first, inspectable workflows.

- Left pane: sessions and tasks.
- Center pane: conversation plus execution timeline.
- Right pane: inspector for plan, files, tools, approvals, logs, and context.
- Approvals are queued in the inspector.
- Plan, command execution, diff, test, and summary states are visually separated.

### Hybrid Mode

Default profile.

- Composer and slash commands remain fast.
- Task timeline and inspector are available when a session enters plan or agent mode.
- Approval UI favors inline blocks for simple actions and inspector queue for multi-step work.

## 6. Chat Page Layout

Target layout:

```text
Workspace / Session Header
Session Sidebar | Conversation or Timeline | Inspector
Composer
Status Bar
```

Header displays:

- current workspace
- current session
- current model
- interaction profile
- approval mode
- sandbox mode
- active MCP / skills / capabilities health

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
2. `Interaction` - Claude Code, Codex, or Hybrid.
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

1. Phase 1: Agent sessions receive `workspaceId`, `sessionId`, and a readonly `EffectiveSessionRuntime` snapshot for display and audit.
2. Phase 2: Agent SDK permission requests map into the normalized approval model and grant lookup.
3. Phase 6: Agent SDK model switching remains labelled as limited until the provider/model chain can consume `ModelSelection`.
4. Final milestone: Agent SDK query setup reads compatible runtime fields for model, sandbox, enabled capabilities, and approval policy.

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

Goal: make Claude Code and Codex profiles real workflow differences.

Tasks:

- Claude Code mode: compact transcript, command-first composer, inline tools.
- Codex mode: task sidebar, execution timeline, inspector queue.
- Hybrid mode: current layout with upgraded composer and optional inspector.

Validation:

- Switching interaction profile changes layout and workflow surfaces.
- Session override can temporarily switch profile.

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
- `profileLayouts.enabled`: enable Claude Code / Codex profile-specific layout changes.

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
32. `profile-layouts`: implement Claude Code / Codex / Hybrid layout differences.

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
- Claude Code and Codex interaction profiles materially change workflow, not only colors.
- Existing MCP, skill, plugin, model, and chat flows continue to work during migration.
- Legacy `/mcp`, `/skills`, and `/plugins` navigation remains compatible while first-level navigation moves to `Extensions`.
- Rollback flags can disable unified navigation, runtime enforcement, file artifacts, and profile layouts without corrupting stored conversations.
