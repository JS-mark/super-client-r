/**
 * Boot a real LocalServer instance on a free port for tests.
 *
 * The server is the production Koa app with every route mounted. Provider
 * HTTP outbound should be mocked separately via undici MockAgent
 * (see mockProvider.ts).
 *
 * Note: LocalServer is a singleton — multiple test files that call
 * startTestServer() share the same instance. Safe under vitest single-thread
 * mode; under parallel pools each thread already has its own JS sandbox.
 */
import { localServer } from "../main/server";
import { getOrCreateApiKey } from "../main/server/config";

export interface TestServerHandle {
	port: number;
	apiKey: string;
	baseUrl: string;
	stop: () => Promise<void>;
}

export async function startTestServer(): Promise<TestServerHandle> {
	const status = localServer.getStatus();
	if (status.status !== "running") {
		// `start()` calls get-port internally and picks a free port if the
		// configured one is taken; passing 0 is not necessary.
		await localServer.start();
	}
	const port = localServer.getPort();
	const apiKey = getOrCreateApiKey();
	return {
		port,
		apiKey,
		baseUrl: `http://127.0.0.1:${port}`,
		stop: async () => {
			await localServer.stop();
		},
	};
}
