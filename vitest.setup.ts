import { vi } from "vitest";

// Mock electron API
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
