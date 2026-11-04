import { resolve } from "node:path";

import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const appRoot = resolve(import.meta.dirname, "src/app");
const serverPort = process.env["EPSILON_PORT"] ?? "3000";

/**
 * The router plugin reads `tsr.config.json` from Vite's root, while `tsr generate` reads it
 * from the repository root. The paths are passed here as absolutes so both agree and only
 * one config file exists.
 */
const router = () =>
	tanstackRouter({
		autoCodeSplitting: true,
		generatedRouteTree: resolve(appRoot, "routeTree.gen.ts"),
		quoteStyle: "double",
		routeFileIgnorePrefix: "-",
		routesDirectory: resolve(appRoot, "routes"),
		semicolons: true,
	});

/**
 * The launch token in the page Vite serves in dev.
 *
 * The built page is served by Epsilon itself, which substitutes the marker when it reads
 * `index.html`; in dev Vite serves the page, so the same substitution happens here, from
 * the value the dev script gave both processes.
 */
const launchToken = (): Plugin => ({
	name: "epsilon-launch-token",
	apply: "serve",
	transformIndexHtml: (html) => {
		const token = process.env["EPSILON_TOKEN"];
		return token === undefined ? html : html.replaceAll("__EPSILON_TOKEN__", token);
	},
});

export default defineConfig({
	root: appRoot,
	plugins: [
		router(),
		// React Compiler rewrites components so the hand-written `useMemo`/`useCallback` can
		// go. `infer` compiles every component and hook; `annotation` would need a directive.
		react({ compiler: { compilationMode: "infer" } }),
		tailwindcss(),
		launchToken(),
	],
	resolve: { alias: { "@": appRoot } },
	server: {
		proxy: {
			// `changeOrigin` makes the server see its own host in `Host`, which is what the
			// check in `serve.ts` accepts; the browser's `Origin` stays Vite's and is allowed
			// through `EPSILON_DEV_ORIGIN`.
			"/api": { changeOrigin: true, target: `http://127.0.0.1:${serverPort}`, ws: true },
		},
	},
	build: {
		outDir: resolve(import.meta.dirname, "dist/app"),
		emptyOutDir: true,
		// Vendor chunks keep one library in one file, so a route change reuses it and a
		// build does not rename it. Two libraries stay out on purpose: `@base-ui` is split
		// between the shell and a chat's dialogs, so one group would load every dialog
		// primitive on every page, and `lucide-react` is cheaper per route than one eager
		// chunk holding every icon. `@tanstack/virtual-core` is transcript-only for the same
		// reason.
		rolldownOptions: {
			output: {
				codeSplitting: {
					groups: [
						{
							name: "react",
							priority: 40,
							test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
						},
						{
							name: "effect",
							priority: 30,
							test: /node_modules[\\/](effect|@effect)[\\/]/,
						},
						{
							name: "tanstack",
							priority: 20,
							test: /node_modules[\\/]@tanstack[\\/](react-router|router-core|history|store|react-store|query-core|react-query)[\\/]/,
						},
					],
				},
			},
		},
	},
});
