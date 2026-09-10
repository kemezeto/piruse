import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	root: fileURLToPath(new URL("./apps/web/ui", import.meta.url)),
	plugins: [react()],
	resolve: {
		alias: {
			"@protocol": fileURLToPath(new URL("./packages/protocol/src", import.meta.url)),
		},
	},
});
