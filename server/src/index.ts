/**
 * The Hono app. The OpenAPI document is generated from the `createRoute`
 * definitions below, never written by hand. Agent control does not travel here;
 * it travels over the socket described in docs/protocol.md.
 */
import { OpenAPIHono } from "@hono/zod-openapi";
import { Scalar } from "@scalar/hono-api-reference";

import { healthBody, healthRoute } from "./routes/health";
import {
	deleteSessionHandler,
	deleteSessionRoute,
	listSessionsHandler,
	listSessionsRoute,
} from "./routes/sessions";

const app = new OpenAPIHono();

app.openapi(healthRoute, (c) => c.json(healthBody));
app.openapi(listSessionsRoute, listSessionsHandler);
app.openapi(deleteSessionRoute, deleteSessionHandler);

app.get("/openapi.json", (c) =>
	c.json(
		app.getOpenAPI31Document({
			openapi: "3.1.0",
			info: {
				title: "epsilon API",
				version: "0.0.1",
				description: "Local REST surface for reading and removing sessions.",
			},
		}),
	),
);

app.get("/scalar", Scalar({ url: "/openapi.json", pageTitle: "API reference" }));

export default app;
