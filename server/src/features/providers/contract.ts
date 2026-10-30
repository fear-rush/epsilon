/** The provider routes' documented surface. The handlers are in `routes.ts`. */
import { createRoute } from "@hono/zod-openapi";
import {
	providerDetailSchema,
	providerIdSchema,
	providerImportInputSchema,
	providerImportResultSchema,
	providerInputSchema,
	providerTestInputSchema,
	providerTestResultSchema,
} from "shared";
import { z } from "zod";

import { errorContent } from "../../platform/http";

const providerParams = z.object({ id: providerIdSchema });

export const readProviderRoute = createRoute({
	method: "get",
	path: "/api/settings/providers/{id}",
	tags: ["settings"],
	operationId: "readProvider",
	description: "The editable detail of one provider, with header names but no secrets",
	request: { params: providerParams },
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

export const testProviderRoute = createRoute({
	method: "post",
	path: "/api/settings/providers/test",
	tags: ["settings"],
	operationId: "testProvider",
	description: "Try a provider draft's model without writing models.json",
	request: {
		body: {
			required: true,
			content: { "application/json": { schema: providerTestInputSchema } },
		},
	},
	responses: {
		200: {
			description: "The draft reached its model",
			content: { "application/json": { schema: providerTestResultSchema } },
		},
		400: { description: "The provider refused or could not be reached", content: errorContent },
	},
});

export const deleteProviderRoute = createRoute({
	method: "delete",
	path: "/api/settings/providers/{id}",
	tags: ["settings"],
	operationId: "deleteProvider",
	request: { params: providerParams },
	responses: {
		204: {
			description: "The provider entry and its stored credential are gone from the agent home",
		},
		400: { description: "models.json could not be written", content: errorContent },
	},
});
