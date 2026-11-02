import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { Deps } from "../../deps";
import type { AgentHome } from "../../platform/agent-home";
import { configWrite, errorContent, failure, toError } from "../../platform/http";
import { requireProject, settingsFolder, settingsScopeQuerySchema } from "../projects";
import {
	packageResourcesSchema,
	packageResourceInputSchema,
	packageSourceSchema as sourceSchema,
	packageUpdateListSchema,
} from "./contract";
import type { PackageScope } from "./contract";
import {
	installPackage,
	packageResources,
	packageUpdates,
	removePackage,
	setPackageResource,
	updatePackage,
} from "./store";

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
const folderFor = (home: AgentHome, project: string | undefined, scope: PackageScope) =>
	settingsFolder(
		home,
		scope === "project" ? requireProject(project, "its .pi/settings.json") : project,
	);

const setPackageResourceRoute = createRoute({
	method: "put",
	path: "/api/settings/packages/resource",
	tags: ["settings"],
	operationId: "setPackageResource",
	description:
		"Turn one of a package's resources on or off by writing a filter into the package's own settings entry, the way pi config does",
	request: {
		query: settingsScopeQuerySchema,
		body: {
			required: true,
			content: { "application/json": { schema: packageResourceInputSchema } },
		},
	},
	responses: {
		204: { description: "The filter is written, and live engines reloaded" },
		400: { description: "The resource could not be switched", content: errorContent },
	},
});

const packageUpdatesRoute = createRoute({
	method: "get",
	path: "/api/settings/packages/updates",
	tags: ["settings"],
	operationId: "getPackageUpdates",
	description:
		"Which declared packages have a newer npm or git version, asked of pi. A local source and a pinned version are never checked, and pi answers none when it is offline",
	request: { query: settingsScopeQuerySchema },
	responses: {
		200: {
			description: "The packages with an update available",
			content: { "application/json": { schema: packageUpdateListSchema } },
		},
		400: { description: "The check failed", content: errorContent },
	},
});

const updatePackageRoute = createRoute({
	method: "post",
	path: "/api/settings/packages/update",
	tags: ["settings"],
	operationId: "updatePackage",
	description:
		"Update one declared package through pi's own updater. npm or git text is the refusal, verbatim",
	request: {
		query: settingsScopeQuerySchema,
		body: { required: true, content: { "application/json": { schema: sourceSchema } } },
	},
	responses: {
		204: { description: "The package is updated, and live engines reloaded" },
		400: { description: "The update failed", content: errorContent },
	},
});

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
		.openapi(setPackageResourceRoute, (c) => {
			const input = c.req.valid("json");
			const { project } = c.req.valid("query");
			return configWrite(c, engines, async () =>
				setPackageResource(await folderFor(home, project, input.scope), home, input),
			);
		})
		.openapi(packageUpdatesRoute, async (c) => {
			const { project } = c.req.valid("query");
			try {
				return c.json(
					{ updates: await packageUpdates(await settingsFolder(home, project), home) },
					200,
				);
			} catch (error) {
				return failure(c, toError(error, "The package updates could not be checked"), 400);
			}
		})
		.openapi(updatePackageRoute, (c) => {
			const { source, scope } = c.req.valid("json");
			const { project } = c.req.valid("query");
			return configWrite(c, engines, async () =>
				updatePackage(await folderFor(home, project, scope), home, source, scope),
			);
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
