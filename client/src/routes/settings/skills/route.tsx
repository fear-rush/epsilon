import { createFileRoute } from "@tanstack/react-router";

import { skillSearchSchema } from "@/features/settings/skills/skill-search";
import { SkillsLayout } from "@/features/settings/skills/skills-panel";

/**
 * The search params belong to the section, not to one page: the list and both
 * detail routes read the same `root` and `path`.
 */
export const Route = createFileRoute("/settings/skills")({
	validateSearch: skillSearchSchema,
	component: SkillsLayout,
	head: () => ({ meta: [{ title: "Skills · Settings" }] }),
});
