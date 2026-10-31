import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { Deps } from "../../deps";
import type { AgentHome } from "../../platform/agent-home";
import { configWrite, errorContent, failure, toError } from "../../platform/http";
import { settingsFolder, settingsScopeQuerySchema } from "../projects";
import { packageResourcesSchema, packageSourceSchema as sourceSchema } from "./contract";
import type { PackageScope } from "./contract";
import { installPackage, packageResources, removePackage } from "./store";

const installPackageRoute = createRoute({
	method: "post",
	path: "/api/settings/packages",
	tags: ["settings"],
	operationId: "installPackage",
	description: "Install a package and declare it in pi's settings, for the home or a project",
	request: {
		query: settingsScopeQuerySchema,
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
	request: { query: sourceSchema.extend(settingsScopeQuerySchema.shape) },
	responses: {
		204: { description: "The package is no longer declared" },
		400: { description: "No declared package matched", content: errorContent },
	},
});

const packageResourcesRoute = createRoute({
	method: "get",
	path: "/api/settings/packages/resources",
	tags: ["settings"],
	operationId: "getPackageResources",
	description: "What a declared package provides: extensions, skills, prompts and themes",
	request: { query: sourceSchema.extend(settingsScopeQuerySchema.shape) },
	responses: {
		200: {
			description: "The package's resources",
			content: { "application/json": { schema: packageResourcesSchema } },
		},
		400: { description: "The read failed", content: errorContent },
	},
});

/** A project package lives in that project's settings, so it needs one. */
const folderFor = (home: AgentHome, project: string | undefined, scope: PackageScope) => {
	if (scope === "project" && project === undefined) {
		throw new Error("Pick a project to change its .pi/settings.json");
	}
	return settingsFolder(home, project);
};

export const packagesRoutes = ({ home, engines }: Deps) =>
	new OpenAPIHono()
		.openapi(installPackageRoute, (c) => {
			const { source, scope } = c.req.valid("json");
			const { project } = c.req.valid("query");
			return configWrite(c, engines, async () =>
				installPackage(await folderFor(home, project, scope), home, source, scope),
			);
		})
		.openapi(packageResourcesRoute, async (c) => {
			const { source, scope, project } = c.req.valid("query");
			try {
				const folder = await folderFor(home, project, scope);
				return c.json(await packageResources(folder, home, source, scope), 200);
			} catch (error) {
				return failure(c, toError(error, "The package could not be read"), 400);
			}
		})
		.openapi(removePackageRoute, (c) => {
			const { source, scope, project } = c.req.valid("query");
			return configWrite(c, engines, async () => {
				const removed = await removePackage(
					await folderFor(home, project, scope),
					home,
					source,
					scope,
				);
				if (!removed) throw new Error("No declared package matched that source");
			});
		});
