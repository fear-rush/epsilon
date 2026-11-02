import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { z } from "zod";

import type { Deps } from "../../deps";
import { errorContent, failure, toError } from "../../platform/http";
import {
	folderListingSchema,
	newFolderInputSchema,
	createdFolderSchema,
	projectStatusSchema,
	projectTrustInputSchema,
} from "./contract";
import { createFolder, listFolders, readProjectStatus, setProjectTrust } from "./service";

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

const setProjectTrustRoute = createRoute({
	method: "post",
	path: "/api/projects/trust",
	tags: ["projects"],
	operationId: "setProjectTrust",
	description: "Trust a folder, revoke it, forget its record, or trust its parent",
	request: {
		body: { required: true, content: { "application/json": { schema: projectTrustInputSchema } } },
	},
	responses: {
		200: { description: "The folder, and what pi loads for it now", content: statusContent },
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
		.openapi(setProjectTrustRoute, async (c) => {
			try {
				const { path, action } = c.req.valid("json");
				return c.json(await setProjectTrust(home, path, action), 200);
			} catch (error) {
				return failure(c, toError(error, "The folder's trust was not changed"), 400);
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
