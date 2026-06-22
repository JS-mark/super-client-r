import { vi } from "vitest";

installLocalStorageMock();

// 仅在 jsdom / 浏览器型环境下注入 window.electron mock。
// main-process 测试用 `// @vitest-environment node` 跑，此时 window
// 不存在，跳过 mock 注入避免 setup 崩。
if (typeof window === "undefined") {
	// Node environment — nothing to mock for renderer
} else {
	mockRendererElectronAPI();
}

function mockRendererElectronAPI(): void {
	global.window = {
		...window,
		electron: {
			ipc: {
				invoke: vi.fn(),
				on: vi.fn(),
				off: vi.fn(),
			},
			ipcRenderer: {
				invoke: vi.fn(),
				on: vi.fn(),
				off: vi.fn(),
			},
			skill: {
				listSkills: vi.fn(),
				installSkill: vi.fn(),
				uninstallSkill: vi.fn(),
				getSkill: vi.fn(),
				executeSkill: vi.fn(),
				getAllTools: vi.fn(),
				enableSkill: vi.fn(),
				disableSkill: vi.fn(),
			},
			mcp: {
				listServers: vi.fn(),
				addServer: vi.fn(),
				removeServer: vi.fn(),
				connect: vi.fn(),
				disconnect: vi.fn(),
				getTools: vi.fn(),
				callTool: vi.fn(),
				getAllTools: vi.fn(),
				getStatus: vi.fn(),
			},
			agent: {
				createSession: vi.fn(),
				sendMessage: vi.fn(),
				onStreamEvent: vi.fn(),
			},
		},
	} as any;
}

function installLocalStorageMock(): void {
	const store = new Map<string, string>();
	const storage = {
		get length() {
			return store.size;
		},
		clear: vi.fn(() => store.clear()),
		getItem: vi.fn((key: string) => store.get(key) ?? null),
		key: vi.fn((index: number) => Array.from(store.keys())[index] ?? null),
		removeItem: vi.fn((key: string) => {
			store.delete(key);
		}),
		setItem: vi.fn((key: string, value: string) => {
			store.set(key, String(value));
		}),
	};
	Object.defineProperty(globalThis, "localStorage", {
		value: storage,
		configurable: true,
	});
	if (typeof window !== "undefined") {
		Object.defineProperty(window, "localStorage", {
			value: storage,
			configurable: true,
		});
	}
}
