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
		delete: operations["deleteSession"];
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
		/** Providers, default model, MCP servers with what they can reach, skills and packages from the agent home */
		get: operations["readSettings"];
		put?: never;
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
	"/api/settings/skills/{name}": {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
		get: operations["readSkill"];
		put?: never;
		post?: never;
		delete: operations["deleteSkill"];
		options?: never;
		head?: never;
		patch?: never;
		trace?: never;
	};
	"/api/settings/skills": {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
		get?: never;
		put?: never;
		/** Create or replace a user skill under the agent home */
		post: operations["writeSkill"];
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
		/** Install a package and declare it in pi's settings */
		post: operations["installPackage"];
		delete: operations["removePackage"];
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
			project: string;
			sessions: components["schemas"]["SessionSummary"][];
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
		};
		SessionError: components["schemas"]["Problem"] & ({
			code: "SESSION_NOT_FOUND" | "SESSION_RUNNING";
		});
		Problem: {
			message: string;
		};
		SettingsSnapshot: {
			home: string;
			defaultModel: components["schemas"]["DefaultModel"];
			providers: components["schemas"]["ProviderView"][];
			builtins: components["schemas"]["BuiltinProvider"][];
			models: components["schemas"]["SnapshotModel"][];
			mcp: components["schemas"]["McpServerView"][];
			mcpReach: components["schemas"]["McpReach"];
			mcpLive: components["schemas"]["McpLive"];
			mcpDisabled: boolean;
			projectDir: string;
			skills: components["schemas"]["SkillView"][];
			packages: components["schemas"]["PackageView"][];
			ready: boolean;
			error?: string;
		};
		DefaultModel: ({
			provider: string;
			modelId: string;
		}) | null;
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
			})[];
			codemode: boolean;
			toolSearch: boolean;
		};
		SkillView: {
			name: string;
			description: string;
			path: string;
		};
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
		SkillInput: {
			name: string;
			description: string;
			body: string;
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
			/** Sessions pi recorded for the configured project, newest first */
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
			/** Session file removed */
			204: {
				headers: {
					[name: string]: unknown;
				};
				content?: never;
			};
			/** No such session in this project */
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
	/** Providers, default model, MCP servers with what they can reach, skills and packages from the agent home */
	readSettings: {
		parameters: {
			query?: never;
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
	/** The editable detail of one MCP server, with variable, header and secret names but no values, plus its log tail */
	readMcpServer: {
		parameters: {
			query?: never;
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
			query?: never;
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
	/** Add or change an MCP server in the file its scope names. A save pi would skip is refused */
	writeMcpServer: {
		parameters: {
			query?: never;
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
			query?: never;
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
			query?: never;
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
			query?: never;
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
	readSkill: {
		parameters: {
			query?: never;
			header?: never;
			path: {
				name: string;
			};
			cookie?: never;
		};
		requestBody?: never;
		responses: {
			/** The skill file, for the edit form */
			200: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["SkillInput"];
				};
			};
			/** The name is not a skill directory */
			400: {
				headers: {
					[name: string]: unknown;
				};
				content: {
					"application/json": components["schemas"]["Problem"];
				};
			};
			/** No such skill under the agent home */
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
	deleteSkill: {
		parameters: {
			query?: never;
			header?: never;
			path: {
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
	/** Create or replace a user skill under the agent home */
	writeSkill: {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
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
	/** Install a package and declare it in pi's settings */
	installPackage: {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
		requestBody: {
			content: {
				"application/json": {
					source: string;
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
}
