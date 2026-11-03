import { resolve } from "node:path";

import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const appRoot = resolve(import.meta.dirname, "src/app");

export default defineConfig({
	plugins: [tanstackRouter({ autoCodeSplitting: true }), react(), tailwindcss()],
	resolve: { alias: { "@": appRoot } },
	build: { outDir: resolve(import.meta.dirname, "dist/app"), emptyOutDir: true },
	codeSplitting: { groups: [] },
});
