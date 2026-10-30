/**
 * `models.json` as a document. pi ships no writer for it, so the dashboard parses
 * it with the loose schema in `models-file.ts` and merges into what is there. The
 * file can hold a literal API key, so it is always 0600 and a problem sentence
 * never quotes it.
 */
import { basename } from "node:path";

import type { AgentHome } from "../../platform/agent-home";
import { jsonDocument } from "../../platform/json-document";
import type { JsonDocument, Wording } from "../../platform/json-document";
import { modelsFileSchema } from "./models-file";
import type { ModelsFile, ProviderEntry } from "./models-file";

const wording: Wording = {
	problem: (_cause, path) =>
		`${basename(path)} cannot be read by this version of Settings. Fix it in a terminal, then reload.`,
	refusal: (path) => `${basename(path)} is not valid for pi; fix or remove it before editing here.`,
};

export const modelsDocument = (home: AgentHome): JsonDocument<ModelsFile> =>
	jsonDocument(home.modelsFile, {
		schema: modelsFileSchema,
		empty: () => ({}),
		policy: "private",
		wording,
	});

/** The provider entries, or none when the file is missing or unreadable. */
export const readProvidersFile = async (
	home: AgentHome,
): Promise<Record<string, ProviderEntry>> => {
	const { value } = await modelsDocument(home).read();
	return value.providers ?? {};
};
