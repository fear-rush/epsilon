/** Generated from openapi.json by `bun run api:generate`. Do not edit. */

export interface paths {
	"/health": {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
		get: operations["health"];
		put?: never;
		post?: never;
		delete?: never;
		options?: never;
		head?: never;
		patch?: never;
		trace?: never;
	};
	"/api/readiness": {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
		/** Whether the agent home holds a usable model, so a turn can run */
		get: operations["readiness"];
		put?: never;
		post?: never;
		delete?: never;
		options?: never;
		head?: never;
		patch?: never;
		trace?: never;
	};
	"/api/sessions": {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
		get: operations["listSessions"];
		put?: never;
		post?: never;
		delete?: never;
		options?: never;
		head?: never;
		patch?: never;
		trace?: never;
	};
	"/api/sessions/{id}": {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
		get?: never;
		put?: never;
		post?: never;
		/** Move a chat's session file to Epsilon's trash, where it can be restored */
		delete: operations["deleteSession"];
		options?: never;
		head?: never;
		patch?: never;
		trace?: never;
	};
	"/api/projects/sessions": {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
		get?: never;
		put?: never;
		post?: never;
		/** Take a project off the list by moving every chat recorded in it to Epsilon's trash; the folder and its trust stay */
		delete: operations["removeProject"];
		options?: never;
		head?: never;
		patch?: never;
		trace?: never;
	};
	"/api/sessions/{id}/move": {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
		get?: never;
		put?: never;
		/** Fork a session's history into a trusted project and remove the original */
		post: operations["moveSession"];
		delete?: never;
		options?: never;
		head?: never;
		patch?: never;
		trace?: never;
	};
	"/api/sessions/{id}/fork": {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
		get?: never;
		put?: never;
		/** pi's fork: a new session holding the chat up to the message picked, and the original file unchanged */
		post: operations["forkSession"];
		delete?: never;
		options?: never;
		head?: never;
		patch?: never;
		trace?: never;
	};
	"/api/sessions/{id}/clone": {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
		get?: never;
		put?: never;
		/** Clone a chat: a new session holding the branch up to where this one is now, and the original unchanged */
		post: operations["cloneSession"];
		delete?: never;
		options?: never;
		head?: never;
		patch?: never;
		trace?: never;
	};
	"/api/sessions/import": {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
		get?: never;
		put?: never;
		/** Copy a JSONL session file in as a new chat, in the chats folder or the project named */
		post: operations["importSession"];
		delete?: never;
		options?: never;
		head?: never;
		patch?: never;
		trace?: never;
	};
	"/api/sessions/{id}/name": {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
		get?: never;
		put?: never;
		post?: never;
		delete?: never;
		options?: never;
		head?: never;
		/** Set the display name of a chat */
		patch: operations["renameSession"];
		trace?: never;
	};
	"/api/sessions/{id}/pin": {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
		get?: never;
		put?: never;
		post?: never;
		delete?: never;
		options?: never;
		head?: never;
		/** Pin or unpin a chat in the session list */
		patch: operations["pinSession"];
		trace?: never;
	};
	"/api/sessions/{id}/export": {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
		get?: never;
		put?: never;
		/** Write one chat's transcript as an HTML page or a JSONL file, through the live engine */
		post: operations["exportSession"];
		delete?: never;
		options?: never;
		head?: never;
		patch?: never;
		trace?: never;
	};
	"/api/sessions/trash": {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
		/** Every chat in Epsilon's own trash, newest deletion first */
		get: operations["listTrashedSessions"];
		put?: never;
		post?: never;
		delete?: never;
		options?: never;
		head?: never;
		patch?: never;
		trace?: never;
	};
	"/api/sessions/trash/{id}/restore": {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
		get?: never;
		put?: never;
		/** Put a deleted chat's file back where pi's list finds it again */
		post: operations["restoreTrashedSession"];
		delete?: never;
		options?: never;
		head?: never;
		patch?: never;
		trace?: never;
	};
	"/api/sessions/trash/{id}": {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
		get?: never;
		put?: never;
		post?: never;
		/** Destroy a trashed chat for good; a restore is impossible afterwards */
		delete: operations["purgeTrashedSession"];
		options?: never;
		head?: never;
		patch?: never;
		trace?: never;
	};
	"/api/projects/status": {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
		get: operations["projectStatus"];
		put?: never;
		post?: never;
		delete?: never;
		options?: never;
		head?: never;
		patch?: never;
		trace?: never;
	};
	"/api/projects/trust": {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
		get?: never;
		put?: never;
		/** Trust a folder in pi's trust.json, through pi's own store */
		post: operations["trustProject"];
		delete?: never;
		options?: never;
		head?: never;
		patch?: never;
		trace?: never;
	};
	"/api/projects/folders": {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
		get: operations["browseFolders"];
		put?: never;
		/** Create one folder inside an existing folder */
		post: operations["createFolder"];
		delete?: never;
		options?: never;
		head?: never;
		patch?: never;
		trace?: never;
	};
	"/api/settings": {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
		/** Providers, default model, MCP servers with what they can reach, skills and packages from the agent home, plus a trusted project's .pi when one is named */
		get: operations["readSettings"];
		put?: never;
		post?: never;
		delete?: never;
		options?: never;
		head?: never;
		patch?: never;
		trace?: never;
	};
	"/api/settings/agent-limits": {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
		get?: never;
		/** Write the agent-wide compaction and retry limits and the model scope; a project can still override them */
		put: operations["setAgentLimits"];
		post?: never;
		delete?: never;
		options?: never;
		head?: never;
		patch?: never;
		trace?: never;
	};
	"/api/settings/default-model": {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
		get?: never;
		put: operations["setDefaultModel"];
		post?: never;
		delete?: never;
		options?: never;
		head?: never;
		patch?: never;
		trace?: never;
	};
	"/api/settings/providers/{id}": {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
		/** The editable detail of one provider, with header names but no secrets */
		get: operations["readProvider"];
		put?: never;
		post?: never;
		delete: operations["deleteProvider"];
		options?: never;
		head?: never;
		patch?: never;
		trace?: never;
	};
	"/api/settings/providers/models": {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
		get?: never;
		put?: never;
		/** Read a provider's model list; OpenAI-style and Anthropic endpoints only */
		post: operations["importProviderModels"];
		delete?: never;
		options?: never;
		head?: never;
		patch?: never;
		trace?: never;
	};
	"/api/settings/providers/test": {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
		get?: never;
		put?: never;
		/** Try a provider draft's model without writing models.json */
		post: operations["testProvider"];
		delete?: never;
		options?: never;
		head?: never;
		patch?: never;
		trace?: never;
	};
	"/api/settings/providers/{id}/login": {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
		/** What this provider's sign-in reports and what it waits for, as often as the page polls it */
		get: operations["readProviderLogin"];
		put?: never;
		/** Start pi's sign-in for a provider and answer with the flow's first state */
		post: operations["startProviderLogin"];
		delete?: never;
		options?: never;
		head?: never;
		patch?: never;
		trace?: never;
	};
	"/api/settings/providers/{id}/login/answer": {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
		get?: never;
		put?: never;
		/** Answer the question a sign-in waits on. An answer to a question that moved on is ignored */
		post: operations["answerProviderLogin"];
		delete?: never;
		options?: never;
		head?: never;
		patch?: never;
		trace?: never;
	};
	"/api/settings/providers/{id}/login/cancel": {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
		get?: never;
		put?: never;
		/** Cancel a sign-in; pi keeps no credential from a cancelled flow */
		post: operations["cancelProviderLogin"];
		delete?: never;
		options?: never;
		head?: never;
		patch?: never;
		trace?: never;
	};
	"/api/settings/providers/{id}/logout": {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
		get?: never;
		put?: never;
		/** Remove the credential auth.json holds, leaving the models.json entry in place */
		post: operations["logoutProvider"];
		delete?: never;
		options?: never;
		head?: never;
		patch?: never;
		trace?: never;
	};
	"/api/settings/providers": {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
		get?: never;
		put?: never;
		/** Add or change a provider entry in models.json */
		post: operations["writeProvider"];
		delete?: never;
		options?: never;
		head?: never;
		patch?: never;
		trace?: never;
	};
	"/api/settings/mcp/registry/search": {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
		/** Search or browse the MCP server registry, twenty servers a page */
		get: operations["searchMcpRegistry"];
		put?: never;
		post?: never;
		delete?: never;
		options?: never;
		head?: never;
		patch?: never;
		trace?: never;
	};
	"/api/settings/mcp/registry/server": {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
		/** One registry server with the ways to install it, as mcp.json entries */
		get: operations["readMcpRegistryServer"];
		put?: never;
		post?: never;
		delete?: never;
		options?: never;
		head?: never;
		patch?: never;
		trace?: never;
	};
	"/api/settings/mcp/{scope}/{name}": {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
		/** The editable detail of one MCP server, with variable, header and secret names but no values, plus its log tail */
		get: operations["readMcpServer"];
		put?: never;
		post?: never;
		/** Remove an MCP server, or a project override, from its file */
		delete: operations["deleteMcpServer"];
		options?: never;
		head?: never;
		patch?: never;
		trace?: never;
	};
	"/api/settings/mcp/{scope}/{name}/raw": {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
		/** One server's entry in its mcp.json as JSON text. Stored env, header and OAuth secret values are replaced by the text <stored> */
		get: operations["readMcpRaw"];
		/** Replace one server's entry from JSON text. Each <stored> value keeps what the file holds at that path; nothing else in the file changes */
		put: operations["writeMcpRaw"];
		post?: never;
		delete?: never;
		options?: never;
		head?: never;
		patch?: never;
		trace?: never;
	};
	"/api/settings/mcp": {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
		get?: never;
		put?: never;
		/** Add or change an MCP server in the file its scope names. A save pi would skip is refused */
		post: operations["writeMcpServer"];
		delete?: never;
		options?: never;
		head?: never;
		patch?: never;
		trace?: never;
	};
	"/api/settings/mcp/enabled": {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
		get?: never;
		put?: never;
		/** Turn one server on or off in its own file. Off writes `enabled: false`; on removes the key */
		post: operations["setMcpServerEnabled"];
		delete?: never;
		options?: never;
		head?: never;
		patch?: never;
		trace?: never;
	};
	"/api/settings/mcp/in-project": {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
		get?: never;
		put?: never;
		/** Set a global server's state in this project: inherit the global setting, or write an override */
		post: operations["setMcpServerInProject"];
		delete?: never;
		options?: never;
		head?: never;
		patch?: never;
		trace?: never;
	};
	"/api/settings/mcp/auto-enable-codemode": {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
		get?: never;
		put?: never;
		/** Let a connecting codemode server activate codemode in its file. On removes the key, which is pi's default */
		post: operations["setMcpAutoEnableCodemode"];
		delete?: never;
		options?: never;
		head?: never;
		patch?: never;
		trace?: never;
	};
	"/api/settings/skills/import/upload": {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
		get?: never;
		put?: never;
		/** Stage the files of a picked folder, or one archive, and report the skills in it */
		post: operations["stageSkillUpload"];
		delete?: never;
		options?: never;
		head?: never;
		patch?: never;
		trace?: never;
	};
	"/api/settings/skills/import/source": {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
		get?: never;
		put?: never;
		/** Fetch a pasted install command or repository address into staging and report its skills */
		post: operations["stageSkillSource"];
		delete?: never;
		options?: never;
		head?: never;
		patch?: never;
		trace?: never;
	};
	"/api/settings/skills/import/{stageId}/commit": {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
		get?: never;
		put?: never;
		/** Install the chosen skills of a staged import, and reload live engines */
		post: operations["commitSkillImport"];
		delete?: never;
		options?: never;
		head?: never;
		patch?: never;
		trace?: never;
	};
	"/api/settings/skills/import/{stageId}": {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
		get?: never;
		put?: never;
		post?: never;
		delete: operations["discardSkillImport"];
		options?: never;
		head?: never;
		patch?: never;
		trace?: never;
	};
	"/api/settings/skills/{root}/{name}": {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
		/** One skill file for the edit form: managed fields, the fields it keeps untouched, or the raw text when the frontmatter does not parse */
		get: operations["readSkill"];
		/** Create or update a skill in an editable root. Frontmatter keys the panel does not manage are kept; a file that does not parse is refused */
		put: operations["writeSkill"];
		post?: never;
		delete: operations["deleteSkill"];
		options?: never;
		head?: never;
		patch?: never;
		trace?: never;
	};
	"/api/settings/skills/listed": {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
		/** The parsed SKILL.md of any skill the inventory lists, looked up by its file path, for display only. A path the inventory does not list is refused */
		get: operations["readListedSkill"];
		put?: never;
		post?: never;
		delete?: never;
		options?: never;
		head?: never;
		patch?: never;
		trace?: never;
	};
	"/api/settings/skills/listed-files": {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
		/** Every file in the folder of a skill the inventory lists, for display. A path the inventory does not list is refused */
		get: operations["listListedSkillFiles"];
		put?: never;
		post?: never;
		delete?: never;
		options?: never;
		head?: never;
		patch?: never;
		trace?: never;
	};
	"/api/settings/skills/listed-file": {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
		/** The text of one file in the folder of a skill the inventory lists, SKILL.md included. Binary files, files over 1 MB and unsafe paths are refused */
		get: operations["readListedSkillFile"];
		put?: never;
		post?: never;
		delete?: never;
		options?: never;
		head?: never;
		patch?: never;
		trace?: never;
	};
	"/api/settings/skills/{root}/{name}/raw": {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
		/** The exact text of one editable skill's SKILL.md, frontmatter included */
		get: operations["readSkillRaw"];
		/** Replace SKILL.md with the given text, byte for byte. The frontmatter must parse, its name must equal the folder name, and its description must pass the description rules */
		put: operations["writeSkillRaw"];
		post?: never;
		delete?: never;
		options?: never;
		head?: never;
		patch?: never;
		trace?: never;
	};
	"/api/settings/skills/{root}/{name}/files": {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
		/** Every file in one editable skill folder, SKILL.md included. Symlinks are not listed; skipped counts them */
		get: operations["listSkillFiles"];
		put?: never;
		post?: never;
		delete?: never;
		options?: never;
		head?: never;
		patch?: never;
		trace?: never;
	};
	"/api/settings/skills/{root}/{name}/file": {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
		/** The text of one bundled file. SKILL.md, binary files and files over 1 MB are refused */
		get: operations["readSkillBundleFile"];
		/** Create or replace one bundled text file, creating its folders. SKILL.md, unsafe paths, symlinks and a skill folder over the size limit are refused */
		put: operations["writeSkillBundleFile"];
		post?: never;
		/** Delete one bundled file and the folders it leaves empty. SKILL.md is refused */
		delete: operations["deleteSkillBundleFile"];
		options?: never;
		head?: never;
		patch?: never;
		trace?: never;
	};
	"/api/settings/skills/enabled": {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
		get?: never;
		put?: never;
		/** Turn one listed skill off or on with a -path entry in the skills setting. A package skill is refused: turn it off from Packages */
		post: operations["setSkillEnabled"];
		delete?: never;
		options?: never;
		head?: never;
		patch?: never;
		trace?: never;
	};
	"/api/settings/skills/folders/link": {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
		get?: never;
		put?: never;
		/** Add another agent's skill folder to the skills setting, so pi loads it where it is */
		post: operations["linkSkillFolder"];
		delete?: never;
		options?: never;
		head?: never;
		patch?: never;
		trace?: never;
	};
	"/api/settings/skills/folders/unlink": {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
		get?: never;
		put?: never;
		/** Remove another agent's skill folder from the skills setting */
		post: operations["unlinkSkillFolder"];
		delete?: never;
		options?: never;
		head?: never;
		patch?: never;
		trace?: never;
	};
	"/api/settings/packages": {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
		get?: never;
		put?: never;
		/** Install a package and declare it in pi's settings, for the home or a project */
		post: operations["installPackage"];
		delete: operations["removePackage"];
		options?: never;
		head?: never;
		patch?: never;
		trace?: never;
	};
	"/api/settings/packages/resources": {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
		/** What a declared package provides: extensions, skills, prompts and themes */
		get: operations["getPackageResources"];
		put?: never;
		post?: never;
		delete?: never;
		options?: never;
		head?: never;
		patch?: never;
		trace?: never;
	};
}

export interface components {
	schemas: {
		Readiness: ({
			ready: true;
		}) | ({
			ready: false;
			detail: string;
			fix: string;
			home: string;
		});
		SessionList: {
			chats: components["schemas"]["SessionSummary"][];
			projects: components["schemas"]["ProjectSessions"][];
			pinsProblem?: string;
		};
		SessionSummary: {
			id: string;
			cwd: string;
			name?: string;
			created: string;
			modified: string;
			messageCount: number;
			firstMessage: string;
			running: boolean;
			needsInput: boolean;
			pinned: boolean;
		};
		ProjectSessions: {
			project: components["schemas"]["ProjectStatus"];
			sessions: components["schemas"]["SessionSummary"][];
		};
		ProjectStatus: {
			path: string;
			name: string;
			trusted: boolean;
			hasProjectResources: boolean;
		};
		SessionError: components["schemas"]["Problem"] & ({
			code: "SESSION_NOT_FOUND" | "SESSION_RUNNING" | "PROJECT_NOT_TRUSTED" | "PROJECT_INVALID" | "TRASH_NOT_FOUND" | "TRASH_PATH_TAKEN" | "EXPORT_FAILED" | "SESSION_COPY_FAILED";
		});
		Problem: {
			message: string;
		};
		RemovedProject: {
			removed: number;
		};
		MovedSession: {
			id: string;
		};
		MoveSessionInput: {
			project: string;
		};
		CopiedSession: {
			id: string;
		};
		ForkSessionInput: {
			entryId: string;
		};
		ImportSessionInput: {
			path: string;
			project?: string;
		};
		RenamedSession: {
			id: string;
			name: string;
		};
		RenameSessionInput: {
			name: string;
		};
		PinSessionInput: {
			pinned: boolean;
		};
		ExportedSession: {
			filename: string;
			mimeType: string;
			text: string;
		};
		ExportSessionInput: {
			format: components["schemas"]["ExportFormat"];
		};
		ExportFormat: "html" | "jsonl";
		TrashList: {
			entries: components["schemas"]["TrashedSession"][];
			problem?: string;
		};
		TrashedSession: {
			id: string;
			path: string;
			deletedAt: string;
			name?: string;
			firstMessage: string;
		};
		RestoredSession: {
			id: string;
			path: string;
		};
		ProjectPathInput: {
			path: string;
		};
		FolderListing: {
			path: string;
			parent: string | null;
			folders: ({
				name: string;
				path: string;
			})[];
			truncated: boolean;
		};
		CreatedFolder: {
			path: string;
		};
		NewFolderInput: {
			parent: string;
			name: string;
		};
		SettingsSnapshot: {
			home: string;
			defaultModel: components["schemas"]["DefaultModel"];
			agent: components["schemas"]["AgentLimits"];
			modelScope: {
				matched: number;
				available: number;
				diagnostics: string[];
			};
			providers: components["schemas"]["ProviderView"][];
			builtins: components["schemas"]["BuiltinProvider"][];
			models: components["schemas"]["SnapshotModel"][];
			mcp: components["schemas"]["McpServerView"][];
			mcpReach: components["schemas"]["McpReach"];
			mcpLive: components["schemas"]["McpLive"];
			mcpDisabled: boolean;
			project: components["schemas"]["ProjectStatus"] & (({
				[key: string]: unknown;
			}) | null);
			skills: components["schemas"]["SkillView"][];
			foreignSkills: components["schemas"]["ForeignSkillView"][];
			packages: components["schemas"]["PackageView"][];
			ready: boolean;
			error?: string;
		};
		DefaultModel: ({
			provider: string;
			modelId: string;
		}) | null;
		AgentLimits: {
			compactionEnabled: boolean;
			compactionReserveTokens: number;
			compactionKeepRecentTokens: number;
			retryEnabled: boolean;
			retryMaxRetries: number;
			enabledModels: (string[]) | null;
		};
		ProviderView: {
			id: string;
			name: string;
			baseUrl?: string;
			api?: "openai-completions" | "openai-responses" | "anthropic-messages" | "google-generative-ai";
			modelCount: number;
			configured: boolean;
			source?: string;
			hasKey: boolean;
			custom: boolean;
			builtin: boolean;
		};
		BuiltinProvider: {
			id: string;
			name: string;
			configured: boolean;
			auth: components["schemas"]["ProviderAuth"];
		};
		ProviderAuth: {
			credential?: "api_key" | "oauth";
			oauth?: components["schemas"]["ProviderOauth"];
		};
		ProviderOauth: {
			name: string;
			label?: string;
			subscription: boolean;
		};
		SnapshotModel: {
			provider: string;
			id: string;
			name: string;
		};
		McpServerView: components["schemas"]["McpServerEntry"] | components["schemas"]["McpOverrideEntry"] | components["schemas"]["McpInvalidEntry"];
		McpServerEntry: {
			kind: "server";
			scope: "global" | "project";
			name: string;
			target: string;
			transport: "stdio" | "http";
			description?: string;
			enabled: boolean;
			exposure?: "codemode" | "deferred" | "direct" | "hidden";
			needsIndirect: boolean;
			timeout?: number;
			relation?: "replaces-global" | "replaced-by-project" | "overridden-by-project";
		};
		McpOverrideEntry: {
			kind: "override";
			scope: "project";
			name: string;
			target: string;
			transport: "stdio" | "http";
			description?: string;
			enabled: boolean;
			exposure?: "codemode" | "deferred" | "direct" | "hidden";
			needsIndirect: boolean;
			timeout?: number;
			overrideKeys: ("enabled" | "exposure" | "toolExposure")[];
			overrideEnabled?: boolean;
		};
		McpInvalidEntry: {
			kind: "invalid";
			name: string;
			scope: "global" | "project";
			problem: string;
			enabled: boolean;
			overrideKeys?: ("enabled" | "exposure" | "toolExposure")[];
		};
		McpReach: {
			autoEnableCodemode: {
				global?: boolean;
				project?: boolean;
			};
			codemodeDefault: boolean;
			codemodeDisabled: boolean;
			toolSearchDisabled: boolean;
			unreachable: components["schemas"]["McpUnreachable"][];
		};
		McpUnreachable: {
			name: string;
			exposures: ("codemode" | "deferred" | "direct" | "hidden")[];
		};
		McpLive: {
			sessions: number;
			servers: ({
				name: string;
				tools: number;
				toolNames: string[];
			})[];
			codemode: boolean;
			toolSearch: boolean;
		};
		SkillView: {
			name: string;
			description: string;
			filePath: string;
			dir: string;
			origin: components["schemas"]["SkillOrigin"];
			packageSource?: string;
			scope: "user" | "project";
			editable: boolean;
			root?: components["schemas"]["SkillRoot"];
			modelInvocation: boolean;
			status: components["schemas"]["SkillStatus"];
			shadowedBy?: string;
			message?: string;
			toggle: components["schemas"]["SkillToggle"];
			warnings: string[];
		};
		SkillOrigin: "home" | "user-agents" | "project-pi" | "project-agents" | "settings-path" | "package" | "extension";
		SkillRoot: "home" | "user-agents" | "project-pi" | "project-agents";
		SkillStatus: "active" | "manual" | "disabled" | "shadowed" | "invalid" | "untrusted";
		SkillToggle: "settings" | "package" | "none";
		ForeignSkillView: {
			agent: components["schemas"]["ForeignAgent"];
			scope: "user" | "project";
			folder: string;
			linked: boolean;
			name: string;
			description: string;
			filePath: string;
			warnings: string[];
		};
		ForeignAgent: "claude-code" | "codex";
		PackageView: {
			source: string;
			scope: "user" | "project";
			installedPath?: string;
		};
		ProviderDetail: {
			id: string;
			name: string;
			baseUrl?: string;
			api?: "openai-completions" | "openai-responses" | "anthropic-messages" | "google-generative-ai";
			stored: components["schemas"]["ProviderStored"];
			builtin: boolean;
			custom: boolean;
			configured: boolean;
			source?: string;
			hasKey: boolean;
			headerKeys: string[];
			auth: components["schemas"]["ProviderAuth"];
			models: components["schemas"]["ProviderModelInput"][];
			modelOverrides: {
				[key: string]: components["schemas"]["ModelOverride"];
			};
			catalog: components["schemas"]["SnapshotModel"][];
		};
		ProviderStored: {
			name?: string;
			baseUrl?: string;
			api?: "openai-completions" | "openai-responses" | "anthropic-messages" | "google-generative-ai";
			compat?: components["schemas"]["ReasoningCompat"];
		};
		ReasoningCompat: {
			thinkingFormat?: "openai" | "openrouter" | "deepseek" | "together" | "baseten" | "zai" | "qwen" | "chat-template" | "qwen-chat-template" | "string-thinking" | "ant-ling";
			supportsReasoningEffort?: boolean;
			thinkingTokenBudgetField?: "thinking_token_budget" | "thinking_budget" | "thinking_budget_tokens";
			requiresReasoningContentOnAssistantMessages?: boolean;
			forceAdaptiveThinking?: boolean;
		} & {
			[key: string]: unknown;
		};
		ProviderModelInput: {
			id: string;
			name?: string;
			api?: "openai-completions" | "openai-responses" | "anthropic-messages" | "google-generative-ai";
			baseUrl?: string;
			reasoning?: boolean;
			thinkingLevelMap?: components["schemas"]["ThinkingLevelMap"];
			compat?: components["schemas"]["ReasoningCompat"];
			input?: ("text" | "image")[];
			contextWindow?: number;
			maxTokens?: number;
			cost?: components["schemas"]["ProviderModelCost"];
		};
		ThinkingLevelMap: {
			off?: string | null;
			minimal?: string | null;
			low?: string | null;
			medium?: string | null;
			high?: string | null;
			xhigh?: string | null;
			max?: string | null;
		};
		ProviderModelCost: {
			input: number;
			output: number;
			cacheRead: number;
			cacheWrite: number;
		};
		ModelOverride: {
			name?: string;
			api?: "openai-completions" | "openai-responses" | "anthropic-messages" | "google-generative-ai";
			baseUrl?: string;
			reasoning?: boolean;
			thinkingLevelMap?: components["schemas"]["ThinkingLevelMap"];
			compat?: components["schemas"]["ReasoningCompat"];
			input?: ("text" | "image")[];
			contextWindow?: number;
			maxTokens?: number;
			cost?: components["schemas"]["ProviderModelCost"];
		};
		ProviderImportResult: {
			models: components["schemas"]["ProviderModelInput"][];
		};
		ProviderImportInput: {
			providerId?: string;
			baseUrl: string;
			api: "openai-completions" | "openai-responses" | "anthropic-messages" | "google-generative-ai";
			apiKey?: string;
		};
		ProviderTestResult: {
			message: string;
		};
		ProviderTestInput: {
			providerId?: string;
			name?: string;
			baseUrl?: "" | string;
			api?: "openai-completions" | "openai-responses" | "anthropic-messages" | "google-generative-ai";
			apiKey?: string;
			headers?: {
				[key: string]: string;
			};
			compat?: components["schemas"]["ReasoningCompat"];
			level?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
			model?: components["schemas"]["ProviderModelInput"];
		};
		ProviderLoginSnapshot: {
			providerId: string;
			type: components["schemas"]["ProviderLoginType"];
			status: "running" | "succeeded" | "failed" | "cancelled";
			notices: components["schemas"]["ProviderLoginNotice"][];
			authUrl?: {
				url: string;
				instructions?: string;
			};
			deviceCode?: {
				userCode: string;
				verificationUri: string;
				intervalSeconds?: number;
				expiresInSeconds?: number;
			};
			question?: components["schemas"]["ProviderLoginQuestion"];
			error?: string;
		};
		ProviderLoginType: "api_key" | "oauth";
		ProviderLoginNotice: {
			message: string;
			links?: ({
				url: string;
				label?: string;
			})[];
		};
		ProviderLoginQuestion: {
			id: string;
			kind: "text" | "secret" | "select" | "manual_code";
			message: string;
			placeholder?: string;
			options?: ({
				id: string;
				label: string;
				description?: string;
			})[];
		};
		ProviderLoginInput: {
			type: components["schemas"]["ProviderLoginType"];
		};
		ProviderLoginAnswer: {
			promptId: string;
			value: string;
		};
		ProviderInput: {
			id: string;
			name?: string;
			baseUrl?: "" | string;
			api?: "" | ("openai-completions" | "openai-responses" | "anthropic-messages" | "google-generative-ai");
			apiKey?: string;
			headers?: {
				[key: string]: string;
			};
			compat?: components["schemas"]["ReasoningCompat"];
			models?: components["schemas"]["ProviderModelInput"][];
			modelOverrides?: {
				[key: string]: components["schemas"]["ModelOverride"];
			};
		};
		McpRegistrySearch: {
			items: components["schemas"]["McpRegistryItem"][];
			nextCursor?: string;
		};
		McpRegistryItem: {
			source: components["schemas"]["McpRegistrySource"];
			name: string;
			title: string;
			description: string;
			version: string;
			repositoryUrl?: string;
			kinds: string[];
		};
		McpRegistrySource: "official" | "github";
		McpRegistryDetail: {
			name: string;
			title: string;
			description: string;
			repositoryUrl?: string;
			options: components["schemas"]["McpRegistryOption"][];
			note?: string;
		};
		McpRegistryOption: {
			id: string;
			label: string;
			supported: boolean;
			reason?: string;
			entry?: components["schemas"]["McpRegistryEntry"];
			inputs: components["schemas"]["McpRegistryInput"][];
		};
		McpRegistryEntry: ({
			transport: "stdio";
			command: string;
			args: string[];
			env: {
				[key: string]: string;
			};
		}) | ({
			transport: "http";
			url: string;
			headers: {
				[key: string]: string;
			};
		});
		McpRegistryInput: {
			key: string;
			target: "env" | "header" | "arg" | "url";
			name: string;
			description?: string;
			required: boolean;
			secret: boolean;
			default?: string;
			choices?: string[];
		};
		McpServerDetail: components["schemas"]["McpServerEntryDetail"] | components["schemas"]["McpOverrideEntry"] | components["schemas"]["McpInvalidEntryDetail"];
		McpServerEntryDetail: components["schemas"]["McpServerEntry"] & ({
			command?: string;
			args?: string[];
			envKeys: string[];
			cwd?: string;
			url?: string;
			headerKeys: string[];
			toolExposure?: {
				[key: string]: "codemode" | "deferred" | "direct" | "hidden";
			};
			oauth?: components["schemas"]["McpOAuth"];
			oauthClientSecret: boolean;
			authProvider?: string;
			credentialsStored: boolean;
			log: string[];
		});
		McpOAuth: {
			clientId?: string;
			callbackPort?: number;
			callbackUrl?: string;
			scope?: string;
			clientName?: string;
			clientRegistration?: "dcr" | "cimd";
			authServerMetadataUrl?: string;
		};
		McpInvalidEntryDetail: components["schemas"]["McpInvalidEntry"] & ({
			command?: string;
			args?: string[];
			envKeys: string[];
			cwd?: string;
			url?: string;
			headerKeys: string[];
			transport?: "stdio" | "http";
			description?: string;
			exposure?: "codemode" | "deferred" | "direct" | "hidden";
			timeout?: number;
			toolExposure?: {
				[key: string]: "codemode" | "deferred" | "direct" | "hidden";
			};
			oauth?: components["schemas"]["McpOAuth"];
			oauthClientSecret: boolean;
			authProvider?: string;
		});
		McpRaw: {
			text: string;
		};
		McpServerInput: ({
			name: string;
			scope: "global" | "project";
			description?: string;
			exposure?: "codemode" | "deferred" | "direct" | "hidden";
			toolExposure?: {
				[key: string]: "codemode" | "deferred" | "direct" | "hidden";
			};
			timeout?: number;
			transport: "stdio";
			command: string;
			args?: string[];
			env?: {
				[key: string]: string;
			};
			cwd?: string;
		}) | ({
			name: string;
			scope: "global" | "project";
			description?: string;
			exposure?: "codemode" | "deferred" | "direct" | "hidden";
			toolExposure?: {
				[key: string]: "codemode" | "deferred" | "direct" | "hidden";
			};
			timeout?: number;
			transport: "http";
			url: string;
			headers?: {
				[key: string]: string;
			};
			oauth?: components["schemas"]["McpOAuthInput"];
			authProvider?: string;
		});
		McpOAuthInput: {
			clientId?: string;
			clientSecret?: string;
			callbackPort?: number;
			callbackUrl?: string;
			scope?: string;
			clientName?: string;
			clientRegistration?: "dcr" | "cimd";
			authServerMetadataUrl?: string;
		};
		McpEnabledInput: {
			scope: "global" | "project";
			name: string;
			enabled: boolean;
		};
		McpInProjectInput: {
			name: string;
			value: "inherit" | "on" | "off";
		};
		McpAutoEnableInput: {
			scope: "global" | "project";
			enabled: boolean;
		};
		SkillImportReport: {
			stageId: string;
			source: string;
			candidates: components["schemas"]["SkillImportCandidate"][];
			packageOption: {
				available: boolean;
				source?: string;
				reason: string;
			};
		};
		SkillImportCandidate: {
			name: string;
			dir: string;
			description: string;
			files: ({
				path: string;
				size: number;
			})[];
			scripts: string[];
			errors: components["schemas"]["SkillImportIssue"][];
			warnings: components["schemas"]["SkillImportIssue"][];
			removed: string[];
			modelInvocation: boolean;
			existing: {
				global: boolean;
				project: boolean;
			};
		};
		SkillImportIssue: {
			code: string;
			message: string;
			path?: string;
		};
		SkillImportSource: {
			/** A skills install command, a GitHub or GitLab URL, a git URL or owner/repo */
			input: string;
		};
		SkillImportCommit: {
			skills: string[];
			target: "global" | "project";
			replace?: string[];
			mode?: "copy" | "package";
		};
		SkillFile: {
			root: components["schemas"]["SkillRoot"];
			name: string;
			filePath: string;
			description: string;
			body: string;
			modelInvocation: boolean;
			license?: string;
			compatibility?: string;
			metadata?: {
				[key: string]: string;
			};
			fields: components["schemas"]["SkillField"][];
			bodyWarnings: string[];
			parseError?: string;
			raw?: string;
		};
		SkillField: {
			key: string;
			owner: "pi" | "spec" | "claude-code" | "unknown";
			value: string;
		};
		SkillDocument: {
			name: string;
			filePath: string;
			description: string;
			body: string;
			modelInvocation: boolean;
			license?: string;
			compatibility?: string;
			metadata?: {
				[key: string]: string;
			};
			fields: components["schemas"]["SkillField"][];
			bodyWarnings: string[];
			parseError?: string;
			raw?: string;
		};
		SkillBundleList: {
			files: components["schemas"]["SkillBundleEntry"][];
			skipped: number;
		};
		SkillBundleEntry: {
			path: string;
			size: number;
			text: boolean;
		};
		SkillBundleFile: {
			path: string;
			text: string;
		};
		SkillBundleFileInput: {
			text: string;
		};
		SkillInput: {
			description: string;
			body: string;
			modelInvocation: boolean;
			license?: string;
			compatibility?: string;
			metadata?: {
				[key: string]: string;
			};
		};
		SkillEnabledInput: {
			filePath: string;
			enabled: boolean;
		};
		SkillFolderInput: {
			folder: string;
		};
		PackageResources: {
			extensions: ({
				path: string;
				name: string;
				enabled: boolean;
			})[];
			skills: ({
				path: string;
				name: string;
				enabled: boolean;
			})[];
			prompts: ({
				path: string;
				name: string;
				enabled: boolean;
			})[];
			themes: ({
				path: string;
				name: string;
				enabled: boolean;
			})[];
		};
	};
}

interface operations {
	health: {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
		requestBody?: never;
		responses: {
			/** Server is running */
			200: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": {
						status: "ok";
					};
				};
			};
		};
	};
	/** Whether the agent home holds a usable model, so a turn can run */
	readiness: {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
		requestBody?: never;
		responses: {
			/** What the engine reports for the home it was given */
			200: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["Readiness"];
				};
			};
		};
	};
	listSessions: {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
		requestBody?: never;
		responses: {
			/** Every session pi recorded in the home, split into chats and projects */
			200: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["SessionList"];
				};
			};
		};
	};
	/** Move a chat's session file to Epsilon's trash, where it can be restored */
	deleteSession: {
		parameters: {
			query?: never;
			header?: never;
			path: {
				id: string;
			};
			cookie?: never;
		};
		requestBody?: never;
		responses: {
			/** Session file moved to Epsilon's trash */
			204: {
				headers: {
					[name: string]: unknown;
				};
				content?: never;
			};
			/** No such session in the home */
			404: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["SessionError"];
				};
			};
			/** A live agent still holds this session */
			409: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["SessionError"];
				};
			};
		};
	};
	/** Take a project off the list by moving every chat recorded in it to Epsilon's trash; the folder and its trust stay */
	removeProject: {
		parameters: {
			query: {
				path: string;
			};
			header?: never;
			path?: never;
			cookie?: never;
		};
		requestBody?: never;
		responses: {
			/** How many chats were moved to the trash */
			200: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["RemovedProject"];
				};
			};
			/** No chat is recorded in that folder */
			404: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["SessionError"];
				};
			};
			/** A chat in the project is still working */
			409: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["SessionError"];
				};
			};
		};
	};
	/** Fork a session's history into a trusted project and remove the original */
	moveSession: {
		parameters: {
			query?: never;
			header?: never;
			path: {
				id: string;
			};
			cookie?: never;
		};
		requestBody: {
			content: {
				"application/json": components["schemas"]["MoveSessionInput"];
			};
		};
		responses: {
			/** The session in its new folder, under a new id */
			200: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["MovedSession"];
				};
			};
			/** The folder cannot hold the session */
			400: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["SessionError"];
				};
			};
			/** No such session in the home */
			404: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["SessionError"];
				};
			};
			/** A live agent still holds this session */
			409: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["SessionError"];
				};
			};
		};
	};
	/** pi's fork: a new session holding the chat up to the message picked, and the original file unchanged */
	forkSession: {
		parameters: {
			query?: never;
			header?: never;
			path: {
				id: string;
			};
			cookie?: never;
		};
		requestBody: {
			content: {
				"application/json": components["schemas"]["ForkSessionInput"];
			};
		};
		responses: {
			/** The new session's id, which is where the chat continues */
			200: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["CopiedSession"];
				};
			};
			/** pi refused the fork */
			400: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["SessionError"];
				};
			};
			/** No such session in the home */
			404: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["SessionError"];
				};
			};
			/** A live agent still holds this session */
			409: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["SessionError"];
				};
			};
		};
	};
	/** Clone a chat: a new session holding the branch up to where this one is now, and the original unchanged */
	cloneSession: {
		parameters: {
			query?: never;
			header?: never;
			path: {
				id: string;
			};
			cookie?: never;
		};
		requestBody?: never;
		responses: {
			/** The new session's id, which is where the chat continues */
			200: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["CopiedSession"];
				};
			};
			/** pi refused the clone */
			400: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["SessionError"];
				};
			};
			/** No such session in the home */
			404: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["SessionError"];
				};
			};
			/** A live agent still holds this session */
			409: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["SessionError"];
				};
			};
		};
	};
	/** Copy a JSONL session file in as a new chat, in the chats folder or the project named */
	importSession: {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
		requestBody: {
			content: {
				"application/json": components["schemas"]["ImportSessionInput"];
			};
		};
		responses: {
			/** The imported session's id, which is where the page opens it */
			200: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["CopiedSession"];
				};
			};
			/** The file is not a session pi can read, or the folder cannot hold it */
			400: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["SessionError"];
				};
			};
		};
	};
	/** Set the display name of a chat */
	renameSession: {
		parameters: {
			query?: never;
			header?: never;
			path: {
				id: string;
			};
			cookie?: never;
		};
		requestBody: {
			content: {
				"application/json": components["schemas"]["RenameSessionInput"];
			};
		};
		responses: {
			/** The session's new name */
			200: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["RenamedSession"];
				};
			};
			/** No such session in the home */
			404: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["SessionError"];
				};
			};
		};
	};
	/** Pin or unpin a chat in the session list */
	pinSession: {
		parameters: {
			query?: never;
			header?: never;
			path: {
				id: string;
			};
			cookie?: never;
		};
		requestBody: {
			content: {
				"application/json": components["schemas"]["PinSessionInput"];
			};
		};
		responses: {
			/** The pin file now holds this decision */
			204: {
				headers: {
					[name: string]: unknown;
				};
				content?: never;
			};
			/** No such session in the home */
			404: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["SessionError"];
				};
			};
		};
	};
	/** Write one chat's transcript as an HTML page or a JSONL file, through the live engine */
	exportSession: {
		parameters: {
			query?: never;
			header?: never;
			path: {
				id: string;
			};
			cookie?: never;
		};
		requestBody: {
			content: {
				"application/json": components["schemas"]["ExportSessionInput"];
			};
		};
		responses: {
			/** The exported file's bytes, and the name and type to save them under */
			200: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["ExportedSession"];
				};
			};
			/** pi could not write the export */
			400: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["SessionError"];
				};
			};
			/** No such session in the home */
			404: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["SessionError"];
				};
			};
		};
	};
	/** Every chat in Epsilon's own trash, newest deletion first */
	listTrashedSessions: {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
		requestBody?: never;
		responses: {
			/** Deleted chats that can be restored */
			200: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["TrashList"];
				};
			};
		};
	};
	/** Put a deleted chat's file back where pi's list finds it again */
	restoreTrashedSession: {
		parameters: {
			query?: never;
			header?: never;
			path: {
				id: string;
			};
			cookie?: never;
		};
		requestBody?: never;
		responses: {
			/** The chat is back at its old path */
			200: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["RestoredSession"];
				};
			};
			/** The trash holds no such chat */
			404: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["SessionError"];
				};
			};
			/** A session file already sits at that path */
			409: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["SessionError"];
				};
			};
		};
	};
	/** Destroy a trashed chat for good; a restore is impossible afterwards */
	purgeTrashedSession: {
		parameters: {
			query?: never;
			header?: never;
			path: {
				id: string;
			};
			cookie?: never;
		};
		requestBody?: never;
		responses: {
			/** The file and its record are gone */
			204: {
				headers: {
					[name: string]: unknown;
				};
				content?: never;
			};
			/** The trash holds no such chat */
			404: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["SessionError"];
				};
			};
		};
	};
	projectStatus: {
		parameters: {
			query: {
				path: string;
			};
			header?: never;
			path?: never;
			cookie?: never;
		};
		requestBody?: never;
		responses: {
			/** The folder, and whether pi trusts it */
			200: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["ProjectStatus"];
				};
			};
			/** The path is not a folder that can be a project */
			400: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["Problem"];
				};
			};
		};
	};
	/** Trust a folder in pi's trust.json, through pi's own store */
	trustProject: {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
		requestBody: {
			content: {
				"application/json": components["schemas"]["ProjectPathInput"];
			};
		};
		responses: {
			/** The folder, now trusted */
			200: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["ProjectStatus"];
				};
			};
			/** The path is not a folder that can be a project */
			400: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["Problem"];
				};
			};
		};
	};
	browseFolders: {
		parameters: {
			query?: {
				path?: string;
				hidden?: "true" | "false";
			};
			header?: never;
			path?: never;
			cookie?: never;
		};
		requestBody?: never;
		responses: {
			/** The subfolders of one folder, the operator's home by default */
			200: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["FolderListing"];
				};
			};
			/** The path is not a readable folder */
			400: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["Problem"];
				};
			};
		};
	};
	/** Create one folder inside an existing folder */
	createFolder: {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
		requestBody: {
			content: {
				"application/json": components["schemas"]["NewFolderInput"];
			};
		};
		responses: {
			/** The new folder's real path */
			200: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["CreatedFolder"];
				};
			};
			/** The parent or the folder name is invalid */
			400: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["Problem"];
				};
			};
		};
	};
	/** Providers, default model, MCP servers with what they can reach, skills and packages from the agent home, plus a trusted project's .pi when one is named */
	readSettings: {
		parameters: {
			query?: {
				/** A trusted project folder. Absent means the agent home alone */
				project?: string;
			};
			header?: never;
			path?: never;
			cookie?: never;
		};
		requestBody?: never;
		responses: {
			/** The configuration Epsilon runs on */
			200: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["SettingsSnapshot"];
				};
			};
			/** The project is not a trusted folder */
			400: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["Problem"];
				};
			};
		};
	};
	/** Write the agent-wide compaction and retry limits and the model scope; a project can still override them */
	setAgentLimits: {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
		requestBody: {
			content: {
				"application/json": components["schemas"]["AgentLimits"];
			};
		};
		responses: {
			/** pi's settings.json now holds these limits */
			204: {
				headers: {
					[name: string]: unknown;
				};
				content?: never;
			};
			/** settings.json could not be parsed, so nothing was written */
			400: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["Problem"];
				};
			};
		};
	};
	setDefaultModel: {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
		requestBody: {
			content: {
				"application/json": components["schemas"]["DefaultModel"];
			};
		};
		responses: {
			/** pi's settings.json now names this provider and model */
			204: {
				headers: {
					[name: string]: unknown;
				};
				content?: never;
			};
			/** The model is not one Epsilon can run */
			400: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["Problem"];
				};
			};
		};
	};
	/** The editable detail of one provider, with header names but no secrets */
	readProvider: {
		parameters: {
			query?: never;
			header?: never;
			path: {
				id: string;
			};
			cookie?: never;
		};
		requestBody?: never;
		responses: {
			/** Provider fields, declared models, overrides and the live catalog */
			200: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["ProviderDetail"];
				};
			};
			/** The provider could not be read */
			400: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["Problem"];
				};
			};
			/** No provider or models.json entry with this id */
			404: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["Problem"];
				};
			};
		};
	};
	deleteProvider: {
		parameters: {
			query?: never;
			header?: never;
			path: {
				id: string;
			};
			cookie?: never;
		};
		requestBody?: never;
		responses: {
			/** The provider entry and its stored credential are gone from the agent home */
			204: {
				headers: {
					[name: string]: unknown;
				};
				content?: never;
			};
			/** models.json could not be written */
			400: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["Problem"];
				};
			};
		};
	};
	/** Read a provider's model list; OpenAI-style and Anthropic endpoints only */
	importProviderModels: {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
		requestBody: {
			content: {
				"application/json": components["schemas"]["ProviderImportInput"];
			};
		};
		responses: {
			/** Model ids returned by the provider */
			200: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["ProviderImportResult"];
				};
			};
			/** The endpoint refused or returned no model list */
			400: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["Problem"];
				};
			};
		};
	};
	/** Try a provider draft's model without writing models.json */
	testProvider: {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
		requestBody: {
			content: {
				"application/json": components["schemas"]["ProviderTestInput"];
			};
		};
		responses: {
			/** The draft reached its model */
			200: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["ProviderTestResult"];
				};
			};
			/** The provider refused or could not be reached */
			400: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["Problem"];
				};
			};
		};
	};
	/** What this provider's sign-in reports and what it waits for, as often as the page polls it */
	readProviderLogin: {
		parameters: {
			query?: never;
			header?: never;
			path: {
				id: string;
			};
			cookie?: never;
		};
		requestBody?: never;
		responses: {
			/** The sign-in's current state */
			200: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["ProviderLoginSnapshot"];
				};
			};
			/** Nothing was signed in for this provider */
			404: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["Problem"];
				};
			};
		};
	};
	/** Start pi's sign-in for a provider and answer with the flow's first state */
	startProviderLogin: {
		parameters: {
			query?: never;
			header?: never;
			path: {
				id: string;
			};
			cookie?: never;
		};
		requestBody: {
			content: {
				"application/json": components["schemas"]["ProviderLoginInput"];
			};
		};
		responses: {
			/** The sign-in pi started; poll it for what it reports and what it asks */
			200: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["ProviderLoginSnapshot"];
				};
			};
			/** pi does not know this provider, or it offers no such sign-in */
			400: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["Problem"];
				};
			};
		};
	};
	/** Answer the question a sign-in waits on. An answer to a question that moved on is ignored */
	answerProviderLogin: {
		parameters: {
			query?: never;
			header?: never;
			path: {
				id: string;
			};
			cookie?: never;
		};
		requestBody: {
			content: {
				"application/json": components["schemas"]["ProviderLoginAnswer"];
			};
		};
		responses: {
			/** The sign-in after the answer */
			200: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["ProviderLoginSnapshot"];
				};
			};
			/** Nothing was signed in for this provider */
			404: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["Problem"];
				};
			};
		};
	};
	/** Cancel a sign-in; pi keeps no credential from a cancelled flow */
	cancelProviderLogin: {
		parameters: {
			query?: never;
			header?: never;
			path: {
				id: string;
			};
			cookie?: never;
		};
		requestBody?: never;
		responses: {
			/** The sign-in, cancelled */
			200: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["ProviderLoginSnapshot"];
				};
			};
			/** Nothing was signed in for this provider */
			404: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["Problem"];
				};
			};
		};
	};
	/** Remove the credential auth.json holds, leaving the models.json entry in place */
	logoutProvider: {
		parameters: {
			query?: never;
			header?: never;
			path: {
				id: string;
			};
			cookie?: never;
		};
		requestBody?: never;
		responses: {
			/** auth.json no longer holds a credential for this provider; live engines reloaded */
			204: {
				headers: {
					[name: string]: unknown;
				};
				content?: never;
			};
			/** There was nothing stored to remove */
			400: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["Problem"];
				};
			};
		};
	};
	/** Add or change a provider entry in models.json */
	writeProvider: {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
		requestBody: {
			content: {
				"application/json": components["schemas"]["ProviderInput"];
			};
		};
		responses: {
			/** models.json now carries the provider, and live engines reloaded */
			204: {
				headers: {
					[name: string]: unknown;
				};
				content?: never;
			};
			/** The provider entry was refused */
			400: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["Problem"];
				};
			};
		};
	};
	/** Search or browse the MCP server registry, twenty servers a page */
	searchMcpRegistry: {
		parameters: {
			query: {
				source: components["schemas"]["McpRegistrySource"];
				q?: string;
				cursor?: string;
			};
			header?: never;
			path?: never;
			cookie?: never;
		};
		requestBody?: never;
		responses: {
			/** A page of servers and the cursor of the next one */
			200: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["McpRegistrySearch"];
				};
			};
			/** The registry did not answer */
			502: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["Problem"];
				};
			};
		};
	};
	/** One registry server with the ways to install it, as mcp.json entries */
	readMcpRegistryServer: {
		parameters: {
			query: {
				source: components["schemas"]["McpRegistrySource"];
				name: string;
			};
			header?: never;
			path?: never;
			cookie?: never;
		};
		requestBody?: never;
		responses: {
			/** The server and its install options */
			200: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["McpRegistryDetail"];
				};
			};
			/** The registry has no server of this name */
			404: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["Problem"];
				};
			};
			/** The registry did not answer */
			502: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["Problem"];
				};
			};
		};
	};
	/** The editable detail of one MCP server, with variable, header and secret names but no values, plus its log tail */
	readMcpServer: {
		parameters: {
			query?: {
				/** A trusted project folder. Absent means the agent home alone */
				project?: string;
			};
			header?: never;
			path: {
				scope: "global" | "project";
				name: string;
			};
			cookie?: never;
		};
		requestBody?: never;
		responses: {
			/** The server entry, its target, the names of its stored values and its log */
			200: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["McpServerDetail"];
				};
			};
			/** mcp.json could not be read */
			400: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["Problem"];
				};
			};
			/** No server with this name in that file */
			404: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["Problem"];
				};
			};
		};
	};
	/** Remove an MCP server, or a project override, from its file */
	deleteMcpServer: {
		parameters: {
			query?: {
				/** A trusted project folder. Absent means the agent home alone */
				project?: string;
			};
			header?: never;
			path: {
				scope: "global" | "project";
				name: string;
			};
			cookie?: never;
		};
		requestBody?: never;
		responses: {
			/** The entry is gone from its file */
			204: {
				headers: {
					[name: string]: unknown;
				};
				content?: never;
			};
			/** The file could not be written */
			400: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["Problem"];
				};
			};
		};
	};
	/** One server's entry in its mcp.json as JSON text. Stored env, header and OAuth secret values are replaced by the text <stored> */
	readMcpRaw: {
		parameters: {
			query?: {
				/** A trusted project folder. Absent means the agent home alone */
				project?: string;
			};
			header?: never;
			path: {
				scope: "global" | "project";
				name: string;
			};
			cookie?: never;
		};
		requestBody?: never;
		responses: {
			/** The entry as JSON text */
			200: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["McpRaw"];
				};
			};
			/** mcp.json could not be read */
			400: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["Problem"];
				};
			};
			/** No server with this name in that file */
			404: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["Problem"];
				};
			};
		};
	};
	/** Replace one server's entry from JSON text. Each <stored> value keeps what the file holds at that path; nothing else in the file changes */
	writeMcpRaw: {
		parameters: {
			query?: {
				/** A trusted project folder. Absent means the agent home alone */
				project?: string;
			};
			header?: never;
			path: {
				scope: "global" | "project";
				name: string;
			};
			cookie?: never;
		};
		requestBody: {
			content: {
				"application/json": components["schemas"]["McpRaw"];
			};
		};
		responses: {
			/** The file now carries the entry, and live engines reloaded */
			204: {
				headers: {
					[name: string]: unknown;
				};
				content?: never;
			};
			/** The text was refused and nothing was written */
			400: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["Problem"];
				};
			};
		};
	};
	/** Add or change an MCP server in the file its scope names. A save pi would skip is refused */
	writeMcpServer: {
		parameters: {
			query?: {
				/** A trusted project folder. Absent means the agent home alone */
				project?: string;
			};
			header?: never;
			path?: never;
			cookie?: never;
		};
		requestBody: {
			content: {
				"application/json": components["schemas"]["McpServerInput"];
			};
		};
		responses: {
			/** The file now carries the server, and live engines reloaded */
			204: {
				headers: {
					[name: string]: unknown;
				};
				content?: never;
			};
			/** The server entry was refused */
			400: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["Problem"];
				};
			};
		};
	};
	/** Turn one server on or off in its own file. Off writes `enabled: false`; on removes the key */
	setMcpServerEnabled: {
		parameters: {
			query?: {
				/** A trusted project folder. Absent means the agent home alone */
				project?: string;
			};
			header?: never;
			path?: never;
			cookie?: never;
		};
		requestBody: {
			content: {
				"application/json": components["schemas"]["McpEnabledInput"];
			};
		};
		responses: {
			/** The file now carries the state, and live engines reloaded */
			204: {
				headers: {
					[name: string]: unknown;
				};
				content?: never;
			};
			/** The change was refused */
			400: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["Problem"];
				};
			};
		};
	};
	/** Set a global server's state in this project: inherit the global setting, or write an override */
	setMcpServerInProject: {
		parameters: {
			query?: {
				/** A trusted project folder. Absent means the agent home alone */
				project?: string;
			};
			header?: never;
			path?: never;
			cookie?: never;
		};
		requestBody: {
			content: {
				"application/json": components["schemas"]["McpInProjectInput"];
			};
		};
		responses: {
			/** The project file now carries the override, and live engines reloaded */
			204: {
				headers: {
					[name: string]: unknown;
				};
				content?: never;
			};
			/** The change was refused */
			400: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["Problem"];
				};
			};
		};
	};
	/** Let a connecting codemode server activate codemode in its file. On removes the key, which is pi's default */
	setMcpAutoEnableCodemode: {
		parameters: {
			query?: {
				/** A trusted project folder. Absent means the agent home alone */
				project?: string;
			};
			header?: never;
			path?: never;
			cookie?: never;
		};
		requestBody: {
			content: {
				"application/json": components["schemas"]["McpAutoEnableInput"];
			};
		};
		responses: {
			/** The file now carries the setting, and live engines reloaded */
			204: {
				headers: {
					[name: string]: unknown;
				};
				content?: never;
			};
			/** The change was refused */
			400: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["Problem"];
				};
			};
		};
	};
	/** Stage the files of a picked folder, or one archive, and report the skills in it */
	stageSkillUpload: {
		parameters: {
			query?: {
				/** A trusted project folder. Absent means the agent home alone */
				project?: string;
			};
			header?: never;
			path?: never;
			cookie?: never;
		};
		requestBody: {
			content: {
				"multipart/form-data": {
					/** Either the files of one picked folder, each named by its path inside that folder, or a single .zip, .tar, .tar.gz or .tgz archive */
					files?: string[];
				};
			};
		};
		responses: {
			/** The staged skills and what is wrong with each */
			200: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["SkillImportReport"];
				};
			};
			/** The upload was refused */
			400: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["Problem"];
				};
			};
		};
	};
	/** Fetch a pasted install command or repository address into staging and report its skills */
	stageSkillSource: {
		parameters: {
			query?: {
				/** A trusted project folder. Absent means the agent home alone */
				project?: string;
			};
			header?: never;
			path?: never;
			cookie?: never;
		};
		requestBody: {
			content: {
				"application/json": components["schemas"]["SkillImportSource"];
			};
		};
		responses: {
			/** The staged skills and what is wrong with each */
			200: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["SkillImportReport"];
				};
			};
			/** The source was refused or could not be fetched */
			400: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["Problem"];
				};
			};
		};
	};
	/** Install the chosen skills of a staged import, and reload live engines */
	commitSkillImport: {
		parameters: {
			query?: {
				/** A trusted project folder. Absent means the agent home alone */
				project?: string;
			};
			header?: never;
			path: {
				stageId: string;
			};
			cookie?: never;
		};
		requestBody: {
			content: {
				"application/json": components["schemas"]["SkillImportCommit"];
			};
		};
		responses: {
			/** The skills are installed and the stage is deleted */
			204: {
				headers: {
					[name: string]: unknown;
				};
				content?: never;
			};
			/** The import was refused */
			400: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["Problem"];
				};
			};
			/** The staged import has expired */
			404: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["Problem"];
				};
			};
		};
	};
	discardSkillImport: {
		parameters: {
			query?: never;
			header?: never;
			path: {
				stageId: string;
			};
			cookie?: never;
		};
		requestBody?: never;
		responses: {
			/** The staged import is deleted */
			204: {
				headers: {
					[name: string]: unknown;
				};
				content?: never;
			};
			/** The stage could not be deleted */
			400: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["Problem"];
				};
			};
		};
	};
	/** One skill file for the edit form: managed fields, the fields it keeps untouched, or the raw text when the frontmatter does not parse */
	readSkill: {
		parameters: {
			query?: {
				/** A trusted project folder. Absent means the agent home alone */
				project?: string;
			};
			header?: never;
			path: {
				root: components["schemas"]["SkillRoot"];
				name: string;
			};
			cookie?: never;
		};
		requestBody?: never;
		responses: {
			/** The skill file */
			200: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["SkillFile"];
				};
			};
			/** The root or project cannot be used */
			400: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["Problem"];
				};
			};
			/** No such skill in that root */
			404: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["Problem"];
				};
			};
		};
	};
	/** Create or update a skill in an editable root. Frontmatter keys the panel does not manage are kept; a file that does not parse is refused */
	writeSkill: {
		parameters: {
			query?: {
				/** A trusted project folder. Absent means the agent home alone */
				project?: string;
			};
			header?: never;
			path: {
				root: components["schemas"]["SkillRoot"];
				name: string;
			};
			cookie?: never;
		};
		requestBody: {
			content: {
				"application/json": components["schemas"]["SkillInput"];
			};
		};
		responses: {
			/** The skill's SKILL.md is written, and live engines reloaded */
			204: {
				headers: {
					[name: string]: unknown;
				};
				content?: never;
			};
			/** The skill was refused */
			400: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["Problem"];
				};
			};
		};
	};
	deleteSkill: {
		parameters: {
			query?: {
				/** A trusted project folder. Absent means the agent home alone */
				project?: string;
			};
			header?: never;
			path: {
				root: components["schemas"]["SkillRoot"];
				name: string;
			};
			cookie?: never;
		};
		requestBody?: never;
		responses: {
			/** The skill directory is gone */
			204: {
				headers: {
					[name: string]: unknown;
				};
				content?: never;
			};
			/** The skill could not be removed */
			400: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["Problem"];
				};
			};
		};
	};
	/** The parsed SKILL.md of any skill the inventory lists, looked up by its file path, for display only. A path the inventory does not list is refused */
	readListedSkill: {
		parameters: {
			query: {
				/** A trusted project folder. Absent means the agent home alone */
				project?: string;
				/** The SKILL.md path of a skill the inventory lists */
				filePath: string;
			};
			header?: never;
			path?: never;
			cookie?: never;
		};
		requestBody?: never;
		responses: {
			/** The skill file */
			200: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["SkillDocument"];
				};
			};
			/** The project cannot be used */
			400: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["Problem"];
				};
			};
			/** No listed skill has that path */
			404: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["Problem"];
				};
			};
		};
	};
	/** Every file in the folder of a skill the inventory lists, for display. A path the inventory does not list is refused */
	listListedSkillFiles: {
		parameters: {
			query: {
				/** A trusted project folder. Absent means the agent home alone */
				project?: string;
				/** The SKILL.md path of a skill the inventory lists */
				filePath: string;
			};
			header?: never;
			path?: never;
			cookie?: never;
		};
		requestBody?: never;
		responses: {
			/** The files, sorted by path */
			200: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["SkillBundleList"];
				};
			};
			/** The skill folder cannot be listed */
			400: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["Problem"];
				};
			};
			/** No listed skill has that path */
			404: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["Problem"];
				};
			};
		};
	};
	/** The text of one file in the folder of a skill the inventory lists, SKILL.md included. Binary files, files over 1 MB and unsafe paths are refused */
	readListedSkillFile: {
		parameters: {
			query: {
				/** A trusted project folder. Absent means the agent home alone */
				project?: string;
				/** The SKILL.md path of a skill the inventory lists */
				filePath: string;
				/** The file's path inside the skill folder, with / between folders */
				path: string;
			};
			header?: never;
			path?: never;
			cookie?: never;
		};
		requestBody?: never;
		responses: {
			/** The file's text */
			200: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["SkillBundleFile"];
				};
			};
			/** The file cannot be read */
			400: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["Problem"];
				};
			};
			/** No listed skill has that path */
			404: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["Problem"];
				};
			};
		};
	};
	/** The exact text of one editable skill's SKILL.md, frontmatter included */
	readSkillRaw: {
		parameters: {
			query?: {
				/** A trusted project folder. Absent means the agent home alone */
				project?: string;
			};
			header?: never;
			path: {
				root: components["schemas"]["SkillRoot"];
				name: string;
			};
			cookie?: never;
		};
		requestBody?: never;
		responses: {
			/** The file's text */
			200: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["SkillBundleFile"];
				};
			};
			/** The file cannot be read */
			400: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["Problem"];
				};
			};
		};
	};
	/** Replace SKILL.md with the given text, byte for byte. The frontmatter must parse, its name must equal the folder name, and its description must pass the description rules */
	writeSkillRaw: {
		parameters: {
			query?: {
				/** A trusted project folder. Absent means the agent home alone */
				project?: string;
			};
			header?: never;
			path: {
				root: components["schemas"]["SkillRoot"];
				name: string;
			};
			cookie?: never;
		};
		requestBody: {
			content: {
				"application/json": components["schemas"]["SkillBundleFileInput"];
			};
		};
		responses: {
			/** SKILL.md is written, and live engines reloaded */
			204: {
				headers: {
					[name: string]: unknown;
				};
				content?: never;
			};
			/** The text was refused */
			400: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["Problem"];
				};
			};
		};
	};
	/** Every file in one editable skill folder, SKILL.md included. Symlinks are not listed; skipped counts them */
	listSkillFiles: {
		parameters: {
			query?: {
				/** A trusted project folder. Absent means the agent home alone */
				project?: string;
			};
			header?: never;
			path: {
				root: components["schemas"]["SkillRoot"];
				name: string;
			};
			cookie?: never;
		};
		requestBody?: never;
		responses: {
			/** The files, sorted by path */
			200: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["SkillBundleList"];
				};
			};
			/** The skill folder cannot be listed */
			400: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["Problem"];
				};
			};
		};
	};
	/** The text of one bundled file. SKILL.md, binary files and files over 1 MB are refused */
	readSkillBundleFile: {
		parameters: {
			query: {
				/** A trusted project folder. Absent means the agent home alone */
				project?: string;
				/** The file's path inside the skill folder, with / between folders */
				path: string;
			};
			header?: never;
			path: {
				root: components["schemas"]["SkillRoot"];
				name: string;
			};
			cookie?: never;
		};
		requestBody?: never;
		responses: {
			/** The file's text */
			200: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["SkillBundleFile"];
				};
			};
			/** The file cannot be read */
			400: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["Problem"];
				};
			};
		};
	};
	/** Create or replace one bundled text file, creating its folders. SKILL.md, unsafe paths, symlinks and a skill folder over the size limit are refused */
	writeSkillBundleFile: {
		parameters: {
			query: {
				/** A trusted project folder. Absent means the agent home alone */
				project?: string;
				/** The file's path inside the skill folder, with / between folders */
				path: string;
			};
			header?: never;
			path: {
				root: components["schemas"]["SkillRoot"];
				name: string;
			};
			cookie?: never;
		};
		requestBody: {
			content: {
				"application/json": components["schemas"]["SkillBundleFileInput"];
			};
		};
		responses: {
			/** The file is written, and live engines reloaded */
			204: {
				headers: {
					[name: string]: unknown;
				};
				content?: never;
			};
			/** The file was refused */
			400: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["Problem"];
				};
			};
		};
	};
	/** Delete one bundled file and the folders it leaves empty. SKILL.md is refused */
	deleteSkillBundleFile: {
		parameters: {
			query: {
				/** A trusted project folder. Absent means the agent home alone */
				project?: string;
				/** The file's path inside the skill folder, with / between folders */
				path: string;
			};
			header?: never;
			path: {
				root: components["schemas"]["SkillRoot"];
				name: string;
			};
			cookie?: never;
		};
		requestBody?: never;
		responses: {
			/** The file is gone, and live engines reloaded */
			204: {
				headers: {
					[name: string]: unknown;
				};
				content?: never;
			};
			/** The file could not be removed */
			400: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["Problem"];
				};
			};
		};
	};
	/** Turn one listed skill off or on with a -path entry in the skills setting. A package skill is refused: turn it off from Packages */
	setSkillEnabled: {
		parameters: {
			query?: {
				/** A trusted project folder. Absent means the agent home alone */
				project?: string;
			};
			header?: never;
			path?: never;
			cookie?: never;
		};
		requestBody: {
			content: {
				"application/json": components["schemas"]["SkillEnabledInput"];
			};
		};
		responses: {
			/** The setting is written, and live engines reloaded */
			204: {
				headers: {
					[name: string]: unknown;
				};
				content?: never;
			};
			/** The skill could not be switched */
			400: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["Problem"];
				};
			};
		};
	};
	/** Add another agent's skill folder to the skills setting, so pi loads it where it is */
	linkSkillFolder: {
		parameters: {
			query?: {
				/** A trusted project folder. Absent means the agent home alone */
				project?: string;
			};
			header?: never;
			path?: never;
			cookie?: never;
		};
		requestBody: {
			content: {
				"application/json": components["schemas"]["SkillFolderInput"];
			};
		};
		responses: {
			/** The folder is in the skills setting, and live engines reloaded */
			204: {
				headers: {
					[name: string]: unknown;
				};
				content?: never;
			};
			/** The folder could not be linked */
			400: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["Problem"];
				};
			};
		};
	};
	/** Remove another agent's skill folder from the skills setting */
	unlinkSkillFolder: {
		parameters: {
			query?: {
				/** A trusted project folder. Absent means the agent home alone */
				project?: string;
			};
			header?: never;
			path?: never;
			cookie?: never;
		};
		requestBody: {
			content: {
				"application/json": components["schemas"]["SkillFolderInput"];
			};
		};
		responses: {
			/** The folder is out of the skills setting, and live engines reloaded */
			204: {
				headers: {
					[name: string]: unknown;
				};
				content?: never;
			};
			/** The folder could not be unlinked */
			400: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["Problem"];
				};
			};
		};
	};
	/** Install a package and declare it in pi's settings, for the home or a project */
	installPackage: {
		parameters: {
			query?: {
				/** A trusted project folder. Absent means the agent home alone */
				project?: string;
			};
			header?: never;
			path?: never;
			cookie?: never;
		};
		requestBody: {
			content: {
				"application/json": {
					source: string;
					scope?: "user" | "project";
				};
			};
		};
		responses: {
			/** The package is installed and configured */
			204: {
				headers: {
					[name: string]: unknown;
				};
				content?: never;
			};
			/** The install failed */
			400: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["Problem"];
				};
			};
		};
	};
	removePackage: {
		parameters: {
			query: {
				source: string;
				scope?: "user" | "project";
				/** A trusted project folder. Absent means the agent home alone */
				project?: string;
			};
			header?: never;
			path?: never;
			cookie?: never;
		};
		requestBody?: never;
		responses: {
			/** The package is no longer declared */
			204: {
				headers: {
					[name: string]: unknown;
				};
				content?: never;
			};
			/** No declared package matched */
			400: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["Problem"];
				};
			};
		};
	};
	/** What a declared package provides: extensions, skills, prompts and themes */
	getPackageResources: {
		parameters: {
			query: {
				source: string;
				scope?: "user" | "project";
				/** A trusted project folder. Absent means the agent home alone */
				project?: string;
			};
			header?: never;
			path?: never;
			cookie?: never;
		};
		requestBody?: never;
		responses: {
			/** The package's resources */
			200: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["PackageResources"];
				};
			};
			/** The read failed */
			400: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["Problem"];
				};
			};
		};
	};
}
