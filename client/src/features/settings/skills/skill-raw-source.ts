import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
	fetchListedSkillFile,
	fetchListedSkillFiles,
	fetchSkillBundleFile,
	fetchSkillFiles,
	fetchSkillRaw,
	saveSkillBundleFile,
	saveSkillRaw,
} from "@/api/endpoints";
import { settingsKeys } from "@/api/keys";
import type { SkillRoot } from "@/api/types";
import { useSettingsProject } from "@/features/settings/queries";

/**
 * Which skill folder the Raw view reads: an editable skill by its root and name,
 * which can be saved, or a skill the inventory lists by its file path, which is
 * read only.
 */
export type RawSource =
	| { kind: "editable"; root: SkillRoot; name: string }
	| { kind: "listed"; filePath: string };

/** Every file in the skill folder, `SKILL.md` included. */
export const useRawFiles = (source: RawSource) => {
	const project = useSettingsProject();
	return useQuery({
		queryKey:
			source.kind === "editable"
				? settingsKeys.skillFiles(project, source.root, source.name)
				: settingsKeys.skillListedFiles(project, source.filePath),
		queryFn: () =>
			source.kind === "editable"
				? fetchSkillFiles(project, source.root, source.name)
				: fetchListedSkillFiles(project, source.filePath),
	});
};

const fileKey = (project: string | undefined, source: RawSource, path: string) =>
	source.kind === "editable"
		? settingsKeys.skillFile(project, source.root, source.name, path)
		: settingsKeys.skillListedFile(project, source.filePath, path);

/** The exact text of one file. The view keeps its own draft, so a refetch never replaces typing. */
export const useRawFile = (source: RawSource, path: string | undefined) => {
	const project = useSettingsProject();
	return useQuery({
		queryKey: fileKey(project, source, path ?? ""),
		queryFn:
			path === undefined
				? skipToken
				: () => {
						if (source.kind === "listed")
							return fetchListedSkillFile(project, source.filePath, path);
						return path === "SKILL.md"
							? fetchSkillRaw(project, source.root, source.name)
							: fetchSkillBundleFile(project, source.root, source.name, path);
					},
		gcTime: 0,
		refetchOnWindowFocus: false,
	});
};

/** Writes one file of an editable skill; `SKILL.md` goes through the checked raw route. */
export const useRawSave = (source: Extract<RawSource, { kind: "editable" }>, path: string) => {
	const project = useSettingsProject();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (text: string) =>
			path === "SKILL.md"
				? saveSkillRaw(project, source.root, source.name, text)
				: saveSkillBundleFile(project, source.root, source.name, path, text),
		onSuccess: () => {
			void queryClient.invalidateQueries({
				queryKey: settingsKeys.skillFiles(project, source.root, source.name),
			});
		},
	});
};
