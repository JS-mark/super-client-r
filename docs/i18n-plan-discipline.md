# i18n Plan Discipline

> 入口：[refactor-plan](./refactor-plan.md) ·
> 缺口：[refactor-gap-review](./refactor-gap-review.md) GAP-14 ·
> 门禁：[refactor-execution-gates](./refactor-execution-gates.md)
>
> 本文定义所有新 UI plan/spec 在实现前必须补齐的国际化约束。

## 1. Rule

所有会改变用户可见 UI 文案的重构 plan，都必须在 plan 阶段列出 i18n 影响。

这包括：

- button、menu、tooltip、modal、empty state、error state。
- destructive action confirm copy。
- import/recovery/error report 文案。
- runtime denial、approval、sandbox、privacy/export 文案。
- keyboard shortcut label 和 command palette action label。

## 2. Plan Template

每个 UI plan/spec 应包含一小节：

```md
## i18n

| Key | zh-CN | en-US | Notes |
| --- | --- | --- | --- |
| feature.action.open | 打开 | Open | Button label. |
```

如果 plan 暂时不能列完整 key，也必须列出文案范围和 debt owner：

```md
## i18n

- Scope: project archive/remove modal, missing path empty state, relink success/error.
- Temporary hardcoded copy: not allowed unless owner and cleanup task are listed.
- Owner: Phase F project management implementation.
```

## 3. Namespace Guidance

| Area | Suggested namespace |
| --- | --- |
| Project/session shell | `project.*`, `session.*`, `sidebar.*` |
| Global search | `search.*` |
| Runtime/approval | `runtime.*`, `approval.*` |
| Attachment context | `attachment.*` |
| Import/recovery | `migration.*`, `recovery.*` |
| Privacy/export | `privacy.*`, `export.*` |
| Skill validation | `skill.*` |

Use the repo’s existing i18n structure if it differs. The namespace names above are planning guidance, not a mandate to reorganize files.

## 4. Hardcoded Copy Policy

| Case | Policy |
| --- | --- |
| Prototype-only internal text | Allowed only if plan marks it as non-shipping. |
| User-visible new UI | Must use i18n keys before `verified`. |
| Error from low-level service | Store structured error code; renderer maps to i18n text. |
| Path / command / model name | Data values do not need translation, but surrounding labels do. |
| Logs/audit records | Stable machine-readable codes first; optional localized UI rendering. |
| Chinese-only docs | Fine for planning docs; implementation UI still needs keys. |

## 5. Boundary Cases

| Boundary | Required behavior |
| --- | --- |
| Fallback language missing | UI falls back to base language without crashing. |
| Long translations | Buttons/menus/tooltips must not overflow compact sidebar/composer controls. |
| Dynamic values | Use interpolation, not string concatenation. |
| Plurals/counts | Use plural-aware keys where supported. |
| Keyboard shortcuts | Shortcut glyphs can be platform-specific; action text still localized. |
| Destructive copy | Delete/remove/archive/physical delete must not share ambiguous generic text. |

## 6. Evidence Before Marking UI Work Verified

| Evidence | Requirement |
| --- | --- |
| Key list | Plan/spec lists new or changed keys. |
| Translation files | zh-CN and en-US entries exist, or repo-supported locales are updated consistently. |
| Missing-key check | Existing lint/test/build does not report missing keys. |
| Manual check | Compact sidebar/composer/settings states do not overflow with long English text. |
| Error path | At least one failure state displays localized copy, not raw exception text. |

## 7. Readiness Checklist

- [ ] Every new UI feature plan has an `i18n` section.
- [ ] Temporary hardcoded copy has owner and cleanup task.
- [ ] Destructive and privacy-sensitive actions have explicit localized copy.
- [ ] Runtime/service errors expose stable codes that renderer can translate.
- [ ] [refactor-execution-gates](./refactor-execution-gates.md) requires i18n evidence before `shippable`.
