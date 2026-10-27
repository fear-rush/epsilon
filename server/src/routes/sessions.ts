import { createRoute } from "@hono/zod-openapi";
import type { RouteHandler } from "@hono/zod-openapi";
import { sessionErrorSchema, sessionListSchema } from "shared";
import { z } from "zod";

import { listStoredSessions } from "../agent/sessions";
import { config } from "../config";
import { registry } from "../runtime";
import { deleteSession } from "../sessions/delete";
import { joinSessions } from "../sessions/list";

const errorContent = { "application/json": { schema: sessionErrorSchema } };

export const listSessionsRoute = createRoute({
	method: "get",
	path: "/api/sessions",
	tags: ["sessions"],
	operationId: "listSessions",
	responses: {
		200: {
			description: "Sessions pi recorded for the configured project, newest first",
			content: { "application/json": { schema: sessionListSchema } },
		},
	},
});

export const deleteSessionRoute = createRoute({
	method: "delete",
	path: "/api/sessions/{id}",
	tags: ["sessions"],
	operationId: "deleteSession",
	request: { params: z.object({ id: z.string().min(1) }) },
	responses: {
		204: { description: "Session file removed" },
		404: { description: "No such session in this project", content: errorContent },
		409: { description: "A live agent still holds this session", content: errorContent },
	},
});

export const listSessionsHandler: RouteHandler<typeof listSessionsRoute> = async (c) => {
	const stored = await listStoredSessions(config.projectDir);
	return c.json(
		{ project: config.projectDir, sessions: joinSessions(stored, registry.live()) },
		200,
	);
};

export const deleteSessionHandler: RouteHandler<typeof deleteSessionRoute> = async (c) => {
	const { id } = c.req.valid("param");
	const outcome = await deleteSession(config.projectDir, id, registry.find(id) !== undefined);
	if (outcome.removed) return c.body(null, 204);
	if (outcome.code === "SESSION_RUNNING") {
		return c.json({ code: outcome.code, message: outcome.message }, 409);
	}
	return c.json({ code: outcome.code, message: outcome.message }, 404);
};
