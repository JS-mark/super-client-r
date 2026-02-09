# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**CRITICAL**: Always follow the patterns and templates defined in this file. When generating code, prioritize the "Code Generation Templates" section and the "Anti-patterns to Avoid" section.

---

## Project Overview

**Super Client R** (超级客户端) is an Electron-based desktop AI client application with comprehensive features including:

- AI chat powered by Claude SDK
- MCP (Model Context Protocol) server management
- Extensible Skill system
- Local HTTP API server
- Floating widget support
- Internationalization (i18n)

## Technology Stack

| Category | Technology | Version |
|----------|------------|---------|
| Framework | Electron | ^38.7.2 |
| UI | React + Ant Design | ^19.2.3 / ^6.2.1 |
| Build | Vite + electron-vite | ^7.3.1 / ^5.0.0 |
| State | Zustand | ^5.0.10 |
| Styling | Tailwind CSS | ^4.1.18 |
| Language | TypeScript | ~5.8.3 |
| Server | Koa | ^3.1.1 |
| AI SDK | @anthropic-ai/sdk | ^0.71.2 |
| MCP SDK | @modelcontextprotocol/sdk | ^1.25.3 |

## Project Structure

```
src/
├── main/                   # Electron main process (Node.js)
│   ├── ipc/               # IPC communication
│   │   ├── channels.ts    # IPC channel definitions
│   │   ├── types.ts       # IPC type definitions
│   │   └── handlers/      # IPC handlers
│   ├── services/          # Business services (EventEmitter-based)
│   │   ├── agent/         # Agent service
│   │   ├── mcp/           # MCP service
│   │   └── skill/         # Skill service
│   ├── server/            # Koa HTTP server
│   ├── store/             # Electron store
│   ├── utils/             # Utilities
│   └── main.ts            # Main entry
├── preload/               # Preload script (security bridge)
│   └── index.ts
└── renderer/              # Renderer process (React, no Node API)
    ├── pages/             # Page components
    ├── components/        # UI components
    ├── hooks/             # Custom hooks
    ├── stores/            # Zustand stores
    ├── services/          # Service clients
    ├── types/             # TypeScript types
    └── i18n/              # Internationalization
```

## Development Commands

```bash
# Development
pnpm dev                  # Start dev server with hot reload

# Code quality
pnpm check               # TypeScript type check
pnpm lint                # oxlint check
pnpm format              # Format code

# Building
pnpm build               # Build for production
```

---

## Code Generation Templates

### Template 1: IPC Communication (6 Steps)

**ALWAYS follow these 6 steps in order** when adding IPC functionality:

```typescript
// Step 1: Define channel (src/main/ipc/channels.ts)
export const FEATURE_CHANNELS = {
  ACTION: 'feature:action',
} as const;

// Step 2: Define types (src/main/ipc/types.ts)
export interface FeatureRequest {
  data: string;
}

export interface FeatureResponse {
  result: string;
}

// Step 3: Implement handler (src/main/ipc/handlers/featureHandler.ts)
export function registerFeatureHandlers() {
  ipcMain.handle(FEATURE_CHANNELS.ACTION, async (event, request: IPCRequest<FeatureRequest>) => {
    try {
      const result = await processAction(request.payload);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
}

// Step 4: Register handler (src/main/ipc/index.ts)
import { registerFeatureHandlers } from './handlers/featureHandler';
export function registerIpcHandlers() {
  registerFeatureHandlers(); // Add to registration list
}

// Step 5: Expose API (src/preload/index.ts)
contextBridge.exposeInMainWorld('electronAPI', {
  feature: {
    action: (request: FeatureRequest) =>
      ipcRenderer.invoke(FEATURE_CHANNELS.ACTION, request),
  },
});

// Step 6: Create client (src/renderer/src/services/featureService.ts)
export const featureService = {
  action: (data: string) => window.electronAPI.feature.action({ data }),
};
```

**Verification Checklist**:
- [ ] Channel name uses `kebab-case` format (`module:action`)
- [ ] Handler returns `{ success, data?, error? }` format
- [ ] All async operations wrapped in try-catch
- [ ] Preload script exposes the API
- [ ] Client provides type-safe wrapper

### Template 2: Zustand Store

```typescript
// src/renderer/src/stores/featureStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface FeatureState {
  items: string[];
  isLoading: boolean;
  addItem: (item: string) => void;
  removeItem: (id: string) => void;
  fetchItems: () => Promise<void>;
}

export const useFeatureStore = create<FeatureState>()(
  persist(
    (set, get) => ({
      items: [],
      isLoading: false,
      addItem: (item) => set((state) => ({
        items: [...state.items, item]
      })),
      removeItem: (id) => set((state) => ({
        items: state.items.filter((item) => item.id !== id)
      })),
      fetchItems: async () => {
        set({ isLoading: true });
        try {
          const items = await api.fetchItems();
          set({ items, isLoading: false });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },
    }),
    {
      name: 'feature-storage',
      partialize: (state) => ({ items: state.items }), // Only persist items
    }
  )
);
```

### Template 3: React Component

```typescript
// src/renderer/src/components/feature/FeatureComponent.tsx
import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from 'antd';
import { cn } from '@/lib/utils';
import type { FeatureItem } from '@/types';

interface FeatureComponentProps {
  items: FeatureItem[];
  onSelect: (item: FeatureItem) => void;
  loading?: boolean;
}

export function FeatureComponent({
  items,
  onSelect,
  loading = false
}: FeatureComponentProps) {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleSelect = useCallback((item: FeatureItem) => {
    setSelectedId(item.id);
    onSelect(item);
  }, [onSelect]);

  return (
    <div className="p-4">
      {items.map((item) => (
        <div
          key={item.id}
          className={cn(
            'p-2 rounded cursor-pointer',
            selectedId === item.id && 'bg-blue-100'
          )}
          onClick={() => handleSelect(item)}
        >
          {item.name}
        </div>
      ))}
    </div>
  );
}
```

**Required for every component**:
1. Define Props interface
2. Use `useCallback` for event handlers
3. Use `useTranslation` for i18n
4. Use Tailwind CSS classes
5. Use `cn()` for class merging

### Template 4: Main Process Service

```typescript
// src/main/services/feature/FeatureService.ts
import { EventEmitter } from 'events';
import type { FeatureConfig, FeatureResult } from '@/ipc/types';

export class FeatureService extends EventEmitter {
  private features = new Map<string, FeatureConfig>();

  async initialize(config: FeatureConfig): Promise<void> {
    this.features.set(config.id, config);
    this.emit('started', config.id);

    try {
      const result = await this.processFeature(config);
      this.emit('completed', config.id, result);
    } catch (error) {
      this.emit('error', config.id, error);
      throw error;
    }
  }

  private async processFeature(config: FeatureConfig): Promise<FeatureResult> {
    // Implementation
  }
}

// Singleton export
export const featureService = new FeatureService();
```

---

## Architecture Patterns

### Pattern 1: Cross-Process State Sync

Main Process is the single source of truth:

```typescript
// Main Process
class AgentService extends EventEmitter {
  async createSession(config: Config) {
    const session = await this.doCreate(config);
    // Broadcast to all windows
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('agent:session-created', session);
    });
    return session;
  }
}

// Renderer Process
useEffect(() => {
  const unsubscribe = window.electronAPI.agent.onSessionCreated((session) => {
    useAgentStore.getState().addSession(session);
  });
  return unsubscribe;
}, []);
```

### Pattern 2: Streaming Data

```typescript
// Main Process: Send chunks
async function streamResponse(sessionId: string, prompt: string) {
  const stream = await anthropic.messages.create({
    messages: [{ role: 'user', content: prompt }],
    stream: true,
  });

  for await (const chunk of stream) {
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('agent:stream-chunk', {
        sessionId,
        content: chunk.delta.text,
      });
    });
  }
}

// Renderer Process: Accumulate
const [content, setContent] = useState('');
useEffect(() => {
  return window.electronAPI.agent.onStreamChunk(({ content: chunk }) => {
    setContent((prev) => prev + chunk);
  });
}, []);
```

---

## Anti-patterns to Avoid

### ❌ Anti-pattern 1: Direct Node API in Renderer

```typescript
// WRONG: Renderer process using Node API directly
import { readFile } from 'fs'; // This will fail in renderer!

// CORRECT: Use IPC
const content = await window.electronAPI.file.read(path);
```

### ❌ Anti-pattern 2: Sync IPC

```typescript
// WRONG: Synchronous IPC (removed in Electron)
const result = ipcRenderer.sendSync('channel', data);

// CORRECT: Async IPC
const result = await ipcRenderer.invoke('channel', data);
```

### ❌ Anti-pattern 3: State Duplication

```typescript
// WRONG: State maintained in both processes
// Main: has sessions
// Renderer: also has sessions - can get out of sync!

// CORRECT: Main is source of truth
// Main: maintains sessions
// Renderer: store updates via IPC events
```

### ❌ Anti-pattern 4: Memory Leak

```typescript
// WRONG: Event listener not cleaned up
useEffect(() => {
  window.electronAPI.onEvent((data) => {
    setState(data);
  });
}, []); // Not removed on unmount!

// CORRECT: Return cleanup function
useEffect(() => {
  const unsubscribe = window.electronAPI.onEvent((data) => {
    setState(data);
  });
  return unsubscribe; // Cleanup on unmount
}, []);
```

### ❌ Anti-pattern 5: Exposing ipcRenderer

```typescript
// WRONG: Exposing raw ipcRenderer
contextBridge.exposeInMainWorld('ipcRenderer', ipcRenderer);
// This allows renderer to send any IPC message!

// CORRECT: Expose specific methods only
contextBridge.exposeInMainWorld('electronAPI', {
  specificAction: (data) => ipcRenderer.invoke('channel', data),
});
```

---

## Security Guidelines

### IPC Input Validation

```typescript
ipcMain.handle('file:read', async (event, request) => {
  const { path } = request.payload;

  // Validate path
  if (path.includes('..') || path.startsWith('/etc')) {
    return { success: false, error: 'Invalid path' };
  }

  // Ensure path is within allowed directory
  const fullPath = path.join(userDataPath, path);
  if (!fullPath.startsWith(userDataPath)) {
    return { success: false, error: 'Path outside allowed directory' };
  }

  const content = await fs.readFile(fullPath);
  return { success: true, data: content };
});
```

### Preload Script Security

- **DO**: Expose minimal API surface
- **DO**: Validate all input parameters
- **DON'T**: Expose `ipcRenderer` object directly
- **DON'T**: Allow arbitrary channel access

---

## Code Standards

### File Naming

| Type | Convention | Example |
|------|------------|---------|
| Components | PascalCase | `ChatInput.tsx` |
| Hooks | camelCase | `useChat.ts` |
| IPC Channels | kebab-case | `agent:create-session` |
| Stores | camelCase | `useChatStore.ts` |
| Services | PascalCase | `AgentService.ts` |

### TypeScript

- Use explicit types for function parameters and return types
- Avoid `any`, use `unknown` with type guards
- Prefer `interface` for object types, `type` for unions

### React

- Functional components with hooks
- `useCallback` for event handlers passed to children
- Zustand selectors to prevent unnecessary re-renders

### Styling

- Tailwind CSS for utility classes
- `clsx` + `tailwind-merge` for conditional classes
- CSS variables for theme colors

---

## Debugging Guide

### IPC Not Responding

1. Check channel defined in `channels.ts`
2. Check handler implemented in `handlers/`
3. Check handler registered in `index.ts`
4. Check API exposed in `preload/index.ts`
5. Check main process console for errors

### Type Errors

1. Run `pnpm check` for detailed errors
2. Check `tsconfig.json` paths configuration
3. Ensure correct imports (`@/` for renderer)

### Build Failures

1. Check for circular dependencies
2. Verify platform-specific APIs have guards
3. Clear `out/` directory and retry
4. Check Node version (>=22)

---

## Quick Reference

### Adding Features

| Feature | Steps |
|---------|-------|
| IPC Channel | 6 steps in Code Generation Templates |
| Store | Create in `stores/` → Define types → Create hook |
| Page | Create in `pages/` → Add route → Add menu → Add i18n |
| Component | Create in `components/` → Follow React template |

### Naming Quick Reference

```
Components:    PascalCase    (ChatInput.tsx)
Hooks:         camelCase     (useChat.ts)
Channels:      kebab-case    (agent:create-session)
Stores:        camelCase     (useChatStore.ts)
Services:      PascalCase    (AgentService.ts)
```

### Troubleshooting

| Problem | Solution |
|---------|----------|
| IPC no response | Check handler registration |
| Type error | Check tsconfig paths |
| Style not working | Check Tailwind content config |
| Build error | Check circular dependencies |
| HMR not working | Clear out/ directory |

---

## Documentation

See `docs/` directory for detailed documentation:

- [ARCHITECTURE.md](./docs/ARCHITECTURE.md) - System architecture
- [PROJECT_STRUCTURE.md](./docs/PROJECT_STRUCTURE.md) - Project structure
- [CODING_STANDARDS.md](./docs/CODING_STANDARDS.md) - Code standards
- [DEVELOPMENT.md](./docs/DEVELOPMENT.md) - Development guide
- [API.md](./docs/API.md) - API documentation
- [CLAUDE_CODE_GUIDE.md](./docs/CLAUDE_CODE_GUIDE.md) - Extended Claude Code guide
