import { useMutation } from "@tanstack/react-query";

import { setSkillEnabled } from "@/api/endpoints";
import type { SkillView } from "@/api/types";
import { useSettingsProject, useSettingsRefresh } from "@/features/settings/queries";

/** Why Epsilon shows a skill without an editor, in one clause. */
export const readOnlyReason = (skill: SkillView): string => {
	switch (skill.origin) {
		case "package":
			return "installed by a package";
		case "user-agents":
			return "lives in ~/.agents/skills";
		case "settings-path":
			return "read from a settings.json path";
		case "extension":
			return "registered by an extension";
		case "home":
		case "project-pi":
		case "project-agents":
			return skill.dir.slice(0, skill.dir.lastIndexOf("/")).endsWith("/skills")
				? "lives in a folder above the project"
				: "nested in another skill";
		default:
			return skill.origin satisfies never;
	}
};

/** A skill is on unless settings.json turns its path off. */
export const isOn = (skill: SkillView): boolean => skill.status !== "disabled";

/** Turns a skill on or off through pi's `skills` setting, then reads the snapshot again. */
export function useSkillToggle() {
	const project = useSettingsProject();
	const refresh = useSettingsRefresh();
	return useMutation({
		mutationFn: (input: { filePath: string; enabled: boolean }) =>
			setSkillEnabled(project, input.filePath, input.enabled),
		onSuccess: () => refresh(),
	});
}
