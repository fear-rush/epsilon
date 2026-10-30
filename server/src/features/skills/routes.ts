import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { skillInputSchema, skillNameSchema } from "shared";
import { z } from "zod";

import type { Deps } from "../../deps";
import { configWrite, errorContent, failure } from "../../platform/http";
import { readSkillFile, removeSkill, writeSkill } from "./store";

const skillParams = z.object({ name: skillNameSchema });

const writeSkillRoute = createRoute({
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

const readSkillRoute = createRoute({
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

const deleteSkillRoute = createRoute({
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

// Registration order is the order of the generated OpenAPI document: read, write, delete.
export const skillsRoutes = ({ home, engines }: Deps) =>
	new OpenAPIHono()
		.openapi(readSkillRoute, async (c) => {
			const skill = await readSkillFile(home, c.req.valid("param").name);
			if (skill === undefined) return failure(c, new Error("No such skill"), 404);
			return c.json(skill, 200);
		})
		.openapi(writeSkillRoute, (c) =>
			configWrite(c, engines, () => writeSkill(home, c.req.valid("json"))),
		)
		.openapi(deleteSkillRoute, (c) =>
			configWrite(c, engines, () => removeSkill(home, c.req.valid("param").name)),
		);
