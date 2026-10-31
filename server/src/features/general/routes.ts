import { OpenAPIHono, createRoute } from "@hono/zod-openapi";

import type { Deps } from "../../deps";
import { configWrite, errorContent } from "../../platform/http";
import { modelRuntime } from "../../platform/pi";
import { agentLimitsSchema, defaultModelSchema } from "./contract";
import { writeAgentLimits, writeDefaultModel } from "./store";

const defaultModelRoute = createRoute({
	method: "put",
	path: "/api/settings/default-model",
	tags: ["settings"],
	operationId: "setDefaultModel",
	request: {
		body: { required: true, content: { "application/json": { schema: defaultModelSchema } } },
	},
	responses: {
		204: { description: "pi's settings.json now names this provider and model" },
		400: { description: "The model is not one Epsilon can run", content: errorContent },
	},
});

const agentLimitsRoute = createRoute({
	method: "put",
	path: "/api/settings/agent-limits",
	tags: ["settings"],
	operationId: "setAgentLimits",
	description:
		"Write the agent-wide compaction and retry limits and the model scope; a project can still override them",
	request: {
		body: { required: true, content: { "application/json": { schema: agentLimitsSchema } } },
	},
	responses: {
		204: { description: "pi's settings.json now holds these limits" },
		400: {
			description: "settings.json could not be parsed, so nothing was written",
			content: errorContent,
		},
	},
});

export const generalRoutes = ({ home, engines }: Deps) =>
	new OpenAPIHono()
		.openapi(agentLimitsRoute, (c) => {
			const limits = c.req.valid("json");
			return configWrite(c, engines, async () => {
				await writeAgentLimits(home, limits);
			});
		})
		.openapi(defaultModelRoute, (c) => {
			const model = c.req.valid("json");
			return configWrite(c, engines, async () => {
				const runtime = await modelRuntime(home);
				if (runtime.getModel(model.provider, model.modelId) === undefined) {
					throw new Error(`Model not found: ${model.provider}/${model.modelId}`);
				}
				await writeDefaultModel(home, model);
			});
		});
