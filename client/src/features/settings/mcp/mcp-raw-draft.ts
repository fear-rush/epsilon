import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import type { McpScope } from "shared";

import { saveMcpRaw } from "@/api/endpoints";
import { settingsKeys } from "@/api/keys";
import { useMcpRaw, useSettingsProject, useSettingsRefresh } from "@/features/settings/queries";

/**
 * The Raw tab's state: the server's JSON entry, edited as text. Secrets arrive as
 * `<stored>` and are written back as what the file holds. Nothing is written
 * until Save, and the text starts over from the file after each save.
 */

/** The JSON parse message of `text`, or undefined when it parses. */
const parseProblem = (text: string): string | undefined => {
	try {
		JSON.parse(text);
		return undefined;
	} catch (error) {
		return error instanceof Error ? error.message : "Not valid JSON";
	}
};

export function useMcpRawDraft(scope: McpScope, name: string) {
	const project = useSettingsProject();
	const refresh = useSettingsRefresh();
	const queryClient = useQueryClient();
	const query = useMcpRaw(scope, name);
	const [edited, setEdited] = useState<string>();
	const [problem, setProblem] = useState<string>();
	const released = useRef(false);
	const text = edited ?? query.data ?? "";
	const dirty = edited !== undefined && edited !== query.data;

	const save = useMutation({
		mutationFn: () => saveMcpRaw(project, scope, name, text),
		onSuccess: async () => {
			refresh();
			await queryClient.invalidateQueries({ queryKey: settingsKeys.all });
			setEdited(undefined);
		},
	});

	return {
		query,
		text,
		dirty,
		problem,
		save,
		edit: (next: string) => {
			released.current = false;
			setEdited(next);
			setProblem(parseProblem(next));
		},
		submit: () => {
			const found = parseProblem(text);
			setProblem(found);
			if (found === undefined) save.mutate();
		},
		discard: () => {
			setEdited(undefined);
			setProblem(undefined);
			save.reset();
		},
		/** Call before a navigation the user chose, so the leave guard lets it through. */
		allowLeave: () => {
			released.current = true;
		},
		blocked: () => dirty && !released.current,
	};
}

export type McpRawDraft = ReturnType<typeof useMcpRawDraft>;
