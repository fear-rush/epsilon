/**
 * The Hono app. The OpenAPI document is generated from the `createRoute`
 * definitions in each feature, never written by hand. Agent control does not
 * travel here; it travels over the socket described in shared/src/protocol/frames.ts.
 */
import { Scalar } from "@scalar/hono-api-reference";

import type { Deps } from "./deps";
import { currentContractId, openApiDocument } from "./openapi";
import { mountRoutes } from "./routes";

export const createApp = (deps: Deps) => {
	const app = mountRoutes(deps, currentContractId);
	app.get("/openapi.json", (c) => c.json(openApiDocument()));
	app.get("/scalar", Scalar({ url: "/openapi.json", pageTitle: "API reference" }));
	return app;
};
