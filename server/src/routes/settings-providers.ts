import { createRoute } from "@hono/zod-openapi";
import type { RouteHandler } from "@hono/zod-openapi";
import {
	providerDetailSchema,
	providerImportInputSchema,
	providerImportResultSchema,
	providerInputSchema,
	settingsErrorSchema,
} from "shared";
import { z } from "zod";

import { config } from "../config";
import { registry } from "../runtime";
import { importModels } from "../settings/import-models";
import {
	createRuntime,
	readProviderDetail,
	removeProvider,
	writeProvider,
} from "../settings/providers";
import { failure } from "./failure";

const errorContent = { "application/json": { schema: settingsErrorSchema } };

export const readProviderRoute = createRoute({
	method: "get",
	path: "/api/settings/providers/{id}",
	tags: ["settings"],
	operationId: "readProvider",
	description: "The editable detail of one provider, with header names but no secrets",
	request: { params: z.object({ id: z.string().min(1) }) },
	responses: {
		200: {
			description: "Provider fields, declared models, overrides and the live catalog",
			content: { "application/json": { schema: providerDetailSchema } },
		},
		400: { description: "The provider could not be read", content: errorContent },
		404: { description: "No provider or models.json entry with this id", content: errorContent },
	},
});

export const writeProviderRoute = createRoute({
	method: "post",
	path: "/api/settings/providers",
	tags: ["settings"],
	operationId: "writeProvider",
	description: "Add or change a provider entry in models.json",
	request: {
		body: { required: true, content: { "application/json": { schema: providerInputSchema } } },
	},
	responses: {
		204: { description: "models.json now carries the provider, and live engines reloaded" },
		400: { description: "The provider entry was refused", content: errorContent },
	},
});

export const importModelsRoute = createRoute({
	method: "post",
	path: "/api/settings/providers/models",
	tags: ["settings"],
	operationId: "importProviderModels",
	description: "Read a provider's model list; OpenAI-style and Anthropic endpoints only",
	request: {
		body: {
			required: true,
			content: { "application/json": { schema: providerImportInputSchema } },
		},
	},
	responses: {
		200: {
			description: "Model ids returned by the provider",
			content: { "application/json": { schema: providerImportResultSchema } },
		},
		400: { description: "The endpoint refused or returned no model list", content: errorContent },
	},
});

export const deleteProviderRoute = createRoute({
	method: "delete",
	path: "/api/settings/providers/{id}",
	tags: ["settings"],
	operationId: "deleteProvider",
	request: { params: z.object({ id: z.string().min(1) }) },
	responses: {
		204: {
			description: "The provider entry and its stored credential are gone from the agent home",
		},
		400: { description: "models.json could not be written", content: errorContent },
	},
});

export const readProviderHandler: RouteHandler<typeof readProviderRoute> = async (c) => {
	try {
		const runtime = await createRuntime(config.agentHome);
		const detail = await readProviderDetail(config.agentHome, runtime, c.req.valid("param").id);
		if (detail === undefined) return c.json({ message: "No such provider" }, 404);
		return c.json(detail, 200);
	} catch (error) {
		return c.json(
			{ message: error instanceof Error ? error.message : "The provider did not load" },
			400,
		);
	}
};

export const importModelsHandler: RouteHandler<typeof importModelsRoute> = async (c) => {
	const input = c.req.valid("json");
	try {
		const runtime = await createRuntime(config.agentHome);
		const typedKey = input.apiKey?.trim();
		const stored =
			typedKey === undefined && input.providerId !== undefined
				? await runtime.getAuth(input.providerId)
				: undefined;
		const entries: [string, string][] = [];
		for (const [key, value] of Object.entries(stored?.auth.headers ?? {})) {
			if (value !== null) entries.push([key, value]);
		}
		const headers = Object.fromEntries(entries);
		const models = await importModels({
			api: input.api,
			baseUrl: input.baseUrl,
			apiKey: typedKey ?? stored?.auth.apiKey,
			headers,
		});
		return c.json({ models }, 200);
	} catch (error) {
		return c.json(
			{ message: error instanceof Error ? error.message : "The models did not load" },
			400,
		);
	}
};

export const writeProviderHandler: RouteHandler<typeof writeProviderRoute> = async (c) => {
	try {
		await writeProvider(config.agentHome, c.req.valid("json"));
		registry.reloadAll();
		return c.body(null, 204);
	} catch (error) {
		return failure(c, error instanceof Error ? error : new Error("The settings change failed"));
	}
};

export const deleteProviderHandler: RouteHandler<typeof deleteProviderRoute> = async (c) => {
	try {
		await removeProvider(config.agentHome, c.req.valid("param").id);
		registry.reloadAll();
		return c.body(null, 204);
	} catch (error) {
		return failure(c, error instanceof Error ? error : new Error("The settings change failed"));
	}
};
