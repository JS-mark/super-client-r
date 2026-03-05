# 主题定制

Super Client R 支持深色/浅色主题，并允许通过自定义 CSS 进行深度定制。

## 主题模式

### 切换主题

**通过设置界面：**

```
设置 → 通用 → 主题
```

选项：
- **浅色**：始终使用浅色主题
- **深色**：始终使用深色主题
- **跟随系统**：自动切换（默认）

**通过快捷键：**

```
Cmd/Ctrl + Shift + L
```

### 检测当前主题

```tsx
import { useTheme } from '@/hooks/useTheme';

function MyComponent() {
  const { theme, isDark } = useTheme();

  return (
    <div className={isDark ? 'dark-content' : 'light-content'}>
      Current theme: {theme}
    </div>
  );
}
```

## CSS 变量

主题通过 CSS 变量实现，可在自定义样式中使用：

### 颜色变量

```css
:root {
  /* 主色调 */
  --color-primary: #3b82f6;
  --color-primary-hover: #2563eb;
  --color-primary-active: #1d4ed8;

  /* 背景色 */
  --color-bg-base: #ffffff;
  --color-bg-elevated: #fafafa;
  --color-bg-container: #f5f5f5;

  /* 文字色 */
  --color-text: rgba(0, 0, 0, 0.88);
  --color-text-secondary: rgba(0, 0, 0, 0.65);
  --color-text-tertiary: rgba(0, 0, 0, 0.45);

  /* 边框色 */
  --color-border: #d9d9d9;
  --color-border-secondary: #f0f0f0;
}

.dark {
  --color-bg-base: #141414;
  --color-bg-elevated: #1f1f1f;
  --color-bg-container: #2a2a2a;

  --color-text: rgba(255, 255, 255, 0.85);
  --color-text-secondary: rgba(255, 255, 255, 0.65);
  --color-text-tertiary: rgba(255, 255, 255, 0.45);

  --color-border: #424242;
  --color-border-secondary: #303030;
}
```

### 使用变量

```css
.my-component {
  background-color: var(--color-bg-container);
  color: var(--color-text);
  border: 1px solid var(--color-border);
}
```

```tsx
// Tailwind CSS
<div className="bg-[var(--color-bg-container)] text-[var(--color-text)]">
```

## 自定义 CSS

### 通过配置文件

```json
{
  "appearance": {
    "customCSS": "
      /* 自定义字体 */
      .chat-message {
        font-family: 'Fira Code', 'SF Mono', monospace;
        font-size: 14px;
        line-height: 1.6;
      }

      /* 自定义代码块 */
      pre code {
        border-radius: 8px;
        padding: 16px;
      }

      /* 自定义滚动条 */
      ::-webkit-scrollbar {
        width: 8px;
        height: 8px;
      }
      ::-webkit-scrollbar-thumb {
        background: var(--color-border);
        border-radius: 4px;
      }
    "
  }
}
```

### 通过用户样式文件

创建 `custom.css` 文件：

**macOS:**
```bash
~/Library/Application\ Support/super-client-r/custom.css
```

**Windows:**
```
%APPDATA%\super-client-r\custom.css
```

**Linux:**
```bash
~/.config/super-client-r/custom.css
```

## 主题示例

### 高对比度主题

```css
/* custom.css */
:root {
  --color-primary: #005fcc;
  --color-text: #000000;
  --color-bg-base: #ffffff;
  --color-border: #000000;
}

.dark {
  --color-primary: #66b3ff;
  --color-text: #ffffff;
  --color-bg-base: #000000;
  --color-border: #ffffff;
}
```

### 暖色主题

```css
:root {
  --color-primary: #d97706;
  --color-bg-base: #fffbeb;
  --color-bg-container: #fef3c7;
}

.dark {
  --color-primary: #fbbf24;
  --color-bg-base: #451a03;
  --color-bg-container: #78350f;
}
```

### 紧凑主题

```css
/* 减小间距 */
.ant-layout {
  --padding-lg: 16px;
  --padding-md: 12px;
  --padding-sm: 8px;
}

.chat-message {
  margin-bottom: 12px;
}

.chat-input {
  min-height: 48px;
}
```

## 组件主题

### Ant Design 主题

在 `src/renderer/src/main.tsx` 中配置：

```tsx
import { ConfigProvider } from 'antd';

const theme = {
  token: {
    colorPrimary: '#3b82f6',
    borderRadius: 8,
    fontFamily: 'Inter, -apple-system, sans-serif',
  },
  components: {
    Button: {
      borderRadius: 6,
    },
    Card: {
      borderRadius: 12,
    },
  },
};

<ConfigProvider theme={theme}>
  <App />
</ConfigProvider>
```

### Tailwind 配置

在 `tailwind.config.js` 中扩展：

```js
module.exports = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
        },
      },
    },
  },
};
```

## 动态主题

### 运行时切换

```tsx
import { theme } from 'antd';

function ThemeToggle() {
  const { token } = theme.useToken();

  const setPrimaryColor = (color: string) => {
    ConfigProvider.config({
      theme: {
        primaryColor: color,
      },
    });
  };

  return (
    <div>
      <button onClick={() => setPrimaryColor('#3b82f6')}>Blue</button>
      <button onClick={() => setPrimaryColor('#10b981')}>Green</button>
      <button onClick={() => setPrimaryColor('#f59e0b')}>Orange</button>
    </div>
  );
}
```

### 跟随系统主题

```tsx
import { useEffect, useState } from 'react';

function useSystemTheme() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    setIsDark(media.matches);

    const listener = (e: MediaQueryListEvent) => {
      setIsDark(e.matches);
    };

    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);

  return isDark;
}
```

## 最佳实践

### 1. 使用语义化变量

```css
/* ✅ 推荐 */
background-color: var(--color-bg-container);

/* ❌ 不推荐 */
background-color: #f5f5f5;
```

### 2. 保持对比度

确保文字和背景有足够的对比度：

```css
/* ✅ 良好对比度 */
--color-text: #000000;
--color-bg-base: #ffffff;

/* ❌ 对比度不足 */
--color-text: #999999;
--color-bg-base: #eeeeee;
```

### 3. 测试两种主题

所有自定义样式都要在深色和浅色模式下测试。

### 4. 使用过渡动画

```css
.my-component {
  background-color: var(--color-bg-container);
  color: var(--color-text);
  transition: background-color 0.3s, color 0.3s;
}
```

## 故障排除

### 主题不切换

1. 检查 `dark` 类是否正确添加到 html 元素
2. 验证 CSS 变量定义
3. 检查自定义 CSS 是否覆盖

### 样式不生效

1. 确认 CSS 文件路径正确
2. 检查选择器优先级
3. 查看是否有语法错误

### 闪烁问题

添加主题过渡：

```css
* {
  transition: background-color 0.3s ease, color 0.3s ease;
}
```
