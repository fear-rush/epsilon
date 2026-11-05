import type { SkillView } from "#protocol/settings/skills";
import { EnabledSwitch } from "@/components/patterns/enabled-switch";

import { isOn } from "./skill-status.ts";
import type { useSkillToggle } from "./skill-status.ts";

/**
 * The loaded on/off switch, in the page's bar. Only a skill with a `-path` entry
 * to write has a live one; a package skill gets a disabled switch, and any other
 * skill has none, so no control promises what it cannot do.
 */
export function LoadedSwitch({
	skill,
	toggle,
}: {
	skill: SkillView;
	toggle: ReturnType<typeof useSkillToggle>;
}) {
	if (skill.toggle !== "settings" && skill.toggle !== "package") return null;
	return (
		<EnabledSwitch
			checked={isOn(skill)}
			disabled={skill.toggle === "package" || toggle.isPending}
			label={skill.name}
			onCheckedChange={(checked) => toggle.mutate({ filePath: skill.filePath, enabled: checked })}
		/>
	);
}
