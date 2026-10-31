import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { z } from "zod";

import { listAllSessions } from "../../platform/pi";
import type { Deps } from "../../deps";
import {
	deleteSession,
	groupSessions,
	moveSessionToProject,
	pinSession,
	removeProject,
	renameSession,
} from "./service";
import {
	moveSessionInputSchema,
	movedSessionSchema,
	pinSessionInputSchema,
	removedProjectSchema,
	renameSessionInputSchema,
	renamedSessionSchema,
	sessionErrorSchema,
	sessionListSchema,
} from "./contract";
import { readPinned } from "./store";

const sessionErrorContent = { "application/json": { schema: sessionErrorSchema } };

const listSessionsRoute = createRoute({
	method: "get",
	path: "/api/sessions",
	tags: ["sessions"],
	operationId: "listSessions",
	responses: {
		200: {
			description: "Every session pi recorded in the home, split into chats and projects",
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
		404: { description: "No such session in the home", content: sessionErrorContent },
		409: { description: "A live agent still holds this session", content: sessionErrorContent },
	},
});

const removeProjectRoute = createRoute({
	method: "delete",
	path: "/api/projects/sessions",
	tags: ["sessions"],
	operationId: "removeProject",
	description:
		"Take a project off the list by deleting every chat recorded in it; the folder and its trust stay",
	request: { query: z.object({ path: z.string().min(1) }) },
	responses: {
		200: {
			description: "How many chats were deleted",
			content: { "application/json": { schema: removedProjectSchema } },
		},
		404: { description: "No chat is recorded in that folder", content: sessionErrorContent },
		409: { description: "A chat in the project is still working", content: sessionErrorContent },
	},
});

const moveSessionRoute = createRoute({
	method: "post",
	path: "/api/sessions/{id}/move",
	tags: ["sessions"],
	operationId: "moveSession",
	description: "Fork a session's history into a trusted project and remove the original",
	request: {
		params: z.object({ id: z.string().min(1) }),
		body: { required: true, content: { "application/json": { schema: moveSessionInputSchema } } },
	},
	responses: {
		200: {
			description: "The session in its new folder, under a new id",
			content: { "application/json": { schema: movedSessionSchema } },
		},
		400: { description: "The folder cannot hold the session", content: sessionErrorContent },
		404: { description: "No such session in the home", content: sessionErrorContent },
		409: { description: "A live agent still holds this session", content: sessionErrorContent },
	},
});

const renameSessionRoute = createRoute({
	method: "patch",
	path: "/api/sessions/{id}/name",
	tags: ["sessions"],
	operationId: "renameSession",
	description: "Set the display name of a chat",
	request: {
		params: z.object({ id: z.string().min(1) }),
		body: { required: true, content: { "application/json": { schema: renameSessionInputSchema } } },
	},
	responses: {
		200: {
			description: "The session's new name",
			content: { "application/json": { schema: renamedSessionSchema } },
		},
		404: { description: "No such session in the home", content: sessionErrorContent },
	},
});

const pinSessionRoute = createRoute({
	method: "patch",
	path: "/api/sessions/{id}/pin",
	tags: ["sessions"],
	operationId: "pinSession",
	description: "Pin or unpin a chat in the session list",
	request: {
		params: z.object({ id: z.string().min(1) }),
		body: { required: true, content: { "application/json": { schema: pinSessionInputSchema } } },
	},
	responses: {
		204: { description: "The pin file now holds this decision" },
		404: { description: "No such session in the home", content: sessionErrorContent },
	},
});

export const sessionsRoutes = ({ home, engines }: Deps) =>
	new OpenAPIHono()
		.openapi(listSessionsRoute, async (c) => {
			const pinned = await readPinned(home);
			const list = groupSessions(home, await listAllSessions(), engines.live(), pinned.ids);
			return c.json(
				pinned.problem === undefined ? list : { ...list, pinsProblem: pinned.problem },
				200,
			);
		})
		.openapi(deleteSessionRoute, async (c) => {
			const { id } = c.req.valid("param");
			const outcome = await deleteSession(home, id, (target) => engines.closeIfIdle(target));
			if (outcome.ok) return c.body(null, 204);
			const problem = { code: outcome.code, message: outcome.message };
			return outcome.code === "SESSION_RUNNING" ? c.json(problem, 409) : c.json(problem, 404);
		})
		.openapi(removeProjectRoute, async (c) => {
			const { path } = c.req.valid("query");
			const outcome = await removeProject(home, path, (target) => engines.closeIfIdle(target));
			if (outcome.ok) return c.json(outcome.value, 200);
			const problem = { code: outcome.code, message: outcome.message };
			return outcome.code === "SESSION_RUNNING" ? c.json(problem, 409) : c.json(problem, 404);
		})
		.openapi(moveSessionRoute, async (c) => {
			const { id } = c.req.valid("param");
			const outcome = await moveSessionToProject(
				home,
				id,
				c.req.valid("json").project,
				!engines.closeIfIdle(id),
			);
			if (outcome.ok) return c.json(outcome.value, 200);
			const problem = { code: outcome.code, message: outcome.message };
			if (outcome.code === "SESSION_RUNNING") return c.json(problem, 409);
			if (outcome.code === "SESSION_NOT_FOUND") return c.json(problem, 404);
			return c.json(problem, 400);
		})
		.openapi(renameSessionRoute, async (c) => {
			const { id } = c.req.valid("param");
			const { name } = c.req.valid("json");
			const live = engines.find(id);
			const outcome = await renameSession(id, name, live?.rename.bind(live));
			if (outcome.ok) return c.json(outcome.value, 200);
			return c.json({ code: outcome.code, message: outcome.message }, 404);
		})
		.openapi(pinSessionRoute, async (c) => {
			const { id } = c.req.valid("param");
			const outcome = await pinSession(home, id, c.req.valid("json").pinned);
			if (outcome.ok) return c.body(null, 204);
			return c.json({ code: outcome.code, message: outcome.message }, 404);
		});
