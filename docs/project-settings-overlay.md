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

当前实现已有 `SessionRuntimeResolver`，会从 `SessionMeta` + `ProjectSettings` + global defaults 解析有效 runtime；但 settings 持久化仍是 MVP：

- `ProjectStorageService.saveSettings(id, patch)` 当前使用 shallow merge：`{ ...current, ...patch }`。
- `runtimePolicy` / `contextPolicy` 这类 nested policy 如果直接 patch，可能覆盖掉 sibling fields。
- `null` clear 语义尚未在 storage 层规范化；若直接持久化 `null`，会和“稀疏覆盖”模型冲突。
- UI reset 需要等 patch API 明确 set/clear/no-op 后再承诺。

因此本文后续规则是目标契约，进入实现前需要补 storage + renderer store + UI tests。

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

- [ ] Undefined inherits lower layer.
- [ ] Null clears override.
- [ ] Project approval overrides global.
- [ ] Session model overrides project model.
- [ ] Message model override does not persist.
- [ ] Deep merge runtimePolicy does not erase sibling keys.
- [ ] Reset project setting reveals app default in UI.
- [ ] saveSettings does not persist `null`, `undefined`, or empty policy objects.
