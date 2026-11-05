import { createFileRoute } from "@tanstack/react-router";
import { Schema } from "effect";

import { SkillRoot } from "#protocol/settings/skills";
import { SkillsLayout } from "@/features/settings/skills/skills-panel";

/** The project tab, the editable root a skill is opened in, or a listed skill's path. */
const Search = Schema.Struct({
	project: Schema.optional(Schema.NonEmptyString),
	root: Schema.optional(SkillRoot),
	path: Schema.optional(Schema.NonEmptyString),
	/** The open view and raw file belong to the page, so a reload keeps them. */
	tab: Schema.optional(Schema.Literals(["form", "raw"])),
	file: Schema.optional(Schema.NonEmptyString),
});

export const Route = createFileRoute("/settings/skills")({
	head: () => ({ meta: [{ title: "Skills · Settings" }] }),
	validateSearch: Schema.toStandardSchemaV1(Search),
	component: SkillsLayout,
});
