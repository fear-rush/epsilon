import { OpenAPIHono, createRoute } from "@hono/zod-openapi";

import type { Deps } from "../../deps";
import { configWrite, errorContent } from "../../platform/http";
import { modelRuntime } from "../../platform/pi";
import { defaultModelSchema } from "./contract";
import { writeDefaultModel } from "./store";

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

export const generalRoutes = ({ home, engines }: Deps) =>
	new OpenAPIHono().openapi(defaultModelRoute, (c) => {
		const model = c.req.valid("json");
		return configWrite(c, engines, async () => {
			const runtime = await modelRuntime(home);
			if (runtime.getModel(model.provider, model.modelId) === undefined) {
				throw new Error(`Model not found: ${model.provider}/${model.modelId}`);
			}
			await writeDefaultModel(home, model);
		});
	});
