/**
 * REST reads and writes as plain functions over the generated client. The client
 * throws the route's own sentence on a refusal, so a caller only sees data.
 */
import { api, RefusalError } from "./client";
import type {
	DefaultModel,
	FolderListing,
	McpAutoEnableInput,
	McpEnabledInput,
	McpInProjectInput,
	McpRegistryDetail,
	McpRegistrySearch,
	McpRegistrySource,
	McpServerDetail,
	McpServerInput,
	PackageResources,
	PackageView,
	ProviderDetail,
	ProviderImportInput,
	ProviderInput,
	ProviderLoginAnswer,
	ProviderLoginSnapshot,
	ProviderLoginType,
	ProviderModelInput,
	ProviderTestInput,
	ProjectStatus,
	Readiness,
	SessionList,
	SettingsSnapshot,
	SkillBundleList,
	SkillDocument,
	SkillFile,
	SkillImportCommit,
	SkillImportReport,
	SkillInput,
	SkillRoot,
	TrashList,
} from "./types";
import type { McpScope } from "shared";

type PackageScope = PackageView["scope"];

/** A successful answer always has a body; an empty one means the server broke its contract. */
const body = <Data>(data: Data | undefined): Data => {
	if (data === undefined) throw new Error("The server sent an empty answer.");
	return data;
};

/**
 * A sign-in the server no longer holds is an answer, not a failure: it is how a flow
 * that another process finished, or this page lost, reports that it is over.
 */
/** What any of the sign-in routes answers with when it has a body. */
type LoginReply = { data?: ProviderLoginSnapshot };

const loginOrGone = async (request: Promise<LoginReply>): Promise<ProviderLoginSnapshot | null> => {
	try {
		return body((await request).data);
	} catch (error) {
		if (error instanceof RefusalError && error.status === 404) return null;
		throw error;
	}
};

export const fetchSessions = async (signal?: AbortSignal): Promise<SessionList> =>
	body((await api.GET("/api/sessions", { signal })).data);

export const deleteSession = async (id: string): Promise<void> => {
	await api.DELETE("/api/sessions/{id}", { params: { path: { id } } });
};

/** Chats a delete moved to Epsilon's trash, newest first, with the record of where each came from. */
export const fetchTrash = async (signal?: AbortSignal): Promise<TrashList> =>
	body((await api.GET("/api/sessions/trash", { signal })).data);

/** Puts a deleted chat's file back where pi's list finds it again. Answers that path. */
export const restoreTrashedSession = async (id: string): Promise<string> =>
	body((await api.POST("/api/sessions/trash/{id}/restore", { params: { path: { id } } })).data)
		.path;

/** The one way a chat's file leaves the disk for good. */
export const purgeTrashedSession = async (id: string): Promise<void> => {
	await api.DELETE("/api/sessions/trash/{id}", { params: { path: { id } } });
};

/**
 * Takes a project off the list by moving its chats to the trash. The folder itself
 * and its trust are left alone. Answers how many chats moved.
 */
export const removeProject = async (path: string): Promise<number> =>
	body((await api.DELETE("/api/projects/sessions", { params: { query: { path } } })).data).removed;

/** Set the display name pi records in the session file. */
export const renameSession = async (id: string, name: string): Promise<void> => {
	await api.PATCH("/api/sessions/{id}/name", { params: { path: { id } }, body: { name } });
};

/** Pinned ids are Epsilon's own preference, stored in the agent home. */
export const setSessionPinned = async (id: string, pinned: boolean): Promise<void> => {
	await api.PATCH("/api/sessions/{id}/pin", { params: { path: { id } }, body: { pinned } });
};

/** Answers the session's new id: pi forks the history into the project. */
export const moveSession = async (id: string, project: string): Promise<string> =>
	body(
		(
			await api.POST("/api/sessions/{id}/move", {
				params: { path: { id } },
				body: { project },
			})
		).data,
	).id;

export const fetchProjectStatus = async (
	path: string,
	signal?: AbortSignal,
): Promise<ProjectStatus> =>
	body((await api.GET("/api/projects/status", { params: { query: { path } }, signal })).data);

export const trustProject = async (path: string): Promise<ProjectStatus> =>
	body((await api.POST("/api/projects/trust", { body: { path } })).data);

export const fetchFolders = async (
	path: string | undefined,
	hidden = false,
	signal?: AbortSignal,
): Promise<FolderListing> =>
	body(
		(
			await api.GET("/api/projects/folders", {
				params: { query: { path, hidden: hidden ? "true" : "false" } },
				signal,
			})
		).data,
	);

/** Create one folder under an existing one; answers its real path. */
export const createFolder = async (parent: string, name: string): Promise<string> =>
	body((await api.POST("/api/projects/folders", { body: { parent, name } })).data).path;

/**
 * The project a settings request reads or writes beside the agent home, or
 * undefined for the home alone. It comes from the Settings URL.
 */
type Project = string | undefined;

const scoped = (project: Project) => ({ query: { project } });

export const fetchSettings = async (
	project: Project,
	signal?: AbortSignal,
): Promise<SettingsSnapshot> =>
	body((await api.GET("/api/settings", { params: scoped(project), signal })).data);

export const fetchReadiness = async (signal?: AbortSignal): Promise<Readiness> =>
	body((await api.GET("/api/readiness", { signal })).data);

export const fetchProviderDetail = async (
	id: string,
	signal?: AbortSignal,
): Promise<ProviderDetail> =>
	body((await api.GET("/api/settings/providers/{id}", { params: { path: { id } }, signal })).data);

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

/** Begin pi's sign-in. The answer is the flow's first state; the page polls the rest. */
export const startProviderLogin = async (
	id: string,
	type: ProviderLoginType,
): Promise<ProviderLoginSnapshot> =>
	body(
		(
			await api.POST("/api/settings/providers/{id}/login", {
				params: { path: { id } },
				body: { type },
			})
		).data,
	);

export const fetchProviderLogin = async (
	id: string,
	signal?: AbortSignal,
): Promise<ProviderLoginSnapshot | null> =>
	loginOrGone(api.GET("/api/settings/providers/{id}/login", { params: { path: { id } }, signal }));

export const answerProviderLogin = async (
	id: string,
	answer: ProviderLoginAnswer,
): Promise<ProviderLoginSnapshot | null> =>
	loginOrGone(
		api.POST("/api/settings/providers/{id}/login/answer", {
			params: { path: { id } },
			body: answer,
		}),
	);

export const cancelProviderLogin = async (id: string): Promise<ProviderLoginSnapshot | null> =>
	loginOrGone(api.POST("/api/settings/providers/{id}/login/cancel", { params: { path: { id } } }));

export const logoutProvider = async (id: string): Promise<void> => {
	await api.POST("/api/settings/providers/{id}/logout", { params: { path: { id } } });
};

export const setDefaultModel = async (model: DefaultModel): Promise<void> => {
	await api.PUT("/api/settings/default-model", { body: model });
};

export const saveMcpServer = async (project: Project, input: McpServerInput): Promise<void> => {
	await api.POST("/api/settings/mcp", { params: scoped(project), body: input });
};

export const searchMcpRegistry = async (
	source: McpRegistrySource,
	q: string,
	cursor: string | undefined,
	signal?: AbortSignal,
): Promise<McpRegistrySearch> =>
	body(
		(
			await api.GET("/api/settings/mcp/registry/search", {
				params: { query: { source, q, cursor } },
				signal,
			})
		).data,
	);

export const fetchMcpRegistryServer = async (
	source: McpRegistrySource,
	name: string,
	signal?: AbortSignal,
): Promise<McpRegistryDetail> =>
	body(
		(
			await api.GET("/api/settings/mcp/registry/server", {
				params: { query: { source, name } },
				signal,
			})
		).data,
	);

export const fetchMcpServer = async (
	project: Project,
	scope: McpScope,
	name: string,
	signal?: AbortSignal,
): Promise<McpServerDetail> =>
	body(
		(
			await api.GET("/api/settings/mcp/{scope}/{name}", {
				params: { path: { scope, name }, ...scoped(project) },
				signal,
			})
		).data,
	);

export const fetchMcpRaw = async (
	project: Project,
	scope: McpScope,
	name: string,
	signal?: AbortSignal,
): Promise<string> =>
	body(
		(
			await api.GET("/api/settings/mcp/{scope}/{name}/raw", {
				params: { path: { scope, name }, ...scoped(project) },
				signal,
			})
		).data,
	).text;

export const saveMcpRaw = async (
	project: Project,
	scope: McpScope,
	name: string,
	text: string,
): Promise<void> => {
	await api.PUT("/api/settings/mcp/{scope}/{name}/raw", {
		params: { path: { scope, name }, ...scoped(project) },
		body: { text },
	});
};

export const deleteMcpServer = async (
	project: Project,
	scope: McpScope,
	name: string,
): Promise<void> => {
	await api.DELETE("/api/settings/mcp/{scope}/{name}", {
		params: { path: { scope, name }, ...scoped(project) },
	});
};

export const setMcpServerEnabled = async (
	project: Project,
	input: McpEnabledInput,
): Promise<void> => {
	await api.POST("/api/settings/mcp/enabled", { params: scoped(project), body: input });
};

export const setMcpServerInProject = async (
	project: Project,
	input: McpInProjectInput,
): Promise<void> => {
	await api.POST("/api/settings/mcp/in-project", { params: scoped(project), body: input });
};

export const setMcpAutoEnableCodemode = async (
	project: Project,
	input: McpAutoEnableInput,
): Promise<void> => {
	await api.POST("/api/settings/mcp/auto-enable-codemode", {
		params: scoped(project),
		body: input,
	});
};

export const fetchSkill = async (
	project: Project,
	root: SkillRoot,
	name: string,
	signal?: AbortSignal,
): Promise<SkillFile> =>
	body(
		(
			await api.GET("/api/settings/skills/{root}/{name}", {
				params: { path: { root, name }, query: { project } },
				signal,
			})
		).data,
	);

/** Any listed skill's file by its path, for display; the server refuses an unlisted path. */
export const fetchListedSkill = async (
	project: Project,
	filePath: string,
	signal?: AbortSignal,
): Promise<SkillDocument> =>
	body(
		(
			await api.GET("/api/settings/skills/listed", {
				params: { query: { project, filePath } },
				signal,
			})
		).data,
	);

export const saveSkill = async (
	project: Project,
	root: SkillRoot,
	name: string,
	input: SkillInput,
): Promise<void> => {
	await api.PUT("/api/settings/skills/{root}/{name}", {
		params: { path: { root, name }, query: { project } },
		body: input,
	});
};

export const deleteSkill = async (
	project: Project,
	root: SkillRoot,
	name: string,
): Promise<void> => {
	await api.DELETE("/api/settings/skills/{root}/{name}", {
		params: { path: { root, name }, query: { project } },
	});
};

/** Every file in one editable skill's folder, `SKILL.md` included. */
export const fetchSkillFiles = async (
	project: Project,
	root: SkillRoot,
	name: string,
	signal?: AbortSignal,
): Promise<SkillBundleList> =>
	body(
		(
			await api.GET("/api/settings/skills/{root}/{name}/files", {
				params: { path: { root, name }, query: { project } },
				signal,
			})
		).data,
	);

/** One bundled text file. `SKILL.md` is read through `fetchSkill` instead. */
export const fetchSkillBundleFile = async (
	project: Project,
	root: SkillRoot,
	name: string,
	path: string,
	signal?: AbortSignal,
): Promise<string> =>
	body(
		(
			await api.GET("/api/settings/skills/{root}/{name}/file", {
				params: { path: { root, name }, query: { project, path } },
				signal,
			})
		).data,
	).text;

/** The exact text of an editable skill's `SKILL.md`. */
export const fetchSkillRaw = async (
	project: Project,
	root: SkillRoot,
	name: string,
	signal?: AbortSignal,
): Promise<string> =>
	body(
		(
			await api.GET("/api/settings/skills/{root}/{name}/raw", {
				params: { path: { root, name }, query: { project } },
				signal,
			})
		).data,
	).text;

/** Replaces `SKILL.md` with the text; the server refuses text that is not a valid skill file. */
export const saveSkillRaw = async (
	project: Project,
	root: SkillRoot,
	name: string,
	text: string,
): Promise<void> => {
	await api.PUT("/api/settings/skills/{root}/{name}/raw", {
		params: { path: { root, name }, query: { project } },
		body: { text },
	});
};

/** Every file in a listed skill's folder, for display. */
export const fetchListedSkillFiles = async (
	project: Project,
	filePath: string,
	signal?: AbortSignal,
): Promise<SkillBundleList> =>
	body(
		(
			await api.GET("/api/settings/skills/listed-files", {
				params: { query: { project, filePath } },
				signal,
			})
		).data,
	);

/** One text file of a listed skill, `SKILL.md` included. */
export const fetchListedSkillFile = async (
	project: Project,
	filePath: string,
	path: string,
	signal?: AbortSignal,
): Promise<string> =>
	body(
		(
			await api.GET("/api/settings/skills/listed-file", {
				params: { query: { project, filePath, path } },
				signal,
			})
		).data,
	).text;

export const saveSkillBundleFile = async (
	project: Project,
	root: SkillRoot,
	name: string,
	path: string,
	text: string,
): Promise<void> => {
	await api.PUT("/api/settings/skills/{root}/{name}/file", {
		params: { path: { root, name }, query: { project, path } },
		body: { text },
	});
};

export const deleteSkillBundleFile = async (
	project: Project,
	root: SkillRoot,
	name: string,
	path: string,
): Promise<void> => {
	await api.DELETE("/api/settings/skills/{root}/{name}/file", {
		params: { path: { root, name }, query: { project, path } },
	});
};

/** Turns one skill on or off through the `skills` setting. `filePath` comes from the snapshot. */
export const setSkillEnabled = async (
	project: Project,
	filePath: string,
	enabled: boolean,
): Promise<void> => {
	await api.POST("/api/settings/skills/enabled", {
		params: scoped(project),
		body: { filePath, enabled },
	});
};

/** Adds or removes another agent's skills folder in pi's `skills` setting. */
export const setSkillFolderLinked = async (
	project: Project,
	folder: string,
	linked: boolean,
): Promise<void> => {
	const path = linked ? "/api/settings/skills/folders/link" : "/api/settings/skills/folders/unlink";
	await api.POST(path, { params: scoped(project), body: { folder } });
};

/**
 * Stages a picked folder or one archive. Each part is named by its path inside
 * the folder, which is how the server rebuilds the tree.
 */
export const stageSkillUpload = async (
	project: Project,
	files: readonly { file: Blob; path: string }[],
): Promise<SkillImportReport> =>
	body(
		(
			await api.POST("/api/settings/skills/import/upload", {
				params: scoped(project),
				body: { files: [] },
				bodySerializer: () => {
					const form = new FormData();
					for (const entry of files) form.append("files", entry.file, entry.path);
					return form;
				},
			})
		).data,
	);

/** Stages a pasted `skills add` command, `owner/repo`, or git URL. */
export const stageSkillSource = async (
	project: Project,
	input: string,
): Promise<SkillImportReport> =>
	body(
		(
			await api.POST("/api/settings/skills/import/source", {
				params: scoped(project),
				body: { input },
			})
		).data,
	);

export const commitSkillImport = async (
	project: Project,
	stageId: string,
	commit: SkillImportCommit,
): Promise<void> => {
	await api.POST("/api/settings/skills/import/{stageId}/commit", {
		params: { path: { stageId }, query: { project } },
		body: commit,
	});
};

export const discardSkillImport = async (stageId: string): Promise<void> => {
	await api.DELETE("/api/settings/skills/import/{stageId}", { params: { path: { stageId } } });
};

export const installPackage = async (
	project: Project,
	source: string,
	scope: PackageScope,
): Promise<void> => {
	await api.POST("/api/settings/packages", { params: scoped(project), body: { source, scope } });
};

export const removePackage = async (
	project: Project,
	source: string,
	scope: PackageScope,
): Promise<void> => {
	await api.DELETE("/api/settings/packages", { params: { query: { source, scope, project } } });
};

export const fetchPackageResources = async (
	project: Project,
	source: string,
	scope: PackageScope,
	signal?: AbortSignal,
): Promise<PackageResources> =>
	body(
		(
			await api.GET("/api/settings/packages/resources", {
				params: { query: { source, scope, project } },
				signal,
			})
		).data,
	);
