import { create } from "zustand";
import type {
	RemoteControlEvent,
	DeviceConnectionInfo,
} from "@/types/electron";

interface RemoteControlEventState {
	events: RemoteControlEvent[];
	connectionInfo: DeviceConnectionInfo | null;
	isLoading: boolean;
	fetchEvents: () => Promise<void>;
	clearEvents: () => Promise<void>;
	addEvent: (event: RemoteControlEvent) => void;
	fetchConnectionInfo: () => Promise<void>;
}

export const useRemoteControlEventStore = create<RemoteControlEventState>()(
	(set, get) => ({
		events: [],
		connectionInfo: null,
		isLoading: false,

		fetchEvents: async () => {
			set({ isLoading: true });
			try {
				const resp = await window.electron.remoteControl.getEvents();
				if (resp.success && resp.data) {
					set({ events: resp.data });
				}
			} finally {
				set({ isLoading: false });
			}
		},

		clearEvents: async () => {
			const resp = await window.electron.remoteControl.clearEvents();
			if (resp.success) {
				set({ events: [] });
			}
		},

		addEvent: (event: RemoteControlEvent) => {
			const { events } = get();
			// 去重
			if (events.some((e) => e.id === event.id)) return;
			set({ events: [...events, event] });
		},

		fetchConnectionInfo: async () => {
			const resp = await window.electron.remoteControl.getConnectionInfo();
			if (resp.success && resp.data) {
				set({ connectionInfo: resp.data });
			}
		},
	}),
);
