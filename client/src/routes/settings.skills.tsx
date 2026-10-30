import { createFileRoute } from "@tanstack/react-router";

import { SkillsLayout } from "@/features/settings/skills/skills-layout";

export const Route = createFileRoute("/settings/skills")({ component: SkillsLayout });
