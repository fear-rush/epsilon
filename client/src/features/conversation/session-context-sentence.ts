/**
 * What `/session` says about this chat's context, in one line: how many files steer
 * it, where its prompt comes from, which skills it has, and how much of the window it
 * holds. Settings, then Context is the page for every file.
 */
import type { ContextView } from "@/api/types";

/** `1 skill`, `3 skills`: a count with the noun it counts. */
const counted = (count: number, one: string, many: string): string =>
	`${count} ${count === 1 ? one : many}`;

const promptLabel = (view: ContextView): string =>
	view.systemPrompt.source === "project"
		? "the project's prompt"
		: view.systemPrompt.source === "agent"
			? "the agent home's prompt"
			: "pi's built-in prompt";

export const contextSentence = (view: ContextView): string => {
	const files =
		view.contextFiles.length === 0
			? "no context file"
			: counted(view.contextFiles.length, "context file", "context files");
	const skills = view.skills.filter(
		(skill) => skill.status === "active" || skill.status === "manual",
	).length;
	const tools =
		view.tools === undefined
			? "no tool list until a chat is open"
			: `${view.tools.active.length} of ${view.tools.all.length} tools active`;
	const usage =
		view.contextUsage === undefined
			? undefined
			: `${view.contextUsage.percent.toFixed(0)}% of the context window`;
	const parts = [files, promptLabel(view), counted(skills, "skill", "skills"), tools];
	if (usage !== undefined) parts.push(usage);
	return `Context: ${parts.join(", ")}. Settings, then Context lists every file.`;
};
