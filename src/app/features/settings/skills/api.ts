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

/** Every file and folder of a skill Epsilon does not edit. */
export const readSkillDocumentFiles = (
	project: string | undefined,
	filePath: string,
	signal?: AbortSignal,
) =>
	call((client) => client["settings.skills.listDocumentFiles"]({ ...folder(project), filePath }), {
		signal,
	});

/** One file of such a skill, `SKILL.md` included. */
export const readSkillDocumentFile = (
	project: string | undefined,
	filePath: string,
	path: string,
	signal?: AbortSignal,
) =>
	call(
		(client) => client["settings.skills.readDocumentFile"]({ ...folder(project), filePath, path }),
		{ signal },
	).then((answer) => answer.text);

/** Add another agent's skill folder to the scope's `skills` setting, or take it out. */
export const setSkillFolderLinked = (project: string | undefined, path: string, linked: boolean) =>
	call((client) => client["settings.skills.setFolderLinked"]({ ...folder(project), linked, path }));

/** Add a folder, or one `.md` file, to the scope's `skills` setting. */
export const addSkillPath = (project: string | undefined, path: string) =>
	call((client) => client["settings.skills.addPath"]({ ...folder(project), path }));

/** Remove every entry naming that path from the scope's `skills` setting. */
export const removeSkillPath = (project: string | undefined, path: string) =>
	call((client) => client["settings.skills.removePath"]({ ...folder(project), path }));

/** Every file and folder in one editable skill. */
export const readSkillFiles = (
	project: string | undefined,
	root: SkillRoot,
	name: string,
	signal?: AbortSignal,
) =>
	call((client) => client["settings.skills.listFiles"]({ ...folder(project), name, root }), {
		signal,
	});

/** One bundled file's text; `SKILL.md` has its own raw read. */
export const readSkillFile = (
	project: string | undefined,
	root: SkillRoot,
	name: string,
	path: string,
	signal?: AbortSignal,
) =>
	call((client) => client["settings.skills.readFile"]({ ...folder(project), name, path, root }), {
		signal,
	}).then((answer) => answer.text);

export const writeSkillFile = (
	project: string | undefined,
	root: SkillRoot,
	name: string,
	path: string,
	text: string,
) =>
	call((client) =>
		client["settings.skills.writeFile"]({ ...folder(project), name, path, root, text }),
	);

export const createSkillFolder = (
	project: string | undefined,
	root: SkillRoot,
	name: string,
	path: string,
) =>
	call((client) =>
		client["settings.skills.createFolder"]({ ...folder(project), name, path, root }),
	);

export const removeSkillFile = (
	project: string | undefined,
	root: SkillRoot,
	name: string,
	path: string,
) =>
	call((client) => client["settings.skills.deleteFile"]({ ...folder(project), name, path, root }));

export const removeSkillFolder = (
	project: string | undefined,
	root: SkillRoot,
	name: string,
	path: string,
) =>
	call((client) =>
		client["settings.skills.deleteFolder"]({ ...folder(project), name, path, root }),
	);
