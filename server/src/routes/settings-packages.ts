import { createRoute } from "@hono/zod-openapi";
import type { RouteHandler } from "@hono/zod-openapi";
import { settingsErrorSchema } from "shared";
import { z } from "zod";

import { config } from "../config";
import { registry } from "../runtime";
import { installPackage, removePackage } from "../settings/packages";
import { failure } from "./failure";

const errorContent = { "application/json": { schema: settingsErrorSchema } };
const sourceSchema = z.object({ source: z.string().min(1) });

export const installPackageRoute = createRoute({
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

export const removePackageRoute = createRoute({
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

export const installPackageHandler: RouteHandler<typeof installPackageRoute> = async (c) => {
	try {
		await installPackage(config.projectDir, config.agentHome, c.req.valid("json").source);
		registry.reloadAll();
		return c.body(null, 204);
	} catch (error) {
		return failure(c, error instanceof Error ? error : new Error("The settings change failed"));
	}
};

export const removePackageHandler: RouteHandler<typeof removePackageRoute> = async (c) => {
	try {
		const removed = await removePackage(
			config.projectDir,
			config.agentHome,
			c.req.valid("query").source,
		);
		if (!removed) return failure(c, new Error("No declared package matched that source"));
		registry.reloadAll();
		return c.body(null, 204);
	} catch (error) {
		return failure(c, error instanceof Error ? error : new Error("The settings change failed"));
	}
};
