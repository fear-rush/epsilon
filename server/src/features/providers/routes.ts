import { OpenAPIHono } from "@hono/zod-openapi";

import type { Deps } from "../../deps";
import { configWrite, failure, toError } from "../../platform/http";
import { modelRuntime } from "../../platform/pi";
import {
	answerProviderLoginRoute,
	cancelProviderLoginRoute,
	deleteProviderRoute,
	importModelsRoute,
	logoutProviderRoute,
	readProviderLoginRoute,
	readProviderRoute,
	startProviderLoginRoute,
	testProviderRoute,
	writeProviderRoute,
} from "./contract";
import { importModelsForHome } from "./import";
import {
	answerProviderLogin,
	cancelProviderLogin,
	forgetProviderLogin,
	readProviderLogin,
	startProviderLogin,
} from "./login";
import { testProviderForHome } from "./probe";
import { logoutProvider, readProviderDetail, removeProvider, writeProvider } from "./service";

// Registration order is the order of the generated OpenAPI document.
export const providersRoutes = ({ home, projectDir, engines }: Deps) =>
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
		.openapi(startProviderLoginRoute, async (c) => {
			try {
				const login = await startProviderLogin(
					home,
					projectDir,
					c.req.valid("param").id,
					c.req.valid("json").type,
					// A new credential changes what a model request can reach, so the live
					// engines re-read it instead of waiting for the next session.
					() => engines.reloadAll(),
				);
				return c.json(login, 200);
			} catch (error) {
				return failure(c, toError(error, "The sign-in did not start"), 400);
			}
		})
		.openapi(readProviderLoginRoute, (c) => {
			const login = readProviderLogin(home, c.req.valid("param").id);
			if (login === undefined) return failure(c, new Error("No sign-in is running"), 404);
			return c.json(login, 200);
		})
		.openapi(answerProviderLoginRoute, (c) => {
			const { promptId, value } = c.req.valid("json");
			const login = answerProviderLogin(home, c.req.valid("param").id, promptId, value);
			if (login === undefined) return failure(c, new Error("No sign-in is running"), 404);
			return c.json(login, 200);
		})
		.openapi(cancelProviderLoginRoute, async (c) => {
			const login = await cancelProviderLogin(home, c.req.valid("param").id);
			if (login === undefined) return failure(c, new Error("No sign-in is running"), 404);
			return c.json(login, 200);
		})
		.openapi(logoutProviderRoute, (c) =>
			configWrite(c, engines, async () => {
				const providerId = c.req.valid("param").id;
				await logoutProvider(home, providerId);
				// Signing out ends the recorded flow: its "succeeded" would contradict the
				// credential list right after it.
				forgetProviderLogin(home, providerId);
			}),
		)
		.openapi(writeProviderRoute, (c) =>
			configWrite(c, engines, () => writeProvider(home, c.req.valid("json"))),
		)
		.openapi(deleteProviderRoute, (c) =>
			configWrite(c, engines, () => removeProvider(home, c.req.valid("param").id)),
		);
