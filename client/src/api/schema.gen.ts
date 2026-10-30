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
        /** @description Whether the agent home holds a usable model, so a turn can run */
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
        /** @description Providers, default model, MCP servers, skills and packages from the agent home */
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
        /** @description The editable detail of one provider, with header names but no secrets */
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
        /** @description Read a provider's model list; OpenAI-style and Anthropic endpoints only */
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
        /** @description Try a provider draft's model without writing models.json */
        post: operations["testProvider"];
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
        /** @description Add or change a provider entry in models.json */
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
        /** @description The editable detail of one MCP server, with variable and header names but no values */
        get: operations["readMcpServer"];
        put?: never;
        post?: never;
        /** @description Remove an MCP server, or a project override, from its file */
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
        /** @description Add or change an MCP server in the file its scope names */
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
        /** @description Turn one server on or off in its own file. Off writes `enabled: false`; on removes the key */
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
        /** @description Set a global server's state in this project: inherit the global setting, or write an override */
        post: operations["setMcpServerInProject"];
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
        /** @description Create or replace a user skill under the agent home */
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
        /** @description Install a package and declare it in pi's settings */
        post: operations["installPackage"];
        delete: operations["removePackage"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        Readiness: {
            /** @enum {boolean} */
            ready: true;
        } | {
            /** @enum {boolean} */
            ready: false;
            detail: string;
            fix: string;
            home: string;
        };
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
        SessionError: components["schemas"]["Problem"] & {
            /** @enum {string} */
            code: "SESSION_NOT_FOUND" | "SESSION_RUNNING";
        };
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
            mcpDisabled: boolean;
            projectDir: string;
            skills: components["schemas"]["SkillView"][];
            packages: components["schemas"]["PackageView"][];
            ready: boolean;
            error?: string;
        };
        DefaultModel: {
            provider: string;
            modelId: string;
        } | null;
        ProviderView: {
            id: string;
            name: string;
            baseUrl?: string;
            /** @enum {string} */
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
        };
        SnapshotModel: {
            provider: string;
            id: string;
            name: string;
        };
        McpServerView: components["schemas"]["McpServerEntry"] | components["schemas"]["McpOverrideEntry"] | components["schemas"]["McpInvalidEntry"];
        McpServerEntry: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: "server";
            /** @enum {string} */
            scope: "global" | "project";
            name: string;
            target: string;
            /** @enum {string} */
            transport: "stdio" | "http";
            description?: string;
            enabled: boolean;
            /** @enum {string} */
            exposure?: "codemode" | "deferred" | "direct" | "hidden";
            timeout?: number;
            /** @enum {string} */
            relation?: "replaces-global" | "replaced-by-project" | "overridden-by-project";
        };
        McpOverrideEntry: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: "override";
            /** @enum {string} */
            scope: "project";
            name: string;
            target: string;
            /** @enum {string} */
            transport: "stdio" | "http";
            description?: string;
            enabled: boolean;
            /** @enum {string} */
            exposure?: "codemode" | "deferred" | "direct" | "hidden";
            timeout?: number;
            overrideKeys: ("enabled" | "exposure" | "toolExposure")[];
            overrideEnabled?: boolean;
        };
        McpInvalidEntry: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: "invalid";
            name: string;
            /** @enum {string} */
            scope: "global" | "project";
            problem: string;
            enabled: boolean;
            overrideKeys?: ("enabled" | "exposure" | "toolExposure")[];
        };
        SkillView: {
            name: string;
            description: string;
            path: string;
        };
        PackageView: {
            source: string;
            /** @enum {string} */
            scope: "user" | "project";
            installedPath?: string;
        };
        ProviderDetail: {
            id: string;
            name: string;
            baseUrl?: string;
            /** @enum {string} */
            api?: "openai-completions" | "openai-responses" | "anthropic-messages" | "google-generative-ai";
            stored: components["schemas"]["ProviderStored"];
            builtin: boolean;
            custom: boolean;
            configured: boolean;
            source?: string;
            hasKey: boolean;
            headerKeys: string[];
            models: components["schemas"]["ProviderModelInput"][];
            modelOverrides: {
                [key: string]: components["schemas"]["ModelOverride"];
            };
            catalog: components["schemas"]["SnapshotModel"][];
        };
        ProviderStored: {
            name?: string;
            baseUrl?: string;
            /** @enum {string} */
            api?: "openai-completions" | "openai-responses" | "anthropic-messages" | "google-generative-ai";
            compat?: components["schemas"]["ReasoningCompat"];
        };
        ReasoningCompat: {
            /** @enum {string} */
            thinkingFormat?: "openai" | "openrouter" | "deepseek" | "together" | "baseten" | "zai" | "qwen" | "chat-template" | "qwen-chat-template" | "string-thinking" | "ant-ling";
            supportsReasoningEffort?: boolean;
            /** @enum {string} */
            thinkingTokenBudgetField?: "thinking_token_budget" | "thinking_budget" | "thinking_budget_tokens";
            requiresReasoningContentOnAssistantMessages?: boolean;
            forceAdaptiveThinking?: boolean;
        } & {
            [key: string]: unknown;
        };
        ProviderModelInput: {
            id: string;
            name?: string;
            /** @enum {string} */
            api?: "openai-completions" | "openai-responses" | "anthropic-messages" | "google-generative-ai";
            /** Format: uri */
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
            /** @enum {string} */
            api?: "openai-completions" | "openai-responses" | "anthropic-messages" | "google-generative-ai";
            /** Format: uri */
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
            /** Format: uri */
            baseUrl: string;
            /** @enum {string} */
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
            /** @enum {string} */
            api?: "openai-completions" | "openai-responses" | "anthropic-messages" | "google-generative-ai";
            apiKey?: string;
            headers?: {
                [key: string]: string;
            };
            compat?: components["schemas"]["ReasoningCompat"];
            /** @enum {string} */
            level?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
            model?: components["schemas"]["ProviderModelInput"];
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
        McpServerDetail: components["schemas"]["McpServerEntryDetail"] | components["schemas"]["McpOverrideEntry"] | components["schemas"]["McpInvalidEntry"];
        McpServerEntryDetail: components["schemas"]["McpServerEntry"] & {
            command?: string;
            args?: string[];
            envKeys: string[];
            cwd?: string;
            url?: string;
            headerKeys: string[];
            oauthKeys: string[];
            authProvider?: string;
            toolExposureKeys: string[];
        } & {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: "server";
        };
        McpServerInput: {
            name: string;
            /** @enum {string} */
            scope: "global" | "project";
            description?: string;
            /** @enum {string} */
            exposure?: "codemode" | "deferred" | "direct" | "hidden";
            timeout?: number;
            /** @enum {string} */
            transport: "stdio";
            command: string;
            args?: string[];
            env?: {
                [key: string]: string;
            };
            cwd?: string;
        } | {
            name: string;
            /** @enum {string} */
            scope: "global" | "project";
            description?: string;
            /** @enum {string} */
            exposure?: "codemode" | "deferred" | "direct" | "hidden";
            timeout?: number;
            /** @enum {string} */
            transport: "http";
            url: string;
            headers?: {
                [key: string]: string;
            };
        };
        McpEnabledInput: {
            /** @enum {string} */
            scope: "global" | "project";
            name: string;
            enabled: boolean;
        };
        McpInProjectInput: {
            name: string;
            /** @enum {string} */
            value: "inherit" | "on" | "off";
        };
        SkillInput: {
            name: string;
            description: string;
            body: string;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    health: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Server is running */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {string} */
                        status: "ok";
                    };
                };
            };
        };
    };
    readiness: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description What the engine reports for the home it was given */
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
            /** @description Sessions pi recorded for the configured project, newest first */
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
            /** @description Session file removed */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description No such session in this project */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionError"];
                };
            };
            /** @description A live agent still holds this session */
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
    readSettings: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The configuration this deployment runs on */
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
            /** @description pi's settings.json now names this provider and model */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The model is not one this deployment can run */
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
            /** @description Provider fields, declared models, overrides and the live catalog */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProviderDetail"];
                };
            };
            /** @description The provider could not be read */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description No provider or models.json entry with this id */
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
            /** @description The provider entry and its stored credential are gone from the agent home */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description models.json could not be written */
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
            /** @description Model ids returned by the provider */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProviderImportResult"];
                };
            };
            /** @description The endpoint refused or returned no model list */
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
            /** @description The draft reached its model */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProviderTestResult"];
                };
            };
            /** @description The provider refused or could not be reached */
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
            /** @description models.json now carries the provider, and live engines reloaded */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The provider entry was refused */
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
            /** @description The server entry, its target and the names of its stored values */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["McpServerDetail"];
                };
            };
            /** @description mcp.json could not be read */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description No server with this name in that file */
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
            /** @description The entry is gone from its file */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The file could not be written */
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
            /** @description The file now carries the server, and live engines reloaded */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The server entry was refused */
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
            /** @description The file now carries the state, and live engines reloaded */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The change was refused */
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
            /** @description The project file now carries the override, and live engines reloaded */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The change was refused */
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
            /** @description The skill file, for the edit form */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SkillInput"];
                };
            };
            /** @description The name is not a skill directory */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description No such skill under the agent home */
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
            /** @description The skill directory is gone */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The skill could not be removed */
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
            /** @description The skill's SKILL.md is written, and live engines reloaded */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The skill was refused */
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
            /** @description The package is installed and configured */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The install failed */
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
            /** @description The package is no longer declared */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description No declared package matched */
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
