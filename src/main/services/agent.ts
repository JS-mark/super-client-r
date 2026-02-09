import {
	type SDKSession,
	unstable_v2_createSession,
} from "@anthropic-ai/claude-agent-sdk";
import { type IpcMainInvokeEvent, ipcMain } from "electron";

interface AgentSession {
	id: string;
	session: SDKSession;
}

const sessions: Map<string, AgentSession> = new Map();

export function setupAgentHandlers() {
	ipcMain.handle(
		"agent:createSession",
		async (event: IpcMainInvokeEvent, options: any) => {
			try {
				console.log("Creating agent session with options:", options);
				const session = unstable_v2_createSession({
					model: options.model || "claude-3-5-sonnet-20240620",
					...options,
				});

				const sessionId = session.sessionId;
				sessions.set(sessionId, { id: sessionId, session });

				console.log("Agent session created:", sessionId);
				return { sessionId };
			} catch (error: any) {
				console.error("Failed to create agent session:", error);
				return { error: error.message };
			}
		},
	);

	ipcMain.handle(
		"agent:sendMessage",
		async (
			event: IpcMainInvokeEvent,
			{ sessionId, message }: { sessionId: string; message: string },
		) => {
			const sessionData = sessions.get(sessionId);
			if (!sessionData) {
				return { error: "Session not found" };
			}

			try {
				// Send message
				await sessionData.session.send(message);

				// Stream responses back
				for await (const sdkMessage of sessionData.session.stream()) {
					event.sender.send(`agent:message:${sessionId}`, sdkMessage);
				}

				return { success: true };
			} catch (error: any) {
				console.error("Error sending message to agent:", error);
				return { error: error.message };
			}
		},
	);

	ipcMain.handle(
		"agent:disposeSession",
		async (event: IpcMainInvokeEvent, { sessionId }: { sessionId: string }) => {
			const sessionData = sessions.get(sessionId);
			if (sessionData) {
				sessionData.session.close();
				sessions.delete(sessionId);
				return { success: true };
			}
			return { error: "Session not found" };
		},
	);
}
