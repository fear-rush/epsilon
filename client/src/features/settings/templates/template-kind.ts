import type { TemplateEntry, TemplatePathInput } from "@/api/types";

/** What each pi path list is called on the page, and what adding one does. */
export const TEMPLATE_KIND = {
	prompts: {
		addTitle: "Add a prompt template path",
		pathsTitle: "Prompt template paths",
		pathsNote:
			"A folder of .md files, or one template file. pi still reads its own prompts folder.",
		entriesTitle: "Prompt templates",
		entriesNote: "Each file becomes a composer command named after it.",
		placeholder: "~/prompts",
		fileHint: "A folder, or a .md file",
	},
	themes: {
		addTitle: "Add a theme path",
		pathsTitle: "Theme paths",
		pathsNote: "A folder of .json themes, or one theme file. pi still reads its own themes folder.",
		entriesTitle: "Themes",
		entriesNote: "Epsilon draws its own theme, so a theme here is listed, not applied.",
		placeholder: "~/themes",
		fileHint: "A folder, or a .json file",
	},
} as const;

/** The scope a project selection means: the home alone, or that project's `.pi`. */
export const scopeOfProject = (project: string | undefined): TemplatePathInput["scope"] =>
	project === undefined ? "user" : "project";

/** Where pi found one entry, in a sentence, under its name. */
export const sourceLine = (entry: TemplateEntry): string => {
	const origin =
		entry.origin === "package"
			? `Package ${entry.source}`
			: entry.source === "auto"
				? "pi's own folder"
				: "A path in settings.json";
	return `${origin} · ${entry.dir}`;
};
