# pi's surface: SDK and CLI

Reference for what pi exposes to an embedding host and what it does not. Everything
here was read from pi's shipped types and code, not from documentation prose.
Epsilon embeds pi's engine through this SDK ([ADR-0008](../adr/0008-embed-pi-engine-with-opinions.md))
and configures it through the same exports plus pi's documented files
([ADR-0012](../adr/0012-configure-in-the-dashboard.md)).

**Re-verify after every pi upgrade.** The sources of truth. Paths are relative to the
pinned package, `server/node_modules/@earendil-works/pi-coding-agent`, which is the
copy epsilon drives. `pi` on `PATH` may be a different version, so grep the pinned
package, not the installed CLI.

| Fact                         | File                                                          |
| ---------------------------- | ------------------------------------------------------------- |
| SDK exports                  | `dist/index.d.ts`                                             |
| Session creation and runtime | `dist/core/sdk.d.ts`, `dist/core/agent-session.d.ts`          |
| Event and input types        | `dist/core/extensions/types.d.ts`                             |
| Model runtime and auth       | `dist/core/model-runtime.d.ts`, `@earendil-works/pi-ai` types |
| Settings writer              | `dist/core/settings-manager.d.ts`                             |
| Package manager              | `dist/core/package-manager.d.ts`                              |
| Models config shape          | `dist/core/model-config.d.ts`                                 |
| MCP config shape             | `dist/extensions/mcp/config.d.ts`, pi's `docs/mcp.md`         |
| What the CLI does            | `dist/main.js` (a host over the library, not a second engine) |

Verified against 1.4.0.

## Embedding

`createAgentSession()` gives a `ModelRuntime` on `<agent home>/auth.json` and
`models.json`, a file-backed `SettingsManager`, a persistent `SessionManager`, a
`DefaultResourceLoader`, and the configured default tools.

What it does **not** load, and the CLI does: `codemode`, `tool_search` and MCP. Add
`createCodemodeExtension()`, `createToolSearchExtension()` and
`createMcpExtension()` to `DefaultResourceLoader`'s `extensionFactories`, enable the
tool names the settings expect, and call `session.bindExtensions()` so MCP servers
connect on session start. `createCodemodeExtension()` without options reads the
`codemode.mode` setting; passing `{ mode: "on" }` overrides it.

Register those three the way the CLI does, as
`{ name, factory, replaceable: true, builtin: true }` in `dist/extensions/index.js`.
That list is not exported; a host that wants CLI parity builds the same entries.

Other facts worth having before embedding:

- `mode` is not on `AgentSessionConfig`. It is a field of `ExtensionBindings`,
  passed as `session.bindExtensions({ mode, uiContext })`, and extensions read it
  as `ctx.mode`. The union is `"tui" | "rpc" | "json" | "print"`. Epsilon passes
  `"json"`: it is a headless host, and the only distinction extensions act on is
  `mode === "tui"`.
- `InputSource` is `"interactive" | "rpc" | "extension"`. A prompt typed by a person
  in the browser is `"interactive"`.
- A `uiContext` is required for dialogs; without one a `confirm` has nowhere to go.
  `ExtensionUIContext` has 25 methods, in three groups:
  - **answer** a person: `select`, `confirm`, `input`, `editor`
  - **show** state: `notify`, `setStatus`, `setTitle`, `setWidget` (text lines or a
    TUI component), `setEditorText`, `pasteToEditor`, `getEditorText`
  - **TUI only**: `custom`, `onTerminalInput`, `setWorkingMessage`,
    `setWorkingVisible`, `setWorkingIndicator`, `setHiddenThinkingLabel`,
    `setFooter`, `setHeader`, `getAllThemes`, `getTheme`, `setTheme`,
    `getToolsExpanded`, `setToolsExpanded`, `addAutocompleteProvider`,
    `setEditorComponent`, `getEditorComponent`
    `custom` exists and takes a component factory, so a host with no terminal cannot
    render it. Epsilon answers the first group, maps the text half of the second,
    and reports the rest once as unsupported
    ([ADR-0002](../adr/0002-own-the-ui-contract.md)).
- `NewSessionOptions.id` creates a session with an exact id. `SessionManager` lists,
  opens, finds, creates and owns `getEntries()`, `getTree()` and `getSessionName()`;
  `AgentSessionRuntime` owns `newSession`, `switchSession`, `fork` and
  `importFromJsonl`, and replaces the active session. Subscriptions belong to the old
  session and must be rebound. Epsilon uses the `SessionManager` half and opens one
  session per engine.
- `AgentSession` also has `setSessionName`, `navigateTree`, `exportToHtml`,
  `getSessionStats`, `getContextUsage`, `compact`, `abortCompaction`,
  `abortRetry`, `executeBash`, `abortBash`, `getAllTools` and the model and thinking
  setters. A socket feature uses one of these instead of inventing an RPC command.
- `toJsonEvent` is the transformation between a live event and the JSON the reducer
  consumes: `message_update` loses its `partial` payload and `toolcall_start` gains
  `id` and `toolName`. It is **not exported**. A host carries the transform itself
  ([note](../notes/2026-10-28-tojson-is-not-exported.md)).
- `session.dispose()` aborts work, invalidates extension contexts and removes
  listeners. A host that forgets it leaks a running agent.
- `session.reload()` re-reads resources without replacing the session. Epsilon
  exposes it as a socket command and calls it after every settings write.

## Events

`JsonAgentSessionEvent` is the type the reducer reads. `message_start` gives the
initial message, deltas build on it, and `message_end` gives the authoritative
message. A refused provider call is an assistant `message_end` with
`stopReason: "error"` and an `errorMessage`; there is no separate error event.

Run lifecycle: `agent_start`, `turn_start`, `turn_end`, `agent_end`, `agent_settled`

Messages: `message_start`, `message_update`, `message_end`, `entry_appended`

Tools: `tool_execution_start`, `tool_execution_update`, `tool_execution_end`

Compaction and retries: `compaction_start`, `compaction_end`, `auto_retry_start`,
`auto_retry_end`, `summarization_retry_scheduled`,
`summarization_retry_attempt_start`, `summarization_retry_finished`

Session and queue: `queue_update`, `session_info_changed`,
`thinking_level_changed`, `bash_execution_update`

Extension lifecycle names (`session_start`, `session_shutdown`, `tool_call`,
`project_trust` and the rest) are `ExtensionEvent`s the extension subscribes to in
`pi.on(...)`, not members of the `AgentSessionEvent` union the socket carries. A host
does not receive them as frames.

`bash_execution_update` exists in the union but pi's own UI ignores it. The `bash`
tool also records a `bashExecution` message in the session, which reaches a reader
only through the session's messages
([note](../notes/2026-10-28-bash-result-is-not-an-event.md)).

## Writers: what the SDK can and cannot save

| Thing                      | Writer                                                                                                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Default provider and model | `SettingsManager.setDefaultModelAndProvider`, then `flush()`                                                                                                                                           |
| Other settings             | `SettingsManager` setters                                                                                                                                                                              |
| Packages                   | `DefaultPackageManager.installAndPersist`, `removeAndPersist`, `listConfiguredPackages`                                                                                                                |
| Project trust              | `ProjectTrustStore.set`                                                                                                                                                                                |
| Providers (`models.json`)  | **none.** `registerProvider()` is runtime-only; `ModelConfig` is read-only                                                                                                                             |
| MCP servers (`mcp.json`)   | **none reachable.** `addMcpServerConfig`, `removeMcpServerConfig` and `loadMcpConfig` exist, but the package's `exports` map exposes only `.` and `./rpc-entry`, so they cannot be imported through it |
| Skills                     | **none.** A skill is a directory with `SKILL.md`                                                                                                                                                       |
| Credentials (`auth.json`)  | `ModelRuntime.login()` and `logout()` for a provider that declares a login method                                                                                                                      |

`ModelRuntime.login(providerId, type, interaction)` persists through the credential
store for built-in providers. A custom `models.json` endpoint has no login method,
which is why the dashboard writes its key to `models.json`'s documented `apiKey`
field instead. That field accepts a literal, `$NAME`, or `!command` output.

`models.json` is parsed with `ModelConfig.load()`, which is read-only. Its provider
fields are documented in pi's `docs/models-configuration.md`: `name`, `baseUrl`,
`apiKey`, `api`, `headers`, `models`, `modelOverrides`, `compat` and the per-model
extras (`thinkingLevelMap`, `inputLimits`, `promptCache`, `samplingParams`). The
panel writes `thinkingLevelMap` and the reasoning subset of `compat` from the model
dialog, provider-wide `compat` from the provider's reasoning defaults, and keeps
every unknown key in both objects. A model
needs only `id`; `input` defaults to `["text"]`, `contextWindow` to 128000 and
`maxTokens` to 16384. `cost` is optional, and when present its four fields are
required. A `modelOverrides` object merges field by field for object fields such as
`cost`; every other field replaces the model's value.

## API family paths

pi's clients append a fixed path to a provider's `baseUrl`. Verified against the
clients in the pinned package and the vendors' references (OpenAI API reference,
Anthropic TypeScript SDK, Google Gen AI SDK) on 2026-10-29.

| Family                 | Appended path                     | Model list    | Auth header                   |
| ---------------------- | --------------------------------- | ------------- | ----------------------------- |
| `openai-completions`   | `/chat/completions`               | `/models`     | `Authorization: Bearer <key>` |
| `openai-responses`     | `/responses`                      | `/models`     | `Authorization: Bearer <key>` |
| `anthropic-messages`   | `/v1/messages`                    | `/v1/models`  | `x-api-key` plus a version    |
| `google-generative-ai` | `/models/{model}:generateContent` | different API | `x-goog-api-key`              |

The base URL is not interchangeable between families:

- OpenAI expects the version in the base URL (`https://api.openai.com/v1`), so the
  request is `…/v1/chat/completions`.
- The Anthropic client posts `/v1/messages` relative to its base URL, so a gateway
  with its own `/v1` segment needs the base above it. For commandcode, the OpenAI
  base is `https://api.commandcode.ai/provider/v1` while the Anthropic base is
  `https://api.commandcode.ai/provider`.
- pi sets Google's `apiVersion` to empty when a `baseUrl` is present, so the base
  must include the version path (`https://generativelanguage.googleapis.com/v1beta`).

`shared/src/provider-endpoints.ts` mirrors this table. The provider form's API
picker labels each family with the path it appends, the base URL field names the
request URL that results, and the model-list fetch reads `modelsPath` from the same
list. A list that carries `supported_endpoints` (commandcode does) is read as a
gateway hint: a `/messages`-only model gets the Anthropic API and a base above its
`/v1`, and a `/responses`-only model gets the Responses API. That keeps one
provider's mixed catalog correct. An exact id and API match in pi's catalog also
supplies `reasoning`, `thinkingLevelMap` and `forceAdaptiveThinking`; the rest of
the gateway's compat is left alone. A base that repeats the family's path is a warning under the field, not a
silent rewrite, because pi calls exactly the base it is given. Its test pins the
commandcode paths.

The model list is not a pi SDK method. The settings panel makes its own bounded
`GET` to the endpoints above, with the typed key or the credential resolved by
`ModelRuntime.getAuth()`, no cross-origin redirects, a ten second timeout and a
response cap. Google's list API is a different shape, so the panel asks for those
models by hand.

The provider test is a pi SDK call instead. It registers the draft with
`ModelRuntime.registerProvider()` on a throwaway runtime, which is runtime-only and
writes no file, then asks `completeSimple()` for a small answer. A typed key or
header overrides the stored one, so the test tries what Save would write, and the
request goes through pi's own client rather than a second wire implementation.

It runs two probes. The keyless one registers a placeholder key, because pi refuses
to stream an unconfigured provider, then suppresses the family's auth header with a
`null` header value so the endpoint sees no key. The keyed one uses the typed or
stored credential. That is how a local or keyless endpoint and a real key are told
apart before Save. A `level` on the request is passed to `completeSimple` as
`reasoning`; the test reads the request payload and a clone of the provider stream,
then reports the field the request carried plus the `reasoning_tokens` or thinking
characters the provider returned.

## Files in the agent home

| Path            | Owner | What it holds                                                      |
| --------------- | ----- | ------------------------------------------------------------------ |
| `settings.json` | pi    | Defaults, tools, compaction, packages, skill locations             |
| `models.json`   | pi    | Provider endpoints, headers, model catalogs, `apiKey` overrides    |
| `auth.json`     | pi    | Stored credentials, one per provider, written through login/logout |
| `mcp.json`      | pi    | `mcpServers`, shared shape with other MCP clients                  |
| `trust.json`    | pi    | Project trust decisions                                            |
| `mcp-auth.json` | pi    | MCP OAuth tokens                                                   |
| `skills/`       | pi    | User skills; each directory holds a `SKILL.md`                     |
| `sessions/`     | pi    | One JSONL per session                                              |

Skills also load from `<cwd>/.pi/skills`, `<cwd>/.agents/skills`, `~/.agents/skills`
and installed packages.
Packages are declared in `settings.json` and installed with
`pi install npm:@scope/pkg`, `pi install git:host/repo` or `pi install ./path`.
MCP servers come from `mcp.json` and a project's `.pi/mcp.json`. The project file
is read because the embedded engine starts trusted (see below); a project entry
there replaces a global entry of the same name, and one without `command`, `url`
or `type` only overrides its `enabled`, `exposure` and `toolExposure`. A project
entry cannot set `auth`. `pi mcp add` writes user-level servers unless `-l` is
given.

`updateMcpServerConfig()` writes `enabled: true` by deleting the key and
`exposure: "codemode"` likewise; an override keeps both written because it
replaces the global entry's values. `timeout` is in **seconds**. The package's
`exports` map still exposes only `.` and `./rpc-entry`, so the dashboard parses
the documented shape itself.

## Project trust

The CLI resolves trust before it loads project settings: `resolveProjectTrusted()`
in `dist/core/project-trust.js` reads `trust.json`, then `defaultProjectTrust`
("ask" by default), then asks. Extensions see the result through
`ctx.isProjectTrusted()`, which returns `settingsManager.isProjectTrusted()`.

An embedded engine does not run that resolution. `SettingsManager.create(cwd,
agentDir)` starts at `projectTrusted = true` (`dist/core/settings-manager.js`), and
nothing in `createAgentSession()` changes it. Epsilon therefore loads
`.pi/settings.json`, `.pi/mcp.json` and the other project resources for whoever
owns the deployment's project folder, whatever `trust.json` says;
`defaultProjectTrust` is inert there. That follows from one deployment owning one
project: the folder is chosen at deploy time. The panel states it instead of
pretending a decision exists.

The SDK does expose `ProjectTrustStore` and `SettingsManager.setProjectTrusted`,
so a host that wants pi's CLI behavior can implement it. This repository does not;
trust decisions stay in a terminal inside the deployment
([ADR-0012](../adr/0012-configure-in-the-dashboard.md)).

See [../notes/2026-10-30-embedded-engine-always-trusts.md](../notes/2026-10-30-embedded-engine-always-trusts.md).

## The CLI, for what an embedding host does not do

These run as commands in a terminal inside the deployment. The dashboard does not
shell out to them.

| Command                                                  | What it does                                                                                              |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `pi`                                                     | The interactive TUI: `/login`, `/settings`, `/trust`, `/mcp`, `/model`, `/compact`, `/fork`, `/resume`    |
| `pi auth check --provider <p> [--json]`                  | Reads provider readiness: `ready`, `not_ready` or `invalid`, with a matching exit code                    |
| `pi auth print-api-key`, `print-bearer-token`            | Reads the stored credential or a refreshed token. Read-only; there is no command that writes a credential |
| `pi mcp add`, `remove`, `list --json`, `login`, `logout` | Configures MCP servers and signs in to OAuth servers. `login` opens a browser and waits, with `--timeout` |
| `pi install <source> [-l]`, `remove`, `list`, `update`   | Installs packages and edits the settings that declare them                                                |
| `pi config`                                              | Toggles package resources. TUI only                                                                       |
| `pi --list-models [search]`                              | Lists models, but only authenticated ones: with no credential it prints "No models available"             |

The dashboard writes the same files these commands write, but it does not call them:
a server that spawns the CLI would duplicate argument parsing and lose structured
errors ([ADR-0012](../adr/0012-configure-in-the-dashboard.md)).
