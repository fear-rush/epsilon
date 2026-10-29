import { createRoute } from "@hono/zod-openapi";
import type { RouteHandler } from "@hono/zod-openapi";
import { settingsErrorSchema, skillInputSchema } from "shared";
import { z } from "zod";

import { config } from "../config";
import { registry } from "../runtime";
import { readSkillFile, removeSkill, writeSkill } from "../settings/skills";
import { failure } from "./failure";

const errorContent = { "application/json": { schema: settingsErrorSchema } };

export const writeSkillRoute = createRoute({
	method: "post",
	path: "/api/settings/skills",
	tags: ["settings"],
	operationId: "writeSkill",
	description: "Create or replace a user skill under the agent home",
	request: {
		body: { required: true, content: { "application/json": { schema: skillInputSchema } } },
	},
	responses: {
		204: { description: "The skill's SKILL.md is written, and live engines reloaded" },
		400: { description: "The skill was refused", content: errorContent },
	},
});

export const readSkillRoute = createRoute({
	method: "get",
	path: "/api/settings/skills/{name}",
	tags: ["settings"],
	operationId: "readSkill",
	request: { params: z.object({ name: z.string().min(1) }) },
	responses: {
		200: {
			description: "The skill file, for the edit form",
			content: { "application/json": { schema: skillInputSchema } },
		},
		404: { description: "No such skill under the agent home", content: errorContent },
	},
});

export const deleteSkillRoute = createRoute({
	method: "delete",
	path: "/api/settings/skills/{name}",
	tags: ["settings"],
	operationId: "deleteSkill",
	request: { params: z.object({ name: z.string().min(1) }) },
	responses: {
		204: { description: "The skill directory is gone" },
		400: { description: "The skill could not be removed", content: errorContent },
	},
});

export const writeSkillHandler: RouteHandler<typeof writeSkillRoute> = async (c) => {
	try {
		await writeSkill(config.agentHome, c.req.valid("json"));
		registry.reloadAll();
		return c.body(null, 204);
	} catch (error) {
		return failure(c, error instanceof Error ? error : new Error("The settings change failed"));
	}
};

export const readSkillHandler: RouteHandler<typeof readSkillRoute> = async (c) => {
	const skill = await readSkillFile(config.agentHome, c.req.valid("param").name);
	if (skill === undefined) return c.json({ message: "No such skill" }, 404);
	return c.json(skill, 200);
};

export const deleteSkillHandler: RouteHandler<typeof deleteSkillRoute> = async (c) => {
	try {
		await removeSkill(config.agentHome, c.req.valid("param").name);
		registry.reloadAll();
		return c.body(null, 204);
	} catch (error) {
		return failure(c, error instanceof Error ? error : new Error("The settings change failed"));
	}
};
