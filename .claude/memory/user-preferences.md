# 用户偏好设置

## 沟通方式

- **语言**：中文（所有回答一律使用中文）
- **回复风格**：简洁直接

## 技术栈专长

用户在以下技术领域拥有丰富经验：
- **前端框架**：Vue 2.7.16、Vue 3、React
- **编辑器**：TipTap、ProseMirror
- **构建工具**：Rollup、Vite
- **UI 框架**：Element UI、NaiveUI、Ant Design
- **后端**：Node.js、Next.js
- **样式**：CSS、Less、Scss、Tailwind CSS
- **测试**：Vitest
- **语言**：TypeScript

## 代码风格偏好

### 编程范式
- ✅ **优先使用**：函数式和声明式编程
- ❌ **避免使用**：类（class）
- ✅ **原则**：DRY（Don't Repeat Yourself）、模块化、迭代

### 命名规范
| 类型 | 格式 | 示例 |
|------|------|------|
| 组件名称 | PascalCase | `UserProfile` |
| 文件名 | kebab-case | `user-profile.vue` |
| 变量/函数 | camelCase | `getUserData` |
| 常量 | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT` |
| 类型/接口 | PascalCase | `UserData` |
| 布尔变量 | is/has/should 前缀 | `isActive`, `hasPermission` |

### 导出规范
- ✅ **优先使用**：命名导出（named exports）
- ❌ **避免使用**：默认导出（除非是页面组件）

### 函数风格
- ✅ **优先使用**：箭头函数
- ✅ **简洁语法**：简单条件语句避免不必要的大括号

```typescript
// ✅ 好
const double = (n: number) => n * 2
if (isValid) return result

// ❌ 差
function double(n: number) { return n * 2 }
if (isValid) { return result }
```

## Vue 开发规范

### Vue 2.7.16 规范
```vue
<script lang="ts">
import { defineComponent } from 'vue' // 使用 vue@2.7.16

export default defineComponent({
  name: 'ComponentName',
  props: {
    message: {
      type: String as PropType<string>,
      required: true
    }
  },
  setup(props, { emit }) {
    // 使用 Composition API
    return {
      // 返回响应式数据
    }
  }
})
</script>
```

### Vue 3 规范
```vue
<script setup lang="ts">
// ✅ 使用 <script setup> 语法
interface Props {
  message: string
  count?: number
}

defineProps<Props>()

defineEmits<{
  (e: 'update', value: string): void
  (e: 'submit'): void
}>()
</script>
```

## TypeScript 规范

### 类型定义
- ✅ **优先使用**：`interface`（对象类型）
- ✅ **使用 type**：联合类型、交叉类型、工具类型
- ❌ **禁止使用**：`any`
- ⚠️ **谨慎使用**：`unknown`（必要时才用）
- ❌ **避免使用**：`enum`
- ✅ **替代方案**：`const enum` 或对象映射

```typescript
// ✅ 好：使用 interface
interface User {
  id: string
  name: string
}

// ✅ 好：使用 const enum 或对象映射
const Status = {
  PENDING: 'pending',
  SUCCESS: 'success',
  ERROR: 'error',
} as const

type StatusType = typeof Status[keyof typeof Status]

// ❌ 差：使用 enum
enum Status {
  PENDING = 'pending',
  SUCCESS = 'success',
}
```

### 泛型命名
- `T` - 通用类型（Type）
- `K` - 键类型（Key）
- `V` - 值类型（Value）
- `P` - Props 类型
- `R` - 返回类型（Return）

```typescript
// ✅ 好
function getValue<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key]
}
```

## 文件结构规范

推荐的文件内容顺序：
1. 导入语句（第三方 → 内部模块 → 类型）
2. 类型定义
3. 常量定义
4. 导出的组件/函数
5. Composables/Hooks
6. 辅助函数
7. 静态内容

```typescript
// 1. 导入
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import type { User } from '@/types'

// 2. 类型
interface Props {
  user: User
}

// 3. 常量
const MAX_ITEMS = 10

// 4. 组件
export default defineComponent({
  // ...
})

// 5. Composables
function useUserData() {
  // ...
}

// 6. 辅助函数
const formatDate = (date: Date) => {
  // ...
}
```

## 代码质量

### ESLint 配置
- 参考项目的 `eslint.config.mjs` 配置
- 遵循项目既定的代码规范

### 最佳实践
- ✅ 编写干净、可维护的代码
- ✅ 确保类型安全
- ✅ 注重性能优化
- ✅ 模块化设计
- ✅ 代码复用

## 项目特定偏好

### Super Client R 项目
- 遵循 CLAUDE.md 中定义的规范
- IPC 通信使用 6 步法
- 状态管理使用 Zustand
- 样式使用 Tailwind CSS
- Main Process 作为单一数据源

---

**更新记录**：
- 2026-03-10：初始化用户个人开发规范
