import type { SkillInput, SkillRoot } from "#protocol/settings/skills";
import { call } from "@/core/runtime";

const folder = (project: string | undefined) => ({ folder: project ?? null });

export const readSkill = (project: string | undefined, root: SkillRoot, name: string) =>
	call((client) => client["settings.skills.read"]({ ...folder(project), name, root }));

export const saveSkill = (
	project: string | undefined,
	root: SkillRoot,
	name: string,
	input: SkillInput,
) => call((client) => client["settings.skills.save"]({ ...folder(project), input, name, root }));

export const removeSkill = (project: string | undefined, root: SkillRoot, name: string) =>
	call((client) => client["settings.skills.remove"]({ ...folder(project), name, root }));

export const setSkillEnabled = (project: string | undefined, filePath: string, enabled: boolean) =>
	call((client) => client["settings.skills.setEnabled"]({ ...folder(project), enabled, filePath }));

export const readSkillRaw = (project: string | undefined, root: SkillRoot, name: string) =>
	call((client) => client["settings.skills.readRaw"]({ ...folder(project), name, root }));

export const writeSkillRaw = (
	project: string | undefined,
	root: SkillRoot,
	name: string,
	text: string,
) => call((client) => client["settings.skills.writeRaw"]({ ...folder(project), name, root, text }));

export const readSkillDocument = (project: string | undefined, filePath: string) =>
	call((client) => client["settings.skills.readDocument"]({ ...folder(project), filePath }));

/** Add another agent's skill folder to the scope's `skills` setting, or take it out. */
export const setSkillFolderLinked = (project: string | undefined, path: string, linked: boolean) =>
	call((client) => client["settings.skills.setFolderLinked"]({ ...folder(project), linked, path }));
