import { useMatchRoute } from "@tanstack/react-router";

import { MasterDetailLayout } from "@/features/settings/kit/master-detail-layout";

import { SkillsPanel } from "./skills-panel";

/** The route owns which skill is selected; the panel only draws it. */
export function SkillsLayout() {
	const matchRoute = useMatchRoute();
	const matched = matchRoute({ to: "/settings/skills/$name" });
	const selectedName = matched === false ? undefined : matched.name;
	const adding = matchRoute({ to: "/settings/skills/new" }) !== false;
	const editing = selectedName !== undefined || adding;
	return (
		<MasterDetailLayout
			editing={editing}
			list={<SkillsPanel selectedName={selectedName} editing={editing} />}
		/>
	);
}
