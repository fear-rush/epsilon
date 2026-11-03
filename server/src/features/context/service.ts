/**
 * One context read: what the files decide, plus what a live engine in that folder
 * knows. The files answer with no chat open; the exact prompt, the tool set and the
 * extension load belong to an engine, so they are merged only where one is open and
 * `live` says which answer the page is showing.
 */
import type { AgentHome } from "../../platform/agent-home";
import type { LoadExtensionsResult, PromptTemplate } from "../../platform/pi";
import type { SessionRegistry } from "../conversation";
import { readSettingsProblems } from "../general";
import { listSkills } from "../skills";
import type { SkillView } from "../skills";
import type { ContextExtension, ContextProblem, ContextPrompt, ContextView } from "./contract";
import { nameOf, originOf, readFiles } from "./store";

const push = (found: Map<string, string[]>, key: string, message: string): void => {
	const messages = found.get(key);
	if (messages === undefined) found.set(key, [message]);
	else messages.push(message);
};

/**
 * The extension list after a real load: pi's errors and warnings are attached to the
 * path they name, and an extension the resolver never saw (a built-in, one an
 * extension registered) joins the list. An extension that failed to load has no
 * loaded entry, only an error, so the error paths are added as rows of their own.
 */
const withLoad = (
	resolved: ContextExtension[],
	loaded: LoadExtensionsResult | undefined,
): ContextExtension[] => {
	if (loaded === undefined) return resolved;
	const errors = new Map<string, string[]>();
	for (const error of loaded.errors) push(errors, error.path, error.error);
	const warnings = new Map<string, string[]>();
	for (const warning of loaded.warnings ?? []) push(warnings, warning.path, warning.warning);
	const rows = new Map(resolved.map((row) => [row.path, row]));
	for (const extension of loaded.extensions) {
		rows.set(extension.path, {
			path: extension.path,
			name: nameOf(extension.path),
			origin: rows.get(extension.path)?.origin ?? originOf(extension.sourceInfo),
			enabled: true,
			errors: [],
			warnings: [],
		});
	}
	for (const path of [...errors.keys(), ...warnings.keys()]) {
		if (rows.has(path)) continue;
		rows.set(path, {
			path,
			name: nameOf(path),
			// An error names a path pi never got to classify; the row says what it can.
			origin: "settings-path",
			enabled: true,
			errors: [],
			warnings: [],
		});
	}
	return [...rows.values()].map((row) => ({
		...row,
		errors: errors.get(row.path) ?? [],
		warnings: warnings.get(row.path) ?? [],
	}));
};

/** A live engine's own parse of a template, which knows paths a file read cannot label. */
const livePromptOf = (template: PromptTemplate): ContextPrompt => {
	const prompt: ContextPrompt = {
		name: template.name,
		description: template.description,
		path: template.filePath,
		origin: originOf(template.sourceInfo),
		enabled: true,
	};
	if (template.argumentHint !== undefined) prompt.argumentHint = template.argumentHint;
	return prompt;
};

/**
 * Why a skill pi listed will not do what its file says: pi refused it, another file
 * took its name, or a field it wrote is ignored. A skill the operator switched off
 * is a choice, not a problem.
 */
const skillProblems = (skills: readonly SkillView[]): ContextProblem[] =>
	skills.flatMap((skill) => {
		if (skill.status === "invalid") {
			return [
				{
					kind: "skill" as const,
					message: skill.message ?? "pi could not load this skill",
					path: skill.filePath,
				},
			];
		}
		if (skill.status === "shadowed") {
			return [
				{
					kind: "skill" as const,
					message: `pi uses ${skill.shadowedBy ?? "another file"} for this name`,
					path: skill.filePath,
				},
			];
		}
		return skill.warnings.map((message) => ({
			kind: "skill" as const,
			message,
			path: skill.filePath,
		}));
	});

/**
 * The context of one folder. `folder` is the picked project, or the chats folder for
 * the home alone (see `settingsFolder`). Two chats open in one folder each hold their
 * own prompt, so the first one answers and `liveSessionId` names it.
 */
export const readContext = async (
	folder: string,
	home: AgentHome,
	engines: SessionRegistry,
): Promise<ContextView> => {
	const project = folder === home.chatsDir ? null : folder;
	const files = await readFiles(folder, home);
	const { live } = engines.contextLive(folder);
	// Extension-discovered skills exist only while an engine for this folder is open.
	const skills = await listSkills(folder, home, project, engines.extensionSkills(folder).skills);
	const extensions = withLoad(files.extensions, live?.extensions);
	const view: ContextView = {
		folder,
		project,
		live: live !== undefined,
		contextFiles: files.contextFiles,
		systemPrompt:
			live === undefined ? files.systemPrompt : { ...files.systemPrompt, text: live.systemPrompt },
		skills,
		prompts: live === undefined ? files.prompts : live.prompts.map(livePromptOf),
		extensions,
		packages: files.packages,
		problems: [
			...files.problems,
			...readSettingsProblems(home, project).map((problem) => {
				const entry: ContextProblem = { kind: "settings", message: problem.message };
				if (problem.path !== undefined) entry.path = problem.path;
				return entry;
			}),
			...skillProblems(skills),
			...extensions.flatMap((extension): ContextProblem[] => [
				...extension.errors.map((message) => ({
					kind: "extension" as const,
					message,
					path: extension.path,
				})),
				...extension.warnings.map((message) => ({
					kind: "extension" as const,
					message,
					path: extension.path,
				})),
			]),
		],
	};
	if (live !== undefined) {
		view.liveSessionId = live.sessionId;
		view.tools = live.tools;
		if (live.contextUsage !== undefined) view.contextUsage = live.contextUsage;
	}
	return view;
};
