import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { SkillRoot } from "#protocol/settings/skills";

import { settingsKeys } from "../keys.ts";
import { useSettingsProject } from "../queries.ts";
import {
	readSkillDocumentFile,
	readSkillDocumentFiles,
	readSkillFile,
	readSkillFiles,
	readSkillRaw,
	writeSkillFile,
	writeSkillRaw,
} from "./api.ts";

/**
 * Which skill folder the Raw view reads: an editable skill by its root and name, which
 * can be saved, or a skill the inventory lists by its file path, which is read only.
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
				: settingsKeys.skillDocumentFiles(project, source.filePath),
		queryFn: ({ signal }) =>
			source.kind === "editable"
				? readSkillFiles(project, source.root, source.name, signal)
				: readSkillDocumentFiles(project, source.filePath, signal),
	});
};

const fileKey = (project: string | undefined, source: RawSource, path: string) =>
	source.kind === "editable"
		? settingsKeys.skillFile(project, source.root, source.name, path)
		: settingsKeys.skillDocumentFile(project, source.filePath, path);

/** The exact text of one file. The view keeps its own draft, so a refetch never replaces typing. */
export const useRawFile = (source: RawSource, path: string | undefined) => {
	const project = useSettingsProject();
	return useQuery({
		queryKey: fileKey(project, source, path ?? ""),
		queryFn:
			path === undefined
				? skipToken
				: ({ signal }) => {
						if (source.kind === "listed") {
							return readSkillDocumentFile(project, source.filePath, path, signal);
						}
						return path === "SKILL.md"
							? readSkillRaw(project, source.root, source.name).then((answer) => answer.text)
							: readSkillFile(project, source.root, source.name, path, signal);
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
				? writeSkillRaw(project, source.root, source.name, text)
				: writeSkillFile(project, source.root, source.name, path, text),
		onSuccess: () => {
			void queryClient.invalidateQueries({
				queryKey: settingsKeys.skillFiles(project, source.root, source.name),
			});
		},
	});
};
