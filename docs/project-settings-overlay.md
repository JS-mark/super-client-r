# Project Settings Overlay

> 入口：[refactor-plan](./refactor-plan.md) ·
> 缺口 review：[refactor-gap-review](./refactor-gap-review.md)
>
> 本文定义 runtime settings 在 global / project / session / message 四层之间的合并规则。

## 1. Overlay Order

Effective runtime is resolved in this order:

```text
GLOBAL_RUNTIME_DEFAULTS
  <- AppConfig user defaults
  <- ProjectSettings sparse overrides
  <- SessionMeta sparse overrides
  <- Per-message request overrides
```

Later layers win only for fields they explicitly set.

## 2. Current Implementation Snapshot

当前实现已有 `SessionRuntimeResolver`，会从 `SessionMeta` + `ProjectSettings` + global defaults 解析有效 runtime；settings 持久化也已完成核心 patch 语义：

- `ProjectStorageService.saveSettings(id, patch)` 对 nested plain object 使用 deep merge。
- `undefined` 表示 no-op。
- `null` 表示 clear override；nested `null` 会删除 sibling field，top-level `null` 会删除整个 override。
- 已有测试覆盖 nested deep merge、nested null clear、top-level null clear、undefined no-op。
- 尚未完成：UI reset/source tooltip 还需 renderer 层测试。

因此本文剩余规则主要约束 renderer store + UI reset/source display。

## 3. Empty Value Semantics

| Value | Meaning |
| --- | --- |
| `undefined` | No override; inherit from lower layer. |
| `null` | Clear explicit override and inherit. Use only in patch APIs, not persisted final state. |
| empty string | Valid only for text fields where empty is meaningful; otherwise reject. |
| empty object | No override; should be normalized away before persistence. |

Persisted `ProjectSettings` and `SessionMeta` should stay sparse.

## 4. Field Matrix

| Field | Global | Project | Session | Message | Notes |
| --- | --- | --- | --- | --- | --- |
| `model` | default provider/model | project default | session override | one-shot override | Message override affects only one send. |
| `planMode` | default `chat` | optional default | session override | one-shot override | `plan-only` must gate tools. |
| `approvalMode` | default request | project policy | session override | no | Message-level approval would be too hard to explain. |
| `sandboxMode` | app default | project policy | session override | no | Hard sandbox still applies. |
| `interactionProfile` | app default | project preference | session override | no | UI layout only; should not alter storage. |
| `enabledCapabilities` | global installed | project allow/deny | session allow/deny | no | Needs merge by capability id. |
| `contextPolicy` | app default | project policy | session override | message attachments | Attachment mode can be per attachment/message. |

## 5. Patch API Rules

Patch APIs should distinguish set vs clear:

```ts
type PatchValue<T> = T | null | undefined;

interface ProjectSettingsPatch {
  model?: PatchValue<ModelSelection>;
  runtimePolicy?: PatchValue<Partial<WorkspaceRuntimePolicy>>;
  contextPolicy?: PatchValue<Partial<WorkspaceContextPolicy>>;
}
```

Rules:

- `undefined`: field omitted, no change.
- `null`: delete override.
- object: deep merge for policy objects; replace for model selection.
- Arrays: replace by default unless field explicitly says merge by id.
- Persisted output must drop `undefined`, `null`, and empty objects after applying the patch.
- Shallow merge is only valid for top-level scalar fields; nested policy objects require field-aware merge.

## 6. UI Requirements

- Every project/session setting row shows source: `App default`, `Project override`, `Session override`.
- Reset button clears only the current layer override.
- Hover tooltip shows the inherited value.
- Save disabled if patch normalizes to no-op.
- Invalid overrides fail before persistence and keep UI state editable.

## 7. Tests To Add

- [x] Undefined inherits lower layer / no-op in patch.
- [x] Null clears override.
- [x] Project approval overrides global.
- [x] Session model overrides project model.
- [ ] Message model override does not persist.
- [x] Deep merge runtimePolicy does not erase sibling keys.
- [ ] Reset project setting reveals app default in UI.
- [x] saveSettings does not persist `null`, `undefined`, or empty policy objects.
