/**
 * REST reads and writes. Responses are parsed with the shared zod schemas, so a
 * server change this page cannot read is an error it shows, never a blank list,
 * and every refusal becomes the one sentence the route sent.
 */
import {
	problemSchema,
	providerDetailSchema,
	providerImportResultSchema,
	readinessSchema,
	settingsSnapshotSchema,
	sessionListSchema,
	skillInputSchema,
} from "shared";
import type {
	DefaultModel,
	McpServerInput,
	ProviderDetail,
	ProviderImportInput,
	ProviderInput,
	ProviderModelInput,
	Readiness,
	SessionList,
	SettingsSnapshot,
	SkillInput,
} from "shared";
import type { z } from "zod";

const OFFLINE = "The server is not reachable. Retrying…";

/** A dropped connection is a phrase, not the browser's "Failed to fetch". */
const request = async (path: string, init?: RequestInit): Promise<Response> => {
	try {
		return await fetch(path, init);
	} catch {
		throw new Error(OFFLINE);
	}
};

/** The route's own sentence, or a fallback naming what failed. */
const refuse = async (response: Response, fallback: string): Promise<never> => {
	const parsed = problemSchema.safeParse(await response.json().catch(() => null));
	throw new Error(parsed.success ? parsed.data.message : `${fallback} (${response.status}).`);
};

type Text = { failure: string; unreadable: string };

/** The bodies this page sends; each caller has already typed its own input. */
type RequestBody =
	| DefaultModel
	| McpServerInput
	| ProviderImportInput
	| ProviderInput
	| SkillInput
	| { source: string };

const readJson = async <T>(path: string, schema: z.ZodType<T>, text: Text): Promise<T> => {
	const response = await request(path);
	if (!response.ok) return refuse(response, text.failure);
	const parsed = schema.safeParse(await response.json());
	if (!parsed.success) throw new Error(text.unreadable);
	return parsed.data;
};

const writeJson = async (
	method: string,
	path: string,
	body: RequestBody,
	failure: string,
): Promise<Response> => {
	const response = await request(path, {
		method,
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
	if (!response.ok) return refuse(response, failure);
	return response;
};

const send = async (method: string, path: string, failure: string): Promise<void> => {
	const response = await request(path, { method });
	if (!response.ok) await refuse(response, failure);
};

export const fetchSessions = (): Promise<SessionList> =>
	readJson("/api/sessions", sessionListSchema, {
		failure: "The session list did not load",
		unreadable: "The server sent a session list this page cannot read.",
	});

export const deleteSession = (id: string): Promise<void> =>
	send("DELETE", `/api/sessions/${encodeURIComponent(id)}`, "Delete failed");

export const fetchSettings = (): Promise<SettingsSnapshot> =>
	readJson("/api/settings", settingsSnapshotSchema, {
		failure: "Settings did not load",
		unreadable: "The server sent settings this page cannot read.",
	});

export const fetchReadiness = (): Promise<Readiness> =>
	readJson("/api/readiness", readinessSchema, {
		failure: "Readiness did not load",
		unreadable: "The server sent a readiness answer this page cannot read.",
	});

export const fetchProviderDetail = (id: string): Promise<ProviderDetail> =>
	readJson(`/api/settings/providers/${encodeURIComponent(id)}`, providerDetailSchema, {
		failure: "The provider did not load",
		unreadable: "The server sent a provider this page cannot read.",
	});

export async function importProviderModels(
	input: ProviderImportInput,
): Promise<ProviderModelInput[]> {
	const response = await writeJson(
		"POST",
		"/api/settings/providers/models",
		input,
		"The models did not load",
	);
	const parsed = providerImportResultSchema.safeParse(await response.json());
	if (!parsed.success) throw new Error("The server sent a model list this page cannot read.");
	return parsed.data.models;
}

export const saveProvider = async (input: ProviderInput): Promise<void> => {
	await writeJson("POST", "/api/settings/providers", input, "The provider was not saved");
};

export const deleteProvider = (id: string): Promise<void> =>
	send(
		"DELETE",
		`/api/settings/providers/${encodeURIComponent(id)}`,
		"The provider was not removed",
	);

export const setDefaultModel = async (model: DefaultModel): Promise<void> => {
	await writeJson("PUT", "/api/settings/default-model", model, "The default model was not saved");
};

export const saveMcpServer = async (input: McpServerInput): Promise<void> => {
	await writeJson("POST", "/api/settings/mcp", input, "The MCP server was not saved");
};

export const deleteMcpServer = (name: string): Promise<void> =>
	send("DELETE", `/api/settings/mcp/${encodeURIComponent(name)}`, "The MCP server was not removed");

export const fetchSkill = (name: string): Promise<SkillInput> =>
	readJson(`/api/settings/skills/${encodeURIComponent(name)}`, skillInputSchema, {
		failure: "The skill did not load",
		unreadable: "The server sent a skill this page cannot read.",
	});

export const saveSkill = async (input: SkillInput): Promise<void> => {
	await writeJson("POST", "/api/settings/skills", input, "The skill was not saved");
};

export const deleteSkill = (name: string): Promise<void> =>
	send("DELETE", `/api/settings/skills/${encodeURIComponent(name)}`, "The skill was not removed");

export const installPackage = async (source: string): Promise<void> => {
	await writeJson("POST", "/api/settings/packages", { source }, "The package was not installed");
};

export const removePackage = (source: string): Promise<void> =>
	send(
		"DELETE",
		`/api/settings/packages?source=${encodeURIComponent(source)}`,
		"The package was not removed",
	);
