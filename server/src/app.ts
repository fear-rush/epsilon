/**
 * The Hono app. The OpenAPI document is generated from the `createRoute`
 * definitions in each feature, never written by hand. Agent control does not
 * travel here; it travels over the socket described in docs/protocol.md.
 */
import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { Scalar } from "@scalar/hono-api-reference";
import { z } from "zod";

import type { Deps } from "./deps";
import { generalRoutes } from "./features/general/routes";
import { mcpRoutes } from "./features/mcp/routes";
import { packagesRoutes } from "./features/packages/routes";
import { providersRoutes } from "./features/providers/routes";
import { readinessRoutes } from "./features/readiness/routes";
import { sessionsRoutes } from "./features/sessions/routes";
import { settingsRoutes } from "./features/settings/routes";
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

export const createApp = (deps: Deps) => {
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

	// Mount order is the order of the generated OpenAPI document.
	app.openapi(healthRoute, (c) => c.json({ status: "ok" as const }, 200));
	app.route("/", readinessRoutes(deps));
	app.route("/", sessionsRoutes(deps));
	app.route("/", settingsRoutes(deps));
	app.route("/", generalRoutes(deps));
	app.route("/", providersRoutes(deps));
	app.route("/", mcpRoutes(deps));
	app.route("/", skillsRoutes(deps));
	app.route("/", packagesRoutes(deps));

	app.get("/openapi.json", (c) =>
		c.json(
			app.getOpenAPI31Document({
				openapi: "3.1.0",
				info: {
					title: "epsilon API",
					version: "0.0.1",
					description: "Local REST surface for sessions and for configuring this deployment.",
				},
			}),
		),
	);

	app.get("/scalar", Scalar({ url: "/openapi.json", pageTitle: "API reference" }));

	return app;
};
