import { createRoute } from "@hono/zod-openapi";
import type { RouteHandler } from "@hono/zod-openapi";
import { defaultModelSchema, settingsSnapshotSchema } from "shared";

import { config } from "../config";
import { writeDefaultModel } from "../settings/defaults";
import { createRuntime } from "../settings/providers";
import { readSettings } from "../settings/read";
import { errorContent } from "./failure";
import { settingsWrite } from "./write";

export const settingsRoute = createRoute({
	method: "get",
	path: "/api/settings",
	tags: ["settings"],
	operationId: "readSettings",
	description: "Providers, default model, MCP servers, skills and packages from the agent home",
	responses: {
		200: {
			description: "The configuration this deployment runs on",
			content: { "application/json": { schema: settingsSnapshotSchema } },
		},
	},
});

export const defaultModelRoute = createRoute({
	method: "put",
	path: "/api/settings/default-model",
	tags: ["settings"],
	operationId: "setDefaultModel",
	request: {
		body: { required: true, content: { "application/json": { schema: defaultModelSchema } } },
	},
	responses: {
		204: { description: "pi's settings.json now names this provider and model" },
		400: { description: "The model is not one this deployment can run", content: errorContent },
	},
});

export const settingsHandler: RouteHandler<typeof settingsRoute> = async (c) =>
	c.json(await readSettings(config.projectDir, config.agentHome), 200);

export const defaultModelHandler: RouteHandler<typeof defaultModelRoute> = async (c) => {
	const model = c.req.valid("json");
	return settingsWrite(c, async () => {
		const runtime = await createRuntime(config.agentHome);
		if (runtime.getModel(model.provider, model.modelId) === undefined) {
			throw new Error(`Model not found: ${model.provider}/${model.modelId}`);
		}
		await writeDefaultModel(config.projectDir, config.agentHome, model);
	});
};
