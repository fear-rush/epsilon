import { createFileRoute } from "@tanstack/react-router";
import { Schema } from "effect";

import { skillSearchSchema } from "@/features/settings/skills/skill-search";
import { SkillsLayout } from "@/features/settings/skills/skills-panel";

export const Route = createFileRoute("/settings/skills")({
	head: () => ({ meta: [{ title: "Skills · Settings" }] }),
	validateSearch: Schema.toStandardSchemaV1(skillSearchSchema),
	component: SkillsLayout,
});
