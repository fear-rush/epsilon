import { CodeIcon, FileTextIcon } from "lucide-react";

import type { ModeItem } from "@/components/patterns/mode-tabs";

export type SkillTab = "form" | "raw";

/** The two ways to write one `SKILL.md`. */
export const SKILL_MODES: ReadonlyArray<ModeItem<SkillTab>> = [
	{ value: "form", label: "Form", icon: FileTextIcon },
	{ value: "raw", label: "Raw", icon: CodeIcon },
];

/** Where a skill detail page returns to. */
export const SKILLS_BACK = { to: "/settings/skills", label: "Skills" } as const;
