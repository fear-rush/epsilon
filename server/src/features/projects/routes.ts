import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { z } from "zod";

import type { Deps } from "../../deps";
import { errorContent, failure, toError } from "../../platform/http";
import {
	folderListingSchema,
	newFolderInputSchema,
	createdFolderSchema,
	projectPathInputSchema,
	projectStatusSchema,
} from "./contract";
import { createFolder, listFolders, readProjectStatus, trustProjectFolder } from "./service";

const statusContent = { "application/json": { schema: projectStatusSchema } };

const projectStatusRoute = createRoute({
	method: "get",
	path: "/api/projects/status",
	tags: ["projects"],
	operationId: "projectStatus",
	request: { query: z.object({ path: z.string().min(1) }) },
	responses: {
		200: { description: "The folder, and whether pi trusts it", content: statusContent },
		400: { description: "The path is not a folder that can be a project", content: errorContent },
	},
});

const trustProjectRoute = createRoute({
	method: "post",
	path: "/api/projects/trust",
	tags: ["projects"],
	operationId: "trustProject",
	description: "Trust a folder in pi's trust.json, through pi's own store",
	request: {
		body: { required: true, content: { "application/json": { schema: projectPathInputSchema } } },
	},
	responses: {
		200: { description: "The folder, now trusted", content: statusContent },
		400: { description: "The path is not a folder that can be a project", content: errorContent },
	},
});

const browseFoldersRoute = createRoute({
	method: "get",
	path: "/api/projects/folders",
	tags: ["projects"],
	operationId: "browseFolders",
	request: {
		query: z.object({
			path: z.string().min(1).optional(),
			hidden: z.enum(["true", "false"]).optional(),
		}),
	},
	responses: {
		200: {
			description: "The subfolders of one folder, the operator's home by default",
			content: { "application/json": { schema: folderListingSchema } },
		},
		400: { description: "The path is not a readable folder", content: errorContent },
	},
});

const createFolderRoute = createRoute({
	method: "post",
	path: "/api/projects/folders",
	tags: ["projects"],
	operationId: "createFolder",
	description: "Create one folder inside an existing folder",
	request: {
		body: { required: true, content: { "application/json": { schema: newFolderInputSchema } } },
	},
	responses: {
		200: {
			description: "The new folder's real path",
			content: { "application/json": { schema: createdFolderSchema } },
		},
		400: { description: "The parent or the folder name is invalid", content: errorContent },
	},
});

export const projectsRoutes = ({ home }: Deps) =>
	new OpenAPIHono()
		.openapi(projectStatusRoute, async (c) => {
			try {
				return c.json(await readProjectStatus(home, c.req.valid("query").path), 200);
			} catch (error) {
				return failure(c, toError(error, "The folder cannot be opened"), 400);
			}
		})
		.openapi(trustProjectRoute, async (c) => {
			try {
				return c.json(await trustProjectFolder(home, c.req.valid("json").path), 200);
			} catch (error) {
				return failure(c, toError(error, "The folder cannot be trusted"), 400);
			}
		})
		.openapi(browseFoldersRoute, async (c) => {
			try {
				const { path, hidden } = c.req.valid("query");
				return c.json(await listFolders(home, path, hidden === "true"), 200);
			} catch (error) {
				return failure(c, toError(error, "The folder cannot be listed"), 400);
			}
		})
		.openapi(createFolderRoute, async (c) => {
			try {
				const { parent, name } = c.req.valid("json");
				return c.json(await createFolder(home, parent, name), 200);
			} catch (error) {
				return failure(c, toError(error, "The folder cannot be created"), 400);
			}
		});
