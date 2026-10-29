import { createRoute } from "@hono/zod-openapi";
import type { RouteHandler } from "@hono/zod-openapi";
import { defaultModelSchema, settingsErrorSchema, settingsSnapshotSchema } from "shared";

import { config } from "../config";
import { registry } from "../runtime";
import { writeDefaultModel } from "../settings/defaults";
import { createRuntime } from "../settings/providers";
import { readSettings } from "../settings/read";
import { failure } from "./failure";

const errorContent = { "application/json": { schema: settingsErrorSchema } };

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
	try {
		const runtime = await createRuntime(config.agentHome);
		if (runtime.getModel(model.provider, model.modelId) === undefined) {
			return failure(c, new Error(`Model not found: ${model.provider}/${model.modelId}`));
		}
		await writeDefaultModel(config.projectDir, config.agentHome, model);
		registry.reloadAll();
		return c.body(null, 204);
	} catch (error) {
		return failure(c, error instanceof Error ? error : new Error("The settings change failed"));
	}
};
