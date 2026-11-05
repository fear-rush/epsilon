import { useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";

import type { SkillView } from "#protocol/settings/skills";

import { useSettings } from "../queries.ts";
import { skillSearch } from "./skill-search.ts";

/**
 * The other skills a body can name. A name that is in the inventory is a link in
 * the preview; opening it goes to that skill's page. A shadowed skill yields to
 * the one that won the name.
 */
export function useSkillLinks() {
	const navigate = useNavigate();
	const settings = useSettings();
	const byName = useMemo(() => {
		const found = new Map<string, SkillView>();
		for (const skill of settings.data?.skills.skills ?? []) {
			const kept = found.get(skill.name);
			if (kept === undefined || (kept.status === "shadowed" && skill.status !== "shadowed")) {
				found.set(skill.name, skill);
			}
		}
		return found;
	}, [settings.data]);
	return {
		exists: (name: string) => byName.has(name),
		open: (name: string) => {
			const skill = byName.get(name);
			if (skill === undefined) return;
			void navigate({
				to: "/settings/skills/$name",
				params: { name },
				search: (previous) => ({
					...previous,
					root: undefined,
					path: undefined,
					...skillSearch(skill, previous),
				}),
			});
		},
	};
}
