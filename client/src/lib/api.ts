/**
 * REST reads for the session list. Responses are parsed with the shared zod
 * schemas, so a server change that the client cannot read is an error the page
 * shows, never a blank list.
 */
import {
	providerDetailSchema,
	providerImportResultSchema,
	settingsErrorSchema,
	settingsSnapshotSchema,
	sessionErrorSchema,
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
	SessionList,
	SettingsSnapshot,
	SkillInput,
} from "shared";

const OFFLINE = "The server is not reachable. Retrying…";

/** A dropped connection is a phrase, not the browser's "Failed to fetch". */
const request = async (input: string, init?: RequestInit): Promise<Response> => {
	try {
		return await fetch(input, init);
	} catch {
		throw new Error(OFFLINE);
	}
};

export async function fetchSessions(): Promise<SessionList> {
	const response = await request("/api/sessions");
	if (!response.ok) throw new Error(`The session list did not load (${response.status}).`);
	const parsed = sessionListSchema.safeParse(await response.json());
	if (!parsed.success) throw new Error("The server sent a session list this page cannot read.");
	return parsed.data;
}

export async function deleteSession(id: string): Promise<void> {
	const response = await request(`/api/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
	if (response.ok) return;
	const parsed = sessionErrorSchema.safeParse(await response.json().catch(() => null));
	throw new Error(parsed.success ? parsed.data.message : `Delete failed (${response.status}).`);
}

/** Settings responses are either the snapshot or a refusal with one sentence. */
const expectNoContent = async (response: Response, fallback: string): Promise<void> => {
	if (response.ok) return;
	const parsed = settingsErrorSchema.safeParse(await response.json().catch(() => null));
	throw new Error(parsed.success ? parsed.data.message : `${fallback} (${response.status}).`);
};

export async function fetchSettings(): Promise<SettingsSnapshot> {
	const response = await request("/api/settings");
	if (!response.ok) throw new Error(`Settings did not load (${response.status}).`);
	const parsed = settingsSnapshotSchema.safeParse(await response.json());
	if (!parsed.success) throw new Error("The server sent settings this page cannot read.");
	return parsed.data;
}

export async function fetchProviderDetail(id: string): Promise<ProviderDetail> {
	const response = await request(`/api/settings/providers/${encodeURIComponent(id)}`);
	if (response.status === 404) throw new Error("No provider or models.json entry with this id.");
	if (!response.ok) throw new Error(`The provider did not load (${response.status}).`);
	const parsed = providerDetailSchema.safeParse(await response.json());
	if (!parsed.success) throw new Error("The server sent a provider this page cannot read.");
	return parsed.data;
}

export async function importProviderModels(
	input: ProviderImportInput,
): Promise<ProviderModelInput[]> {
	const response = await request("/api/settings/providers/models", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(input),
	});
	if (!response.ok) {
		const parsed = settingsErrorSchema.safeParse(await response.json().catch(() => null));
		throw new Error(
			parsed.success ? parsed.data.message : `The models did not load (${response.status}).`,
		);
	}
	const parsed = providerImportResultSchema.safeParse(await response.json());
	if (!parsed.success) throw new Error("The server sent a model list this page cannot read.");
	return parsed.data.models;
}

export async function saveProvider(input: ProviderInput): Promise<void> {
	const response = await request("/api/settings/providers", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(input),
	});
	await expectNoContent(response, "The provider was not saved");
}

export async function deleteProvider(id: string): Promise<void> {
	const response = await request(`/api/settings/providers/${encodeURIComponent(id)}`, {
		method: "DELETE",
	});
	await expectNoContent(response, "The provider was not removed");
}

export async function setDefaultModel(model: DefaultModel): Promise<void> {
	const response = await request("/api/settings/default-model", {
		method: "PUT",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(model),
	});
	await expectNoContent(response, "The default model was not saved");
}

export async function saveMcpServer(input: McpServerInput): Promise<void> {
	const response = await request("/api/settings/mcp", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(input),
	});
	await expectNoContent(response, "The MCP server was not saved");
}

export async function deleteMcpServer(name: string): Promise<void> {
	const response = await request(`/api/settings/mcp/${encodeURIComponent(name)}`, {
		method: "DELETE",
	});
	await expectNoContent(response, "The MCP server was not removed");
}

export async function fetchSkill(name: string): Promise<SkillInput> {
	const response = await request(`/api/settings/skills/${encodeURIComponent(name)}`);
	if (!response.ok) throw new Error(`The skill did not load (${response.status}).`);
	const parsed = skillInputSchema.safeParse(await response.json());
	if (!parsed.success) throw new Error("The server sent a skill this page cannot read.");
	return parsed.data;
}

export async function saveSkill(input: SkillInput): Promise<void> {
	const response = await request("/api/settings/skills", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(input),
	});
	await expectNoContent(response, "The skill was not saved");
}

export async function deleteSkill(name: string): Promise<void> {
	const response = await request(`/api/settings/skills/${encodeURIComponent(name)}`, {
		method: "DELETE",
	});
	await expectNoContent(response, "The skill was not removed");
}

export async function installPackage(source: string): Promise<void> {
	const response = await request("/api/settings/packages", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ source }),
	});
	await expectNoContent(response, "The package was not installed");
}

export async function removePackage(source: string): Promise<void> {
	const response = await request(`/api/settings/packages?source=${encodeURIComponent(source)}`, {
		method: "DELETE",
	});
	await expectNoContent(response, "The package was not removed");
}
