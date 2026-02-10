import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import { resolve } from "path";

export default defineConfig({
	main: {
		build: {
			rollupOptions: {
				input: resolve(__dirname, "src/main/main.ts"),
			},
			watch: {
				exclude: ["**/node_modules/**", "**/out/**", "**/dist/**"],
			},
		},
		plugins: [externalizeDepsPlugin()],

	},
	preload: {
		build: {
			rollupOptions: {
				input: resolve(__dirname, "src/preload/index.ts"),
			},
			watch: {
				exclude: ["**/node_modules/**", "**/out/**", "**/dist/**"],
			},
		},
		plugins: [externalizeDepsPlugin()],
	},
	renderer: {
		resolve: {
			alias: {
				"@": resolve("src/renderer/src"),
			},
		},
		plugins: [react(), tailwindcss()],
		build: {
			minify: false,
			// Ensure worker files are properly bundled
			rollupOptions: {
				output: {
					manualChunks: {
						// Separate worker chunks for better caching
						'log-worker': ['./src/renderer/src/workers/logWorker.ts'],
					},
				},
			},
		},
		worker: {
			format: 'es',
		},
		server: {
			port: 5173,
			strictPort: false,
			hmr: {
				port: 5174,
			},
		},
	},
});
