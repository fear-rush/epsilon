import { OpenAPIHono } from "@hono/zod-openapi";

import type { Deps } from "../../deps";
import { configWrite, failure, toError } from "../../platform/http";
import { modelRuntime } from "../../platform/pi";
import {
	deleteProviderRoute,
	importModelsRoute,
	readProviderRoute,
	testProviderRoute,
	writeProviderRoute,
} from "./contract";
import { importModelsForHome } from "./import";
import { testProviderForHome } from "./probe";
import { readProviderDetail, removeProvider, writeProvider } from "./service";

// Registration order is the order of the generated OpenAPI document.
export const providersRoutes = ({ home, engines }: Deps) =>
	new OpenAPIHono()
		.openapi(readProviderRoute, async (c) => {
			try {
				const runtime = await modelRuntime(home);
				const detail = await readProviderDetail(home, runtime, c.req.valid("param").id);
				if (detail === undefined) return failure(c, new Error("No such provider"), 404);
				return c.json(detail, 200);
			} catch (error) {
				return failure(c, toError(error, "The provider did not load"), 400);
			}
		})
		.openapi(importModelsRoute, async (c) => {
			try {
				const models = await importModelsForHome(home, c.req.valid("json"));
				return c.json({ models }, 200);
			} catch (error) {
				return failure(c, toError(error, "The models did not load"), 400);
			}
		})
		.openapi(testProviderRoute, async (c) => {
			try {
				return c.json(await testProviderForHome(home, c.req.valid("json")), 200);
			} catch (error) {
				return failure(c, toError(error, "The provider did not answer"), 400);
			}
		})
		.openapi(writeProviderRoute, (c) =>
			configWrite(c, engines, () => writeProvider(home, c.req.valid("json"))),
		)
		.openapi(deleteProviderRoute, (c) =>
			configWrite(c, engines, () => removeProvider(home, c.req.valid("param").id)),
		);
