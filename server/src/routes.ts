/**
 * Every REST route, mounted. Kept apart from `createApp` so the OpenAPI document
 * can be built from the same routes without the server's own endpoints.
 */
import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { MiddlewareHandler } from "hono";
import { z } from "zod";

import type { Deps } from "./deps";
import { generalRoutes } from "./features/general/routes";
import { mcpRoutes } from "./features/mcp/routes";
import { mcpRegistryRoutes } from "./features/mcp-registry/routes";
import { packagesRoutes } from "./features/packages/routes";
import { projectsRoutes } from "./features/projects/routes";
import { providersRoutes } from "./features/providers/routes";
import { readinessRoutes } from "./features/readiness/routes";
import { sessionsRoutes } from "./features/sessions/routes";
import { settingsRoutes } from "./features/settings/routes";
import { skillImportRoutes } from "./features/skill-import/routes";
import { skillsRoutes } from "./features/skills/routes";

const healthRoute = createRoute({
	method: "get",
	path: "/health",
	tags: ["meta"],
	operationId: "health",
	responses: {
		200: {
			description: "Server is running",
			content: { "application/json": { schema: z.object({ status: z.literal("ok") }) } },
		},
	},
});

const CONTRACT_HEADER = "x-epsilon-contract";

/**
 * `contractId` names the contract this server answers with; every REST answer
 * carries it, so the browser can compare it with the id its generated types came
 * from. The OpenAPI document itself is built without one.
 */
export const mountRoutes = (deps: Deps, contractId: () => string) => {
	const stampContract: MiddlewareHandler = async (c, next) => {
		await next();
		c.header(CONTRACT_HEADER, contractId());
	};

	/**
	 * A refused request is the one sentence the panel shows, in the same shape every
	 * route documents. Without this the validator answers with its own envelope, and
	 * the browser has to guess which of two refusal shapes it received. Feature
	 * routers inherit it from the app they are mounted on.
	 */
	const app = new OpenAPIHono({
		defaultHook: (result, c) => {
			if (result.success) return undefined;
			const message = result.error.issues
				.map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`)
				.join("; ");
			return c.json({ message }, 400);
		},
	});

	// Registered before any route so it wraps every answer, errors included.
	app.use("/api/*", stampContract);
	app.use("/health", stampContract);

	// Mount order is the order of the generated OpenAPI document.
	app.openapi(healthRoute, (c) => c.json({ status: "ok" as const }, 200));
	app.route("/", readinessRoutes(deps));
	app.route("/", sessionsRoutes(deps));
	app.route("/", projectsRoutes(deps));
	app.route("/", settingsRoutes(deps));
	app.route("/", generalRoutes(deps));
	app.route("/", providersRoutes(deps));
	// Before the MCP routes: `/mcp/registry/search` would read as a scope and a name.
	app.route("/", mcpRegistryRoutes());
	app.route("/", mcpRoutes(deps));
	app.route("/", skillImportRoutes(deps));
	app.route("/", skillsRoutes(deps));
	app.route("/", packagesRoutes(deps));
	return app;
};
