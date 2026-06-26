# Workspace / Session Plan Review

> 当前重构总入口：[refactor-plan](./refactor-plan.md) ·
> 当前 project/session 主计划：[project-session-redesign-plan](./project-session-redesign-plan.md) ·
> 旧索引：[workspace-session-index.md](./workspace-session-index.md) ·
> 主计划：[ui-plan](./workspace-session-ui-plan.md) ·
> 实现差距：[implementation-audit](./workspace-session-implementation-audit.md)
>
> 注意：本文是历史 gap review。新任务先读 `refactor-plan.md`，再回到本文查历史问题证据。

## Purpose

This document is a gap analysis of `docs/workspace-session-ui-plan.md` against the actual codebase state as of commit `d2056b9`. It identifies vulnerabilities, missing connections, and underspecified boundaries between the plan and reality.

It should be read alongside the UI plan and the Phase 0 audit. Each finding includes concrete file references so the issues can be verified and addressed before development begins.

The headline conclusion: the plan is structurally sound, but several types it depends on (`WorkspaceConfig`, `SessionApprovalGrant`, `WorkspaceRuntimePolicy`, `ModelSelection`) exist only as interface declarations. The runtime wiring that would make them authoritative is missing, and in two cases the plan does not account for parallel implementations that already exist in the code.

## 1. Dual Workspace System Is Not Unified

The plan does not mention that two workspace implementations already coexist.

| Layer | File | Model |
| --- | --- | --- |
| Renderer (Zustand, persisted) | `src/renderer/src/stores/workspaceStore.ts` (417 lines) | `Workspace` with `defaultModel?: string`, `systemPrompt`, `temperature`, no runtime policy |
| Main process | `src/main/store/StoreManager.ts:307-410`, exposed via `workspaceRuntime` IPC namespace | `WorkspaceConfig` with `defaultModel?: ModelSelection`, `runtimePolicy`, `enabledCapabilities`, `contextPolicy` |

The two models are incompatible:

- Renderer `defaultModel?: string` vs main `defaultModel?: ModelSelection`.
- `chatStore.ts:267` reads `currentWorkspaceId` from the renderer `useWorkspaceStore`, not from `workspaceRuntimeService`.
- The renderer store's `sessionIds`/`activeSessionId` are not bound to conversations.
- The plan's Phase 1 says "Keep renderer workspace store as a UI cache until main-process state sync is complete," but never defines the migration path from the local store to the main-process source of truth.

Risk: if Phases 1-3 proceed without a unification step, the two stores will diverge permanently. The renderer will display one set of state while the main process enforces a different runtime policy.

Required resolution: add an explicit task before Phase 1 that designates the main-process `WorkspaceConfig` as the source of truth, makes the renderer store a read-through cache, and backfills existing persisted `Workspace` data into `WorkspaceConfig`.

## 2. Model Selection Scope Contradiction

Current state: `ActiveModelSelection = { providerId, modelId }` is global and unique, stored in `StoreManager.ts:519-604` under the `config` store as `activeModelSelection`.

The plan introduces `ModelSelection` with `reasoningEffort`, `temperature`, `maxOutputTokens`, `contextMode`, and `fallbackModel`, scoped per workspace and per session (`WorkspaceConfig.defaultModel`, `SessionMetadata.modelOverride`).

Gaps:

- The global `activeModelSelection` and the planned `ModelSelection` are different types in different stores.
- Phase 6 (Model Switcher) states "session model override affects only future responses," but nothing specifies how `modelService.chatCompletion()` reads the session override instead of the global `activeModelSelection`.
- There are two chat paths with separate model wiring: direct/skill via `modelService`, agent via `AgentSDKClient`. The plan scopes Phase 1 to direct/skill only, but no adapter is defined that lets `modelService` accept a session-scoped model override.

Required resolution: define the model resolution order (`global default -> workspace default -> session override`) and the point in the chat path where it is applied, before building the Model Switcher UI.

## 3. Approval Grants Have No Read/Write Path

Current state:

- `SessionApprovalGrant` is defined in `packages/shared-types/src/chat.ts:158-166` with `scope: "once" | "session" | "workspace" | "global"`.
- `SessionMetadata.approvalGrants: SessionApprovalGrant[]` exists (`chat.ts:179`).
- Two independent approval mechanisms exist: LLM tool approval (`src/main/services/llm/LLMService.ts:200-243`) and Agent SDK permission (`src/main/services/agent/AgentSDKService.ts:640-698`).

Gaps:

- Neither approval mechanism reads from or writes to `approvalGrants`.
- The UI exposes "allow once" and "deny" only; "allow for session" does not exist.
- Phase 2 says "Persist approval and sandbox decisions to audit logs," but the persistence read/write path for `approvalGrants` is never implemented.
- Nothing defines how `approvalGrants` would be injected into `checkToolPermission()` or the Agent SDK permission callback.

Required resolution: before Phase 2's enforcement work, specify how `approvalGrants` is consulted at decision time, how grants are persisted back to the conversation metadata, and how the two existing approval paths route through the same lookup.

## 4. Attachment Context Pipeline Is an Empty Shell

The plan defines four context modes (`include-content`, `reference-only`, `ask-before-read`, `ignore-for-model`).

Current state:

- `ChatMessagePersist.metadata.attachmentIds?: string[]` links messages to attachments.
- Attachment selection, storage, and listing are fully implemented via `file.saveAttachment`, `file.readFile`, `file.listAttachments`.
- However, the LLM request never receives attachment content. `file.readFile()` exists but its output is never injected into the model request.

Gaps:

- No phase defines the format for injecting attachment content into LLM message blocks. The Anthropic SDK `content` block supports `image`, `text`, `tool_use`, etc.; mapping attachment types to these blocks is unspecified.
- `reference-only` for large files requires token counting and context window budgeting; this is not mentioned.
- `ask-before-read` requires an interactive prompt path at request time; this is not defined.
- Phase 3 (attachment context resolver) depends on these mappings but does not specify them.

Required resolution: define the attachment-to-message-block mapping and the context budget logic as part of Phase 3, before the resolver is implemented.

## 5. ElectronAPI Contract Is Incomplete

The Typed IPC Proxy design (`docs/migration/typed-ipc-proxy-design.md`) names `packages/shared-types/src/electron-api.ts` as the single source-of-truth contract. That file does not exist.

Actual API surface is split across:

- `src/preload/index.ts` hand-written bridge namespaces (e.g. `workspaceRuntime` at lines 181-192).
- `src/main/ipc/api-impl.ts` `apiImpl` object (1474 lines).
- `packages/shared-types/src/ipc-proxy.ts` (25 lines, only `Listener<T>` and `IPCResponse<T>`).

Gaps:

- There is no single `ElectronAPI` interface to validate the bridge against.
- New namespaces (`workspaceRuntime`, `chat.updateConversationMetadata`) were hand-written into the preload rather than flowing through `createBridge`.
- Subsequent phases (approval adapter, runtime policy service) will need new IPC namespaces; without a central contract, namespaces will fragment further.

Required resolution: extract the actual `ElectronAPI` interface from `api-impl.ts` and `preload/index.ts` into `packages/shared-types/src/electron-api.ts`, then require all new namespaces to extend it.

## 6. Interaction Profile Has No Runtime Effect

Current state:

- `InteractionProfile = "claude-code" | "codex" | "hybrid"` is defined.
- `WorkspaceConfig.interactionProfile` is defined.
- The default workspace is set to `"hybrid"`.

Gaps:

- Phase 9 describes profile-specific layout, composer density, tool rendering, and approval display, but none of this is implemented.
- More critically, nothing defines the data layer that maps profile to layout. If profile is a workspace setting with session override, the chat renderer must resolve the effective profile per message render.
- The "effective runtime snapshot" that would carry the resolved profile is defined as a type but has no resolver implementation.

Required resolution: define the `EffectiveSessionRuntime` resolver before Phase 9, and specify which renderer components consume it.

## 7. Sandbox Policy Has Type but No Enforcement Path

`WorkspaceRuntimePolicy` defines `sandboxMode: "read-only" | "workspace-write" | "system-access"`, `writableRoots`, `networkAccess`, `externalAppAccess`.

Gaps:

- No service checks sandbox policy before performing file writes. `ConversationStorageService` writes files directly without consulting `writableRoots`.
- LLM tool calls that execute shell commands do not check `sandboxMode`.
- `ConversationStorageService` itself writes outside the conversation directory (attachment copy to `userData/attachments/`), which would conflict with a `workspace-write` default.
- The relationship between `writableRoots` and the per-conversation `workspace/` execution directory is not defined.

Required resolution: Phase 2 must specify where the sandbox check hook sits in the execution path, how `writableRoots` is derived from workspace config plus conversation directory, and how the app's own internal writes are exempted or scoped.

## 8. Phase Dependencies Are Underspecified

The plan's task list (Section 18) is linear, but the phases have non-linear dependencies:

```
Phase 1 (Workspace Runtime) -> Phase 6 (Model Switcher)
Phase 1 -> Phase 2 (Approval) -> Phase 6
Phase 1 -> Phase 3 (Attachment) -> Phase 6
Phase 5 (Settings UI) + Phase 7 (Approval UI) -> Phase 9 (Profile UI)
```

Concrete cases:

- Phase 6 Model Switcher requires per-session model override, which depends on Phase 1 `EffectiveSessionRuntime` and Phase 2 runtime policy checks.
- Phase 6 Composer depends on Phase 3 attachment context chips.
- Phase 9 profile UI depends on Phase 5 settings UI and Phase 7 approval UI.

Risk: treating the 21 tasks as strictly sequential will either block later tasks on incomplete earlier ones, or encourage shipping UI before the kernel it depends on.

Required resolution: annotate the task list with explicit dependency edges so tasks can be sequenced correctly and parallelized where safe.

## 9. Legacy Navigation Migration Lacks Redirect Strategy

The plan says "Keep the old routes temporarily for compatibility and redirects" for the demoted MCP, Skills, and Plugins pages.

Gaps:

- No independent-route retention table for `/mcp`, `/skills`, and `/plugins`.
- No removal milestone (after Phase 5? after one release?).
- No handling for user-bookmarked legacy routes.

Required resolution: define the redirect map and the removal version as part of Phase 5.

## 10. Extension Descriptor Layer Risks Over-Abstraction

Phase 4 unifies MCP, Skill, Hook, App Plugin, Theme, and capability packages under `ExtensionDescriptor`.

Gaps:

- The three backing services (MCP, Skill, Plugin) have materially different lifecycles: MCP has connection state, Skill has manifest parsing, Plugin has hot reload.
- An adapter layer risks leaking service-specific logic into the descriptor.
- The plan says "Descriptor layer does not replace runtime services yet," but does not define the precise interface boundary between descriptor and service.

Required resolution: define the `ExtensionDescriptor` read interface separately from the per-service write/admin interface, so the descriptor stays a read-only projection.

## 11. Agent SDK Integration Is Out of Scope but Assumed

`packages/docs/FEATURE_ROADMAP.md` reports Claude Agent SDK at ~25% (Phase 1 done, Phases 2-5 pending). The workspace-session plan assumes `"agent"` is a session kind and that agent sessions will honor workspace runtime policy.

Gaps:

- The plan does not say when Agent SDK advanced features (plan mode, auto-execute) will align with workspace runtime policy.
- Agent SDK model configuration uses a separate chain (`claudeCodeEnabled`, `claudeCodeModel` on `ModelProvider`), which the plan defers ("wired in a later phase") without a milestone.

Required resolution: add a milestone that defines when Agent SDK sessions route through `EffectiveSessionRuntime`, even if full feature parity is deferred.

## 12. No Rollback Strategy

Each phase has validation criteria but:

- No rollback checkpoints are defined (e.g. what happens if Phase 2's approval adapter breaks tool approval entirely?).
- No feature flags are specified to control new vs old paths.
- The 14 phases are serial; one failed phase can block everything downstream.

Required resolution: define per-phase feature flags and a revert procedure, especially for Phase 2 (approval) and Phase 3 (attachment) where regressions would break core chat.

## Summary

| Severity | Count | Most critical |
| --- | --- | --- |
| Critical | 4 | Dual workspace not unified; model scope contradiction; approval grants disconnected; attachment context empty shell |
| Medium | 4 | ElectronAPI contract incomplete; interaction profile no runtime; sandbox no enforcement; phase dependencies underspecified |
| Low | 4 | Legacy route redirects; extension over-abstraction; Agent SDK scope; rollback strategy |

The three items that should be resolved before any Phase 1 work begins:

1. Unify the dual workspace system. Designate main-process `WorkspaceConfig` as the source of truth and define the renderer store migration.
2. Materialize the `ElectronAPI` contract. Extract it into `packages/shared-types/src/electron-api.ts` so new namespaces stop fragmenting.
3. Define the `EffectiveSessionRuntime` resolver interface. It is the foundation for every subsequent phase but currently exists only as a type.

---

## Addendum (post-`09380b7`)

This addendum re-checks the review findings against commit `09380b7 fix(workspace): bind conversations to current workspace`, which is the only code change touching this area since the review was authored.

### What `09380b7` did and did not change

What changed:

- `Conversation.metadata` now carries `workspaceId` and a `session` object (with `kind`, `chatMode`, `agentSDKSessionId`, etc.).
- `ConversationStorageService` writes `approvalGrants: []` as a placeholder in new conversation metadata.
- `StoreManager` keeps a list of `WorkspaceConfig[]` and exposes CRUD via the `workspaceRuntime` IPC namespace (`api-impl.ts:409`, also reachable from renderer via `workspaceRuntimeService`).

What did not change:

- `chatStore.createConversation` still reads `currentWorkspaceId` from the renderer `useWorkspaceStore` (`chatStore.ts:266-270`), not from `workspaceRuntimeService.getCurrentId()`. The dual-store problem of Section 1 is unresolved despite the IPC surface being available.
- `useChat` keeps `sessionModelOverride` as a renderer-only `useState<ActiveModelSelection | null>` (`useChat.ts:337`). It is not persisted on conversation metadata, so it resets on conversation switch and cannot be resolved by `EffectiveSessionRuntime`.
- `LLMService.checkToolPermission` and `AgentSDKService` permission callback still do not read `approvalGrants`. The field is now persisted but has no consumer.
- No file in `src/` or `packages/` references `EffectiveSessionRuntime` or `SessionRuntimeResolver` outside of type declarations.

Net effect: the review's four critical findings (dual workspace, model scope, approvals, attachments) all remain open. Section 5 (`ElectronAPI` contract) is partially addressed because the interface lives in `src/preload/index.ts:11`, but it is not in the location the typed-IPC-proxy design specifies (`packages/shared-types/src/electron-api.ts`).

### Additional findings not in the original review

13. **`sessionModelOverride` is renderer-local state, not session metadata.** The plan treats per-session model override as a `SessionMetadata.modelOverride`, but the existing implementation lives in `useChat`'s React state. Switching conversations resets it. Any model-switcher UI built on top of the current state will visually reset whenever the user switches sessions. Resolution: persist the override into conversation metadata via `chat.updateConversationMetadata` before building the model switcher.

14. **`approvalGrants: []` is written but never read — risk of dead schema.** The placeholder is being persisted into `metadata.json` for every new conversation as of `09380b7`. If Phase 2 slips, this field becomes a stale schema element that future migrations have to clean up. Resolution: either wire the read path into `LLMService.checkToolPermission` and the Agent SDK callback this iteration, or remove the field from `ConversationStorageService` until Phase 2 begins.

15. **No migration path defined for renderer-persisted `Workspace` data.** `useWorkspaceStore` uses `zustand/persist`, so existing users have a `Workspace[]` in localStorage with `defaultModel?: string`. Main-process `WorkspaceConfig.defaultModel` is `ModelSelection`. Section 1 calls for unification but does not specify how the persisted renderer payload is migrated into `WorkspaceConfig`. Resolution: define a one-time backfill step that runs on app start, consumes the renderer payload, writes the equivalent `WorkspaceConfig`, and switches the renderer store to a read-through cache.

16. **Naming collision: `workspace/` directory vs `Workspace` entity.** `ConversationStorageService.getWorkspaceDir(conversationId)` returns the per-conversation execution directory. Plan section on `writableRoots` and `sandboxMode: "workspace-write"` reuses the word `workspace` for the user-facing entity. Codebase searches and AI agent prompts cannot disambiguate. Resolution: rename the per-conversation directory accessor to `getConversationCwd` (or similar) before sandbox enforcement work begins, so `writableRoots` derivation is unambiguous.

17. **Plan document length.** `workspace-session-ui-plan.md` is 1120 lines and mixes vision, 14-phase task list, type definitions, and migration strategy. As phases land, the document will rot unless split. Resolution: extract types into `workspace-session-types.md` and per-phase task detail into `phases/`, leaving the main plan as a vision + index.

### Pre-Phase 1 task list (concrete)

Ordered so each task unblocks the next. Each item is small enough to land in a single PR.

1. **`session-runtime-resolver-skeleton`** — Add `src/main/services/runtime/SessionRuntimeResolver.ts` with a minimal `resolve(input): EffectiveSessionRuntime` returning `workspace.defaultModel ?? globalActiveModel` and pass-through runtime policy. Expose via IPC. No callers required yet.
2. **`chat-uses-resolver-for-model`** — Replace the `sessionModelOverride -> activeModelSelection` resolution in `useChat.ts:455-466` with a call to the resolver. Persist override into conversation metadata via `chat.updateConversationMetadata`. Remove the `useState` fallback once the metadata round-trip is verified.
3. **`workspace-current-id-source-of-truth`** — Switch `chatStore.createConversation` (`chatStore.ts:266`) to read `workspaceRuntimeService.getCurrentId()`. Backfill renderer `useWorkspaceStore.currentWorkspaceId` from main process on app start. Mark renderer field as read-through cache in code comments.
4. **`workspace-config-backfill-migration`** — On main process start, if `WorkspaceConfig[]` is empty but renderer-persisted `Workspace[]` exists in localStorage payload, run a one-time backfill via a renderer IPC. After backfill, the renderer store stops being authoritative.
5. **`approval-grants-decide-or-defer`** — Either implement the read path in `LLMService.checkToolPermission` and `AgentSDKService` permission callback this iteration, or remove the placeholder write from `ConversationStorageService` to avoid dead schema. Document the decision in this file.
6. **`rename-conversation-cwd`** — Rename `ConversationStorageService.getWorkspaceDir` and `metadata.workspace/` directory references to `getConversationCwd` / `cwd/`. Update all callers. This unblocks `writableRoots` work in Phase 2 by removing the naming collision.
7. **`electron-api-extract`** — Move `ElectronAPI` from `src/preload/index.ts:11` to `packages/shared-types/src/electron-api.ts`. Re-import in preload and renderer types. New namespaces from later phases must extend this single source.
8. **`plan-document-split`** — Extract types and per-phase detail out of `workspace-session-ui-plan.md` so the main doc stays a vision + index. Optional but recommended before Phase 1 lands.

After steps 1-7 land, Phase 1 (Workspace Runtime) can proceed against a unified runtime contract instead of patching parallel implementations.
