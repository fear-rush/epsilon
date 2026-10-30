/**
 * REST reads and writes as plain functions over the generated client. The client
 * throws the route's own sentence on a refusal, so a caller only sees data.
 */
import { api } from "./client";
import type {
	DefaultModel,
	McpEnabledInput,
	McpInProjectInput,
	McpServerDetail,
	McpServerInput,
	ProviderDetail,
	ProviderImportInput,
	ProviderInput,
	ProviderModelInput,
	ProviderTestInput,
	Readiness,
	SessionList,
	SettingsSnapshot,
	SkillInput,
} from "./types";
import type { McpScope } from "shared";

/** A successful answer always has a body; an empty one means the server broke its contract. */
const body = <Data>(data: Data | undefined): Data => {
	if (data === undefined) throw new Error("The server sent an empty answer.");
	return data;
};

export const fetchSessions = async (): Promise<SessionList> =>
	body((await api.GET("/api/sessions")).data);

export const deleteSession = async (id: string): Promise<void> => {
	await api.DELETE("/api/sessions/{id}", { params: { path: { id } } });
};

export const fetchSettings = async (): Promise<SettingsSnapshot> =>
	body((await api.GET("/api/settings")).data);

export const fetchReadiness = async (): Promise<Readiness> =>
	body((await api.GET("/api/readiness")).data);

export const fetchProviderDetail = async (id: string): Promise<ProviderDetail> =>
	body((await api.GET("/api/settings/providers/{id}", { params: { path: { id } } })).data);

export const importProviderModels = async (
	input: ProviderImportInput,
): Promise<ProviderModelInput[]> =>
	body((await api.POST("/api/settings/providers/models", { body: input })).data).models;

export const saveProvider = async (input: ProviderInput): Promise<void> => {
	await api.POST("/api/settings/providers", { body: input });
};

export const testProvider = async (input: ProviderTestInput): Promise<string> =>
	body((await api.POST("/api/settings/providers/test", { body: input })).data).message;

export const deleteProvider = async (id: string): Promise<void> => {
	await api.DELETE("/api/settings/providers/{id}", { params: { path: { id } } });
};

export const setDefaultModel = async (model: DefaultModel): Promise<void> => {
	await api.PUT("/api/settings/default-model", { body: model });
};

export const saveMcpServer = async (input: McpServerInput): Promise<void> => {
	await api.POST("/api/settings/mcp", { body: input });
};

export const fetchMcpServer = async (scope: McpScope, name: string): Promise<McpServerDetail> =>
	body(
		(await api.GET("/api/settings/mcp/{scope}/{name}", { params: { path: { scope, name } } })).data,
	);

export const deleteMcpServer = async (scope: McpScope, name: string): Promise<void> => {
	await api.DELETE("/api/settings/mcp/{scope}/{name}", { params: { path: { scope, name } } });
};

export const setMcpServerEnabled = async (input: McpEnabledInput): Promise<void> => {
	await api.POST("/api/settings/mcp/enabled", { body: input });
};

export const setMcpServerInProject = async (input: McpInProjectInput): Promise<void> => {
	await api.POST("/api/settings/mcp/in-project", { body: input });
};

export const fetchSkill = async (name: string): Promise<SkillInput> =>
	body((await api.GET("/api/settings/skills/{name}", { params: { path: { name } } })).data);

export const saveSkill = async (input: SkillInput): Promise<void> => {
	await api.POST("/api/settings/skills", { body: input });
};

export const deleteSkill = async (name: string): Promise<void> => {
	await api.DELETE("/api/settings/skills/{name}", { params: { path: { name } } });
};

export const installPackage = async (source: string): Promise<void> => {
	await api.POST("/api/settings/packages", { body: { source } });
};

export const removePackage = async (source: string): Promise<void> => {
	await api.DELETE("/api/settings/packages", { params: { query: { source } } });
};
