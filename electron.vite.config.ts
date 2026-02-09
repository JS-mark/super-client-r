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
	},
});
