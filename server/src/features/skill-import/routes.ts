import { OpenAPIHono, createRoute } from "@hono/zod-openapi";

import type { Deps } from "../../deps";
import { configWrite, errorContent, failure, toError } from "../../platform/http";
import { settingsScopeQuerySchema } from "../projects";
import {
	commitBodySchema,
	importReportSchema,
	sourceBodySchema,
	stageParamsSchema,
	uploadBodySchema,
} from "./contract";
import {
	StageGoneError,
	commitImport,
	discard,
	livePorts,
	requireStage,
	stageSource,
	stageUpload,
} from "./service";
import type { ImportContext, ImportPorts } from "./service";

const uploadRoute = createRoute({
	method: "post",
	path: "/api/settings/skills/import/upload",
	tags: ["settings"],
	operationId: "stageSkillUpload",
	description: "Stage the files of a picked folder, or one archive, and report the skills in it",
	request: {
		query: settingsScopeQuerySchema,
		body: { required: true, content: { "multipart/form-data": { schema: uploadBodySchema } } },
	},
	responses: {
		200: {
			description: "The staged skills and what is wrong with each",
			content: { "application/json": { schema: importReportSchema } },
		},
		400: { description: "The upload was refused", content: errorContent },
	},
});

const sourceRoute = createRoute({
	method: "post",
	path: "/api/settings/skills/import/source",
	tags: ["settings"],
	operationId: "stageSkillSource",
	description:
		"Fetch a pasted install command or repository address into staging and report its skills",
	request: {
		query: settingsScopeQuerySchema,
		body: { required: true, content: { "application/json": { schema: sourceBodySchema } } },
	},
	responses: {
		200: {
			description: "The staged skills and what is wrong with each",
			content: { "application/json": { schema: importReportSchema } },
		},
		400: { description: "The source was refused or could not be fetched", content: errorContent },
	},
});

const commitRoute = createRoute({
	method: "post",
	path: "/api/settings/skills/import/{stageId}/commit",
	tags: ["settings"],
	operationId: "commitSkillImport",
	description: "Install the chosen skills of a staged import, and reload live engines",
	request: {
		params: stageParamsSchema,
		query: settingsScopeQuerySchema,
		body: { required: true, content: { "application/json": { schema: commitBodySchema } } },
	},
	responses: {
		204: { description: "The skills are installed and the stage is deleted" },
		400: { description: "The import was refused", content: errorContent },
		404: { description: "The staged import has expired", content: errorContent },
	},
});

const discardRoute = createRoute({
	method: "delete",
	path: "/api/settings/skills/import/{stageId}",
	tags: ["settings"],
	operationId: "discardSkillImport",
	request: { params: stageParamsSchema },
	responses: {
		204: { description: "The staged import is deleted" },
		400: { description: "The stage could not be deleted", content: errorContent },
	},
});

/** `ports` is the network: the real one in the server, a stub in a test. */
export const skillImportRoutes = (
	{
		home,
		userHome,
		engines,
	}: Pick<Deps, "home" | "userHome"> & {
		engines: { reloadAll(): void };
	},
	ports: ImportPorts = livePorts,
) => {
	/** The place an import writes to: the home, plus the project when one is picked. */
	const contextFor = (project: string | undefined): ImportContext => ({ home, userHome, project });

	return new OpenAPIHono()
		.openapi(uploadRoute, async (c) => {
			try {
				const context = contextFor(c.req.valid("query").project);
				const form = await c.req.formData();
				const files = await Promise.all(
					form
						.getAll("files")
						.filter((part) => part instanceof File)
						.map(async (file) => ({
							name: file.name,
							bytes: new Uint8Array(await file.arrayBuffer()),
						})),
				);
				return c.json(await stageUpload(context, files), 200);
			} catch (error) {
				return failure(c, toError(error, "The upload could not be read"), 400);
			}
		})
		.openapi(sourceRoute, async (c) => {
			try {
				const context = contextFor(c.req.valid("query").project);
				return c.json(await stageSource(context, c.req.valid("json").input, ports), 200);
			} catch (error) {
				return failure(c, toError(error, "The source could not be fetched"), 400);
			}
		})
		.openapi(commitRoute, async (c) => {
			const { stageId } = c.req.valid("param");
			try {
				const context = contextFor(c.req.valid("query").project);
				const body = c.req.valid("json");
				await requireStage(context, stageId);
				return await configWrite(c, engines, () => commitImport(context, stageId, body));
			} catch (error) {
				return error instanceof StageGoneError
					? failure(c, error, 404)
					: failure(c, toError(error, "The import failed"), 400);
			}
		})
		.openapi(discardRoute, async (c) => {
			try {
				await discard(contextFor(undefined), c.req.valid("param").stageId);
				return c.body(null, 204);
			} catch (error) {
				return failure(c, toError(error, "The import could not be discarded"), 400);
			}
		});
};
