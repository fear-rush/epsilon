import { createFileRoute } from "@tanstack/react-router";

import { SkillsLayout } from "@/features/settings/skills/skills-panel";

export const Route = createFileRoute("/settings/skills")({ component: SkillsLayout });
