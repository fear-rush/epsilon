import type { SkillInput, SkillRoot } from "#protocol/config/skills";
import { call } from "@/runtime";

const folder = (project: string | undefined) => ({ folder: project ?? null });

export const readSkill = (project: string | undefined, root: SkillRoot, name: string) =>
	call((client) => client["config.skills.read"]({ ...folder(project), name, root }));

export const saveSkill = (
	project: string | undefined,
	root: SkillRoot,
	name: string,
	input: SkillInput,
) => call((client) => client["config.skills.save"]({ ...folder(project), input, name, root }));

export const removeSkill = (project: string | undefined, root: SkillRoot, name: string) =>
	call((client) => client["config.skills.remove"]({ ...folder(project), name, root }));

export const setSkillEnabled = (project: string | undefined, filePath: string, enabled: boolean) =>
	call((client) => client["config.skills.setEnabled"]({ ...folder(project), enabled, filePath }));

export const readSkillRaw = (project: string | undefined, root: SkillRoot, name: string) =>
	call((client) => client["config.skills.readRaw"]({ ...folder(project), name, root }));

export const writeSkillRaw = (
	project: string | undefined,
	root: SkillRoot,
	name: string,
	text: string,
) => call((client) => client["config.skills.writeRaw"]({ ...folder(project), name, root, text }));

export const readSkillDocument = (project: string | undefined, filePath: string) =>
	call((client) => client["config.skills.readDocument"]({ ...folder(project), filePath }));
