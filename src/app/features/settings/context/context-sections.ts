/**
 * The sections of the Context page, written once: the list, the route and the detail
 * column all map this file, so a section cannot exist in one and be missing from the
 * other. Every line and count here is derived from pi's answer, never guessed.
 */
import {
	BookOpenIcon,
	FileTextIcon,
	PackageIcon,
	PlugIcon,
	SparklesIcon,
	TerminalIcon,
	WrenchIcon,
} from "lucide-react";
import type { ComponentType } from "react";

import type { ContextView } from "#protocol/settings/context";

export type ContextSectionId =
	| "files"
	| "prompt"
	| "skills"
	| "prompts"
	| "extensions"
	| "packages"
	| "tools";

export type ContextSection = {
	id: ContextSectionId;
	label: string;
	icon: ComponentType<{ className?: string }>;
	/** The line under the label in the list. */
	line: (view: ContextView) => string;
	/** The bar's count, or undefined for a section that is not a list of items. */
	count: (view: ContextView) => number | undefined;
};

/** `1 file`, `3 files`: the plural form a count row uses. */
export const counted = (count: number, one: string, many: string): string =>
	`${count} ${count === 1 ? one : many}`;

const activeSkills = (view: ContextView): number =>
	view.skills.filter((skill) => skill.status === "active" || skill.status === "manual").length;

const promptSource = (view: ContextView): string =>
	view.systemPrompt.source === "project"
		? "The project's SYSTEM.md"
		: view.systemPrompt.source === "agent"
			? "The agent home's SYSTEM.md"
			: "pi's built-in prompt";

export const CONTEXT_SECTIONS: ContextSection[] = [
	{
		id: "files",
		label: "Context files",
		icon: FileTextIcon,
		line: (view) =>
			view.contextFiles.length === 0
				? "No AGENTS.md or CLAUDE.md"
				: counted(view.contextFiles.length, "file", "files"),
		count: (view) => view.contextFiles.length,
	},
	{
		id: "prompt",
		label: "System prompt",
		icon: BookOpenIcon,
		line: (view) => promptSource(view),
		count: () => undefined,
	},
	{
		id: "skills",
		label: "Skills",
		icon: SparklesIcon,
		line: (view) =>
			view.skills.length === 0
				? "No skill"
				: `${activeSkills(view)} of ${view.skills.length} usable`,
		count: (view) => view.skills.length,
	},
	{
		id: "prompts",
		label: "Prompt templates",
		icon: TerminalIcon,
		line: (view) =>
			view.prompts.length === 0
				? "No template"
				: counted(view.prompts.length, "template", "templates"),
		count: (view) => view.prompts.length,
	},
	{
		id: "extensions",
		label: "Extensions",
		icon: PlugIcon,
		line: (view) =>
			view.extensions.length === 0
				? "No extension"
				: counted(view.extensions.length, "extension", "extensions"),
		count: (view) => view.extensions.length,
	},
	{
		id: "packages",
		label: "Packages",
		icon: PackageIcon,
		line: (view) =>
			view.packages.length === 0
				? "No package"
				: counted(view.packages.length, "package", "packages"),
		count: (view) => view.packages.length,
	},
	{
		id: "tools",
		label: "Tools",
		icon: WrenchIcon,
		line: (view) =>
			view.tools === undefined
				? "Needs an open chat"
				: `${view.tools.active.length} of ${view.tools.all.length} active`,
		count: (view) => view.tools?.all.length,
	},
];

export const contextSection = (id: string): ContextSection | undefined =>
	CONTEXT_SECTIONS.find((section) => section.id === id);
