import { CodeIcon, FileTextIcon } from "lucide-react";

import type { ModeItem } from "@/components/patterns/tabs/mode-tabs";

export type SkillTab = "form" | "raw";

/** The two views of a skill page, in the detail page's tabs band. */
export const SKILL_MODES: readonly ModeItem<SkillTab>[] = [
	{ value: "form", label: "Form", icon: FileTextIcon },
	{ value: "raw", label: "Raw", icon: CodeIcon },
];

/** Where the phone back link of every skill page goes. */
export const SKILLS_BACK = { to: "/settings/skills", label: "Skills" } as const;
