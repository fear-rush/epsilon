import { createRoute } from "@hono/zod-openapi";
import type { RouteHandler } from "@hono/zod-openapi";
import { skillInputSchema, skillNameSchema } from "shared";
import { z } from "zod";

import { config } from "../config";
import { readSkillFile, removeSkill, writeSkill } from "../settings/skills";
import { errorContent, failure } from "./failure";
import { settingsWrite } from "./write";

const skillParams = z.object({ name: skillNameSchema });

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
	request: { params: skillParams },
	responses: {
		200: {
			description: "The skill file, for the edit form",
			content: { "application/json": { schema: skillInputSchema } },
		},
		400: { description: "The name is not a skill directory", content: errorContent },
		404: { description: "No such skill under the agent home", content: errorContent },
	},
});

export const deleteSkillRoute = createRoute({
	method: "delete",
	path: "/api/settings/skills/{name}",
	tags: ["settings"],
	operationId: "deleteSkill",
	request: { params: skillParams },
	responses: {
		204: { description: "The skill directory is gone" },
		400: { description: "The skill could not be removed", content: errorContent },
	},
});

export const writeSkillHandler: RouteHandler<typeof writeSkillRoute> = async (c) =>
	settingsWrite(c, () => writeSkill(config.agentHome, c.req.valid("json")));

export const readSkillHandler: RouteHandler<typeof readSkillRoute> = async (c) => {
	const skill = await readSkillFile(config.agentHome, c.req.valid("param").name);
	if (skill === undefined) return failure(c, new Error("No such skill"), 404);
	return c.json(skill, 200);
};

export const deleteSkillHandler: RouteHandler<typeof deleteSkillRoute> = async (c) =>
	settingsWrite(c, () => removeSkill(config.agentHome, c.req.valid("param").name));
