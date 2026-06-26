# Workspace / Session Implementation Audit

> 当前重构总入口：[refactor-plan](./refactor-plan.md) ·
> 当前 project/session 主计划：[project-session-redesign-plan](./project-session-redesign-plan.md) ·
> 旧索引：[workspace-session-index.md](./workspace-session-index.md) ·
> 主计划：[ui-plan](./workspace-session-ui-plan.md) ·
> 计划审查：[plan-review](./workspace-session-plan-review.md)
>
> 注意：本文是历史实现审计。新任务先读 `refactor-plan.md`，再按需查本文对应代码现状。

## Purpose

This is the Phase 0 technical audit for implementing the workspace/session core runtime, feature, and UI plan. It verifies how the current code actually models workspaces, conversations, models, attachments, permissions, MCP, skills, and app plugins before development starts.

The key conclusion is that the plan is viable, but it must be treated as a kernel and product-capability migration, not a UI-only redesign. The first implementation must adapt to existing `Conversation` storage instead of introducing a separate `Session` runtime model immediately, then add main-process-readable workspace config, effective runtime resolution, runtime policy enforcement, real attachment context resolution, and extension descriptors before relying on the final UI surfaces.

## 1. Current Workspace Model

Relevant files:

- `src/renderer/src/stores/workspaceStore.ts`
- `src/renderer/src/pages/Workspaces.tsx`
- `src/renderer/src/components/workspace/WorkspaceSwitcher.tsx`
- `src/renderer/src/components/workspace/WorkspaceCard.tsx`

Findings:

- Workspace exists only as a renderer-side Zustand persisted store.
- It has `sessionIds` and `activeSessionId`, but these are not currently wired into chat conversation creation or switching.
- `WorkspaceSettings` currently contains only lightweight chat defaults: `autoSave`, `defaultModel`, `systemPrompt`, `temperature`, `maxContextLength`, and variables.
- `initDefaultWorkspace()` exists but is not referenced by the inspected app startup path.
- Workspace export explicitly notes that session data is not actually collected from `chatStore`.
- Workspace has no main-process authority and no security/runtime enforcement.

Implication:

- Do not build new runtime policy only in `workspaceStore`; it would be UI-only and unenforced.
- The first real migration should bind existing conversations to a workspace ID, then gradually move config into a main-process-backed workspace config.

Recommended implementation correction:

```text
Initial Session = existing ConversationSummary + metadata
Long-term Session = normalized wrapper around ConversationSummary
```

Add `workspaceId` to conversation metadata first, then let workspace `sessionIds` become derived or synchronized data.

## 2. Current Conversation / Session Model

Relevant files:

- `src/renderer/src/stores/chatStore.ts`
- `src/renderer/src/hooks/useChatPageState.tsx`
- `src/renderer/src/services/chatHistoryService.ts`
- `src/main/services/chat/ConversationStorageService.ts`
- `src/main/ipc/api-impl.ts`

Findings:

- The real persisted chat runtime unit is `Conversation`.
- Main process stores conversations under:

```text
{userData}/chats/{userId}/{conversationId}/
  metadata.json
  messages.json
  attachments/
  tool-outputs/
  workspace/
  remote-messages.json
```

- `ConversationSummary` metadata already carries runtime-adjacent fields such as `chatMode`, `agentSDKSessionId`, and `remote`.
- Every conversation has a per-conversation `workspace/` directory returned by `getWorkspaceDir(conversationId)`.
- This `workspace/` directory is different from the renderer `Workspace` entity.
- Direct and skill chat pass `conversationId` into LLM requests.
- MCP tool path resolution is based on the conversation workspace directory.
- Remote chat bindings are persisted on conversation metadata.

Implication:

- The current "session" should initially be implemented as a conversation metadata extension, not a new independent store.
- The phrase "workspace directory" is overloaded: current code means per-conversation execution directory, while the product plan means user workspace. Rename carefully in UI and new types.

Recommended implementation correction:

Add a `SessionMetadata` shape to conversation metadata:

```ts
interface SessionMetadata {
  workspaceId: string;
  kind: "chat" | "agent" | "plan" | "remote" | "automation";
  modelOverride?: ModelSelection;
  planMode?: PlanMode;
  interactionProfileOverride?: InteractionProfile;
  runtimePolicyOverride?: Partial<WorkspaceRuntimePolicy>;
}
```

Store this on `metadata.json` first. Avoid creating a separate session persistence layer until conversation migration is stable.

## 3. Current Chat Execution Flow

Relevant files:

- `src/renderer/src/hooks/useChat.ts`
- `src/renderer/src/pages/Chat.tsx`
- `src/renderer/src/components/chat/ChatInputArea.tsx`
- `src/renderer/src/components/chat/ChatSettingsModal.tsx`
- `src/main/ipc/handlers/modelHandlers.ts`
- `src/main/services/llm/LLMService.ts`

Findings:

- Chat has two primary runtime paths:
  - Direct/skill mode through `modelService.chatCompletion()`.
  - Agent mode through `agentSDKClient.createQuery()`.
- `sessionModelOverride` currently exists in `useChat()` state and affects direct/skill mode only.
- `sessionModelOverride` resets on conversation switch.
- Direct/skill model resolution is `sessionModelOverride -> global active model`.
- The model selected in `ChatSettingsModal` is session-scoped but presented inside a large settings modal.
- Agent mode explicitly does not use the chat model. It relies on `AgentSDKService`, provider `claudeCodeEnabled`, and Agent SDK settings.
- Chat mode is persisted to conversation metadata.
- Mode is locked after messages exist.

Implication:

- The model switcher can be built without inventing a new model stack, but first version should clearly say it applies to direct/skill responses.
- Agent mode model selection must either:
  - open Agent settings, or
  - be implemented later by passing a compatible model override into `AgentSDKQueryRequest`.

Recommended implementation correction:

First model switcher scope:

```text
Phase 1: Direct / Skill session model override
Phase 2: Workspace default model
Phase 3: Agent SDK model override compatibility
```

Do not promise one model switcher controls all modes until Agent SDK path is wired.

## 4. Current Attachment Flow

Relevant files:

- `src/renderer/src/stores/attachmentStore.ts`
- `src/renderer/src/components/attachment/FileUpload.tsx`
- `src/renderer/src/components/attachment/AttachmentManager.tsx`
- `src/main/ipc/api-impl.ts`
- `src/renderer/src/hooks/useChat.ts`

Findings:

- `attachmentStore` supports persisted metadata and main-process-backed attachment operations.
- `window.electron.file.saveAttachment()` copies a source file into the conversation attachments directory.
- Chat composer uses `FileUploadButton`, which creates blob/data URLs in renderer memory and does not call `saveAttachment()`.
- Sending a message only passes `attachmentIds` into user message metadata.
- The LLM request does not read attachment content, attach image payloads, or pass file references to the model.
- Attachment previews are UI-only in the current chat flow.

Implication:

- The planned attachment context modes cannot be only UI chips. The actual content/reference pipeline is missing.
- Model compatibility warnings for image/file support require model capability metadata and a payload strategy.

Recommended implementation correction:

Attachment development must be split:

```text
1. Persist composer attachments via main process.
2. Store attachment metadata on message and session.
3. Add context mode per attachment.
4. Build request-time attachment resolver.
5. Add model capability validation.
6. Add vision/file payload support per provider.
```

Until step 4 exists, attachment chips are only visual references.

## 5. Current Permission and Approval Flow

Relevant files:

- `src/renderer/src/components/chat/ChatSettingsModal.tsx`
- `src/renderer/src/components/chat/ToolCallCard.tsx`
- `src/renderer/src/components/chat/ChatMessageList.tsx`
- `src/renderer/src/hooks/useChat.ts`
- `src/main/services/llm/LLMService.ts`
- `src/main/services/agent/AgentSDKService.ts`
- `src/main/ipc/handlers/modelHandlers.ts`

Findings:

- Current direct/skill tool permission modes are:
  - `none`
  - `auto`
  - `approve_always`
  - `approve_except_authorized`
- `LLMService.checkToolPermission()` broadcasts `tool_approval_request`.
- Agent SDK uses `options.canUseTool` and emits `permission_request`.
- Renderer maps both flows into `toolCall.status = "awaiting_approval"` and resolves through `respondToApproval()`.
- `ToolCallCard` already supports inline approve/reject.
- There is also a legacy `ToolApprovalModal`, but current main flow is inline through tool cards.
- There is no `Allow for session` grant model yet.
- There is no normalized approval request shape with risk level, target scope, or sandbox decision.

Implication:

- The plan's unified approval model should be implemented as an adapter over existing LLM and Agent SDK events.
- Removing current approval modes too early would break existing behavior.

Recommended implementation correction:

Map current permission modes to new labels initially:

```text
approve_always              -> Request approval
approve_except_authorized   -> Auto approve safe
auto                        -> Full access approval mode
none                        -> Tools disabled
```

Then add normalized approval metadata:

```ts
interface RuntimeApprovalRequest {
  id: string;
  requestId: string;
  source: "llm" | "agent-sdk" | "mcp" | "skill" | "app-plugin";
  operation: string;
  input: Record<string, unknown>;
  risk: "low" | "medium" | "high";
  scope: "conversation-workspace" | "workspace" | "external" | "network" | "system";
  grantOptions: Array<"once" | "session" | "deny">;
}
```

## 6. Current Sandbox Reality

Relevant files:

- `src/main/ipc/handlers/modelHandlers.ts`
- `src/main/services/mcp/internal/servers/*`
- `src/main/services/plugin/PluginAPIFactory.ts`
- `src/main/services/plugin/PermissionService.ts`
- `src/main/services/agent/AgentSDKService.ts`

Findings:

- Direct/skill MCP tool path resolution uses the per-conversation `workspace/` directory for relative paths.
- Some internal MCP servers receive `_storageDir` inside the conversation workspace.
- Plugin API has its own permission checks and a path check relative to plugin path/storage path unless external fs permissions are granted.
- Agent SDK receives `cwd` from `conversationStorage.getWorkspaceDir(conversationId)`.
- There is no centralized `WorkspaceRuntimePolicy` enforcement layer.
- There is no app-wide runtime audit log for sandbox/approval decisions.
- Network policy is not centralized. Plugin network uses permission grants; search and model providers use their own paths; MCP tools may perform network operations internally.

Implication:

- The current app has partial safety boundaries, but not a unified sandbox.
- `Full access` must not be added as a broad bypass. It should map to fewer approval prompts while keeping existing execution directories and path checks.

Recommended implementation correction:

Build runtime policy as a guard layer before broad rewrites:

```text
RuntimePolicyService
  ├── classify operation
  ├── evaluate approval mode
  ├── evaluate sandbox mode
  ├── emit approval request when needed
  └── write audit event
```

First integration points should be LLM tool executor and Agent SDK `canUseTool`.

## 7. Current MCP / Skill / App Plugin Integration

Relevant files:

- `src/renderer/src/stores/mcpStore.ts`
- `src/main/services/mcp/McpService.ts`
- `src/main/services/skill/SkillService.ts`
- `src/renderer/src/stores/skillStore.ts`
- `src/renderer/src/services/skill/skillService.ts`
- `src/main/services/plugin/PluginManager.ts`
- `src/main/services/plugin/PluginAPIFactory.ts`
- `src/main/services/plugin/UIContributionRegistry.ts`

Findings:

- MCP has both renderer store state and main-process service state.
- Internal MCP servers are always connected and not persisted as normal user servers.
- Skill runtime is in main process and already supports `SKILL.md` discovery, commands, and plugin-registered dynamic skills.
- Skill market state is renderer-side and separate from installed/builtin skill runtime.
- Plugin API can register commands, chat hooks, MCP tools, skills, sidebar entries, and pages.
- UI contributions are already centralized in `UIContributionRegistry`.
- Current Plugin is already closer to the proposed `App Plugin`, but it can also create agent-facing capabilities (`mcp.tools`, `skills.create`, `chat.hooks`).

Implication:

- Extensions page should be an adapter/aggregator over existing sources first.
- Do not merge services in Phase 1.
- User-facing copy can say `App Plugin`, but descriptors must expose when an app plugin contributes agent capabilities.

Recommended implementation correction:

Add an `ExtensionDescriptor` adapter layer:

```ts
interface ExtensionDescriptor {
  id: string;
  type: "mcp" | "skill" | "hook" | "app-plugin" | "theme" | "capability-package";
  source: "builtin" | "market" | "third-party" | "plugin" | "internal";
  scope: "global" | "workspace" | "session";
  name: string;
  description?: string;
  enabled: boolean;
  health: "active" | "inactive" | "error" | "unknown";
  permissions: string[];
  contributionPoints: string[];
  backingRef: {
    service: "mcp" | "skill" | "plugin";
    id: string;
  };
}
```

## 8. Navigation and IA Constraints

Relevant files:

- `src/renderer/src/types/menu.ts`
- `src/renderer/src/stores/menuStore.ts`
- `src/renderer/src/components/layout/MainLayout.tsx`
- `src/renderer/src/router.tsx`

Findings:

- First-level navigation comes from persisted `menu-config`.
- Default menu still includes `skills`, `mcp`, and `plugins` as separate entries.
- `menuStore` merges newly added defaults into persisted user config, which is useful for adding `Extensions`.
- Hiding old entries must account for existing persisted user menu configs.
- Plugin-contributed sidebar entries are appended at runtime.

Implication:

- Phase 1 cannot only change `DEFAULT_MENU_CONFIG`; existing users may still have old persisted entries.
- Need a menu migration or a layout-level rule to group/hide legacy entries after Extensions is introduced.

Recommended implementation correction:

- Add `extensions` default menu item.
- Add a one-time menu migration version.
- Keep routes `/skills`, `/mcp`, `/plugins` but link them from Extensions.
- Decide whether old entries are disabled by default or shown under an overflow/developer setting.

## 9. Plan Corrections Before Development

The plan in `docs/workspace-session-ui-plan.md` remains directionally correct, with these implementation corrections:

1. Treat existing `Conversation` as the initial backing store for `Session`.
2. Add `workspaceId` to conversation metadata before adding a separate session store.
3. Superseded: do not implement direct/skill chat mode switching. Current product is Agent-only; model control must target Agent runtime and compatibility metadata only.
4. Split attachment work into persistence, context mode, resolver, and model payload support.
5. Implement unified approvals as an adapter over existing LLM and Agent SDK events.
6. Build `RuntimePolicyService` incrementally; do not assume current code has central sandbox enforcement.
7. Superseded: do not implement an Extensions aggregate product page. Keep MCP, Skills, and App Plugins as independent first-class markets/settings surfaces.
8. Remove or hide only stale aggregate Extensions routes/menu entries; do not demote independent MCP/Skills/App Plugins entries.

## 10. Revised Development Order

Recommended first tasks:

1. `session-metadata-audit-types`
   - Define `SessionMetadata`, `PlanMode`, `ModelSelection`, and `WorkspaceRuntimePolicy`.
   - Store session metadata in conversation metadata.

2. `workspace-conversation-binding`
   - Ensure each new conversation gets a `workspaceId`.
   - Backfill existing conversations to default workspace.
   - Sync workspace `sessionIds` from conversation metadata.

3. `extension-descriptor-readonly-compat`
   - Optional compatibility/debug projection only. Do not add a user-facing Extensions aggregate page.

4. `independent-marketplace-navigation`
   - Keep MCP, Skills, and App Plugins as independent first-level product areas.
   - Remove only stale aggregate Extensions entries/routes if present.

5. `model-switcher-agent-only`
   - Extract model switching from `ChatSettingsModal`.
   - Support `Use for this session` and reset.
   - Target Agent runtime. Legacy direct/chat metadata is compatibility-only.

6. `composer-plan-mode-state`
   - Add plan mode state to session metadata.
   - Pass plan mode into send flow only as metadata initially.

7. `attachment-persistence-for-composer`
   - Replace renderer-only composer upload with main-process attachment persistence.
   - Attach persisted IDs to messages.

8. `attachment-context-resolver`
   - Add attachment context modes.
   - Resolve content/reference before model request.

9. `approval-adapter`
   - Normalize LLM tool approval and Agent SDK permission request into one renderer model.

10. `runtime-policy-service-skeleton`
    - Classify operations and audit decisions before hard enforcement expands.

This order avoids the highest-risk mistake: changing UI concepts before the existing conversation runtime is properly bound to workspace/session metadata.
