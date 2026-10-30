/**
 * The Hono app. The OpenAPI document is generated from the `createRoute`
 * definitions below, never written by hand. Agent control does not travel here;
 * it travels over the socket described in docs/protocol.md.
 */
import { OpenAPIHono } from "@hono/zod-openapi";
import { Scalar } from "@scalar/hono-api-reference";

import { healthBody, healthRoute } from "./routes/health";
import { readinessHandler, readinessRoute } from "./routes/readiness";
import {
	deleteMcpHandler,
	deleteMcpRoute,
	writeMcpHandler,
	writeMcpRoute,
} from "./routes/settings-mcp";
import {
	installPackageHandler,
	installPackageRoute,
	removePackageHandler,
	removePackageRoute,
} from "./routes/settings-packages";
import {
	defaultModelHandler,
	defaultModelRoute,
	settingsHandler,
	settingsRoute,
} from "./routes/settings";
import {
	deleteProviderHandler,
	deleteProviderRoute,
	importModelsHandler,
	importModelsRoute,
	readProviderHandler,
	readProviderRoute,
	testProviderHandler,
	testProviderRoute,
	writeProviderHandler,
	writeProviderRoute,
} from "./routes/settings-providers";
import {
	deleteSkillHandler,
	deleteSkillRoute,
	readSkillHandler,
	readSkillRoute,
	writeSkillHandler,
	writeSkillRoute,
} from "./routes/settings-skills";
import {
	deleteSessionHandler,
	deleteSessionRoute,
	listSessionsHandler,
	listSessionsRoute,
} from "./routes/sessions";

/**
 * A refused request is the one sentence the panel shows, in the same shape every
 * route documents. Without this the validator answers with its own envelope, and
 * the browser has to guess which of two refusal shapes it received.
 */
const app = new OpenAPIHono({
	defaultHook: (result, c) => {
		if (result.success) return undefined;
		const message = result.error.issues
			.map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`)
			.join("; ");
		return c.json({ message }, 400);
	},
});

app.openapi(healthRoute, (c) => c.json(healthBody));
app.openapi(readinessRoute, readinessHandler);
app.openapi(listSessionsRoute, listSessionsHandler);
app.openapi(deleteSessionRoute, deleteSessionHandler);
app.openapi(settingsRoute, settingsHandler);
app.openapi(defaultModelRoute, defaultModelHandler);
app.openapi(readProviderRoute, readProviderHandler);
app.openapi(importModelsRoute, importModelsHandler);
app.openapi(testProviderRoute, testProviderHandler);
app.openapi(writeProviderRoute, writeProviderHandler);
app.openapi(deleteProviderRoute, deleteProviderHandler);
app.openapi(writeMcpRoute, writeMcpHandler);
app.openapi(deleteMcpRoute, deleteMcpHandler);
app.openapi(readSkillRoute, readSkillHandler);
app.openapi(writeSkillRoute, writeSkillHandler);
app.openapi(deleteSkillRoute, deleteSkillHandler);
app.openapi(installPackageRoute, installPackageHandler);
app.openapi(removePackageRoute, removePackageHandler);

app.get("/openapi.json", (c) =>
	c.json(
		app.getOpenAPI31Document({
			openapi: "3.1.0",
			info: {
				title: "epsilon API",
				version: "0.0.1",
				description: "Local REST surface for sessions and for configuring this deployment.",
			},
		}),
	),
);

app.get("/scalar", Scalar({ url: "/openapi.json", pageTitle: "API reference" }));

export default app;
