import type { SkillView } from "@/api/types";
import { EnabledSwitch } from "@/components/patterns/controls/enabled-switch";
import { isOn } from "./skill-status";
import type { useSkillToggle } from "./skill-status";

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
