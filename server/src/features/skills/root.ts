/** The directory behind each skills root, and the trust check project roots need. */
import { projectAgentsSkillsDir, projectSkillsDir } from "../../platform/agent-home";
import type { AgentHome } from "../../platform/agent-home";
import { requireProject, trustedProjectFolder } from "../projects";
import type { SkillRoot } from "./contract";

/**
 * The directory a root names. A project root needs a trusted project, so an
 * untrusted or missing one is refused before anything touches its folder.
 */
export const skillRootDir = async (
	home: AgentHome,
	project: string | undefined,
	root: SkillRoot,
): Promise<string> => {
	if (root === "home") return home.skillsDir;
	if (root === "user-agents") {
		if (home.userAgentsSkillsDir === undefined) throw new Error("~/.agents/skills is not known");
		return home.userAgentsSkillsDir;
	}
	const folder = await trustedProjectFolder(home, requireProject(project, "its skills"));
	return root === "project-pi" ? projectSkillsDir(folder) : projectAgentsSkillsDir(folder);
};
