import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";

import type { Deps } from "../../deps";
import type { AgentHome } from "../../platform/agent-home";
import { configWrite, errorContent, failure, toError } from "../../platform/http";
import type { SettingsScope } from "../../platform/pi";
import { settingsFolder, settingsScopeQuerySchema } from "../projects";
import {
	settingsScopeSchema,
	templateKindSchema,
	templateListSchema,
	templatePathInputSchema,
} from "./contract";
import { addTemplatePath, listTemplates, removeTemplatePath } from "./store";

/** A project list lives in that project's settings, so it needs one. */
const folderOf = (home: AgentHome, project: string | undefined, scope: SettingsScope) => {
	if (scope === "project" && project === undefined) {
		throw new Error("Pick a project to read its .pi/settings.json");
	}
	return settingsFolder(home, project);
};

const listTemplatesRoute = createRoute({
	method: "get",
	path: "/api/settings/templates",
	tags: ["settings"],
	operationId: "listTemplates",
	description:
		"One scope's prompt templates or themes: every entry pi resolved with its source and whether it is enabled, and the path list that produced it",
	request: {
		query: settingsScopeQuerySchema.extend({
			kind: templateKindSchema,
			scope: settingsScopeSchema,
		}),
	},
	responses: {
		200: {
			description: "The entries and the path list",
			content: { "application/json": { schema: templateListSchema } },
		},
		400: { description: "The read failed", content: errorContent },
	},
});

const addTemplatePathRoute = createRoute({
	method: "post",
	path: "/api/settings/templates/paths",
	tags: ["settings"],
	operationId: "addTemplatePath",
	description:
		"Add one path to the scope's prompt template list. The path must exist and be a folder or a .md file. A theme path is refused: a theme only changes a terminal",
	request: {
		query: settingsScopeQuerySchema,
		body: {
			required: true,
			content: { "application/json": { schema: templatePathInputSchema } },
		},
	},
	responses: {
		204: { description: "The path is written, and live engines reloaded" },
		400: { description: "The path was refused", content: errorContent },
	},
});

const removeTemplatePathRoute = createRoute({
	method: "delete",
	path: "/api/settings/templates/paths",
	tags: ["settings"],
	operationId: "removeTemplatePath",
	description: "Remove one entry from the scope's prompt template list",
	request: {
		query: settingsScopeQuerySchema.extend({
			kind: templateKindSchema,
			scope: settingsScopeSchema,
			path: z.string().min(1),
		}),
	},
	responses: {
		204: { description: "The entry is removed, and live engines reloaded" },
		400: { description: "The entry was not in the list", content: errorContent },
	},
});

export const templatesRoutes = ({ home, engines }: Deps) =>
	new OpenAPIHono()
		.openapi(listTemplatesRoute, async (c) => {
			const { kind, scope, project } = c.req.valid("query");
			try {
				const folder = await folderOf(home, project, scope);
				return c.json(await listTemplates(folder, home, kind, scope), 200);
			} catch (error) {
				return failure(c, toError(error, "The template list could not be read"), 400);
			}
		})
		.openapi(addTemplatePathRoute, (c) => {
			const input = c.req.valid("json");
			const { project } = c.req.valid("query");
			return configWrite(c, engines, async () =>
				addTemplatePath(await folderOf(home, project, input.scope), home, input),
			);
		})
		.openapi(removeTemplatePathRoute, (c) => {
			const { kind, scope, path, project } = c.req.valid("query");
			return configWrite(c, engines, async () =>
				removeTemplatePath(await folderOf(home, project, scope), home, { kind, scope, path }),
			);
		});
