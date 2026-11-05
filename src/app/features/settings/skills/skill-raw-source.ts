import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { SkillRoot } from "#protocol/settings/skills";

import { settingsKeys } from "../keys.ts";
import { useSettingsProject } from "../queries.ts";
import {
	readSkillFile,
	readSkillFiles,
	readSkillRaw,
	writeSkillFile,
	writeSkillRaw,
} from "./api.ts";

/**
 * Which skill folder the Raw view reads. An editable skill is one Epsilon may save; a
 * skill the inventory lists is read through its own calls, which a later row brings.
 */
export type RawSource = { kind: "editable"; root: SkillRoot; name: string };

/** Every file in the skill folder, `SKILL.md` included. */
export const useRawFiles = (source: RawSource) => {
	const project = useSettingsProject();
	return useQuery({
		queryKey: settingsKeys.skillFiles(project, source.root, source.name),
		queryFn: ({ signal }) => readSkillFiles(project, source.root, source.name, signal),
	});
};

/** The exact text of one file. The view keeps its own draft, so a refetch never replaces typing. */
export const useRawFile = (source: RawSource, path: string | undefined) => {
	const project = useSettingsProject();
	return useQuery({
		queryKey: settingsKeys.skillFile(project, source.root, source.name, path ?? ""),
		queryFn:
			path === undefined
				? skipToken
				: ({ signal }) =>
						path === "SKILL.md"
							? readSkillRaw(project, source.root, source.name).then((answer) => answer.text)
							: readSkillFile(project, source.root, source.name, path, signal),
		gcTime: 0,
		refetchOnWindowFocus: false,
	});
};

/** Writes one file of an editable skill; `SKILL.md` goes through the checked raw route. */
export const useRawSave = (source: RawSource, path: string) => {
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
