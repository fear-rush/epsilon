import { z } from "zod";

import type { SkillView } from "@/api/types";

/**
 * Which skill a route names. An editable skill is its `root` and `name`; any
 * other is its `path`, because two skills can share a name and only the file
 * tells them apart. A new skill takes only the `root` it will be written to.
 */
export const skillSearchSchema = z.object({
	root: z.enum(["home", "user-agents", "project-pi", "project-agents"]).optional().catch(undefined),
	path: z.string().min(1).optional().catch(undefined),
	/** The open view and raw file belong to the page, so a reload keeps them. */
	tab: z.enum(["form", "raw"]).optional().catch(undefined),
	file: z.string().min(1).optional().catch(undefined),
});

/** The identity a row and the route share. */
export const skillKey = (skill: SkillView): string =>
	skill.editable && skill.root !== undefined ? `${skill.root}\0${skill.name}` : skill.filePath;

/** The `search` of the link that opens a skill. */
export const skillSearch = (skill: SkillView): z.infer<typeof skillSearchSchema> =>
	skill.editable && skill.root !== undefined ? { root: skill.root } : { path: skill.filePath };
