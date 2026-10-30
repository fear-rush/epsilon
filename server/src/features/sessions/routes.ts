import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { z } from "zod";

import { listStoredSessions } from "../../platform/pi";
import type { Deps } from "../../deps";
import { deleteSession, joinSessions } from "./catalog";
import { sessionErrorSchema, sessionListSchema } from "./contract";

const sessionErrorContent = { "application/json": { schema: sessionErrorSchema } };

const listSessionsRoute = createRoute({
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

const deleteSessionRoute = createRoute({
	method: "delete",
	path: "/api/sessions/{id}",
	tags: ["sessions"],
	operationId: "deleteSession",
	request: { params: z.object({ id: z.string().min(1) }) },
	responses: {
		204: { description: "Session file removed" },
		404: { description: "No such session in this project", content: sessionErrorContent },
		409: { description: "A live agent still holds this session", content: sessionErrorContent },
	},
});

export const sessionsRoutes = ({ projectDir, engines }: Deps) =>
	new OpenAPIHono()
		.openapi(listSessionsRoute, async (c) => {
			const stored = await listStoredSessions(projectDir);
			return c.json({ project: projectDir, sessions: joinSessions(stored, engines.live()) }, 200);
		})
		.openapi(deleteSessionRoute, async (c) => {
			const { id } = c.req.valid("param");
			const outcome = await deleteSession(projectDir, id, engines.find(id) !== undefined);
			if (outcome.removed) return c.body(null, 204);
			if (outcome.code === "SESSION_RUNNING") {
				return c.json({ code: outcome.code, message: outcome.message }, 409);
			}
			return c.json({ code: outcome.code, message: outcome.message }, 404);
		});
