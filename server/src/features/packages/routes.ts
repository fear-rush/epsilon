import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { z } from "zod";

import type { Deps } from "../../deps";
import { configWrite, errorContent } from "../../platform/http";
import { installPackage, removePackage } from "./service";

const sourceSchema = z.object({ source: z.string().min(1) });

const installPackageRoute = createRoute({
	method: "post",
	path: "/api/settings/packages",
	tags: ["settings"],
	operationId: "installPackage",
	description: "Install a package and declare it in pi's settings",
	request: {
		body: { required: true, content: { "application/json": { schema: sourceSchema } } },
	},
	responses: {
		204: { description: "The package is installed and configured" },
		400: { description: "The install failed", content: errorContent },
	},
});

const removePackageRoute = createRoute({
	method: "delete",
	path: "/api/settings/packages",
	tags: ["settings"],
	operationId: "removePackage",
	request: { query: sourceSchema },
	responses: {
		204: { description: "The package is no longer declared" },
		400: { description: "No declared package matched", content: errorContent },
	},
});

export const packagesRoutes = ({ home, projectDir, engines }: Deps) =>
	new OpenAPIHono()
		.openapi(installPackageRoute, (c) =>
			configWrite(c, engines, () => installPackage(projectDir, home, c.req.valid("json").source)),
		)
		.openapi(removePackageRoute, (c) => {
			const { source } = c.req.valid("query");
			return configWrite(c, engines, async () => {
				const removed = await removePackage(projectDir, home, source);
				if (!removed) throw new Error("No declared package matched that source");
			});
		});
