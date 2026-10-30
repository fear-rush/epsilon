# Features and how each one is built

Status: **current.** A built feature names the module, route or engine call that
implements it today. A planned feature names the slice that builds it and the pi
surface it would use, but no Epsilon file, because that file does not exist yet.
Slices are in [plan.md](plan.md); the checks are in [plan/slices.md](plan/slices.md).

Legend: **engine** = an `AgentSession` method in this process · **REST** = our HTTP
route · **WS** = our socket command or frame · **own** = our own module ·
**settings** = the settings page, which writes through REST ·
**terminal** = a terminal inside the deployment.

## Sessions

| Feature                                                           | How                                                                                   |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| List this project's sessions, with running and needs-input badges | REST `GET /api/sessions`; live state joined in `sessions/list.ts`                     |
| Open a session, read the transcript                               | URL `/sessions/{id}` + WS `attach` → `snapshot`                                       |
| Start a session from the list                                     | own: navigate to a fresh id; pi writes the file on the first message                  |
| Rename                                                            | **terminal**: `ctrl+r` in pi's session picker; the page's header follows the snapshot |
| Delete                                                            | REST `DELETE /api/sessions/{id}`, refused while an engine holds it                    |
| Full history and tree view, read-only                             | **planned (S3+)**: `sessionManager.getEntries()`, `getTree()`                         |
| Fork or clone into a new session, switch the session file         | **planned**: `AgentSessionRuntime.fork()`, `switchSession()`                          |
| Export to HTML                                                    | **planned**: `AgentSession.exportToHtml()`                                            |
| Search transcripts, pins, archive, project order                  | **planned**: own code; no engine surface                                              |
| In-session branch switching (`/tree`)                             | **terminal**: `navigateTree()` is not exposed over the socket                         |

## Running a turn

| Feature                                    | How                                                                                   |
| ------------------------------------------ | ------------------------------------------------------------------------------------- |
| Send a prompt                              | WS `prompt` → `AgentSession.prompt(text, { source: "interactive" })`                  |
| Steer mid-run                              | WS `steer` → `AgentSession.steer(text, undefined, { source: "interactive" })`         |
| Abort                                      | WS `abort` → pending dialogs cancelled, then `AgentSession.abort()`                   |
| `!command` / `!!command`                   | WS `bash` → `executeBash()`; the snapshot is re-read after the run                    |
| Slash palette: skills, prompts, extensions | the snapshot's `commands`; the picked `/name` runs through `prompt()`                 |
| Permission policy (strict, ask, yolo)      | extension command `/permission <mode>`; the mode is read from its keyed status        |
| Change model                               | WS `set_model` → `AgentSession.setModel()`, resolved against the offered list         |
| Reload extensions, skills and packages     | WS `reload` → `AgentSession.reload()`, also called after every settings write         |
| Queue a follow-up, queue behaviour modes   | **planned**: `followUp()`, `setSteeringMode()`, `setFollowUpMode()`                   |
| Reasoning level                            | WS `set_thinking_level` → `AgentSession.setThinkingLevel()`, levels from the snapshot |
| Compact context, stop a compaction         | **planned**: `compact()`, `abortCompaction()`                                         |
| Auto-compaction and auto-retry settings    | **planned**: `setAutoCompactionEnabled()`, `setAutoRetryEnabled()`, `abortRetry()`    |
| Context usage, tokens, cost, tool counts   | **planned (S15)**: `getContextUsage()`, `getSessionStats()`                           |
| Needs-input notification                   | **planned (S10)**: own, on a dialog opening and on `agent_settled`                    |

## Transcript rendering

| Feature                          | How                                                                      |
| -------------------------------- | ------------------------------------------------------------------------ |
| Streaming assistant text         | WS `event` (`message_start`/`_update`/`_end`)                            |
| Thinking                         | muted paragraph above the answer; no duration and no collapse yet        |
| Tool calls, running and finished | WS `tool_execution_*`; unknown and MCP tools use the generic renderer    |
| Diffs from `edit`                | `CodeBlockLine variant="added"/"removed"` over the tool arguments        |
| Bash output                      | the tool card's output block                                             |
| Images in tool results           | tool result content parts                                                |
| Compaction and retry notices     | WS `compaction_*`, `auto_retry_*` → transcript `Marker` rows             |
| A refused provider call          | assistant `message_end` with `stopReason: "error"` → destructive `Alert` |
| Cache-miss and cost notices      | **planned**: needs `getSessionStats()` and pi's notice settings          |
| Skill invocation turns           | **planned**: parse the user message the way pi's TUI does                |

## Configuration

The deployment owns its agent home ([ADR-0005](adr/0005-deployment-owns-agent-home.md)).
The dashboard configures it through pi's SDK and its documented files
([ADR-0012](adr/0012-configure-in-the-dashboard.md)). What stays in the terminal is
only what pi does not expose to a host.

| Feature                                                                              | How                                                                                                                                            |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Report readiness: is there a usable model in this home, and where is the home        | `agent/readiness.ts` behind REST `GET /api/readiness`                                                                                          |
| A missing provider becomes a notice that opens Settings                              | own, on the not-ready state; never a silently failed turn                                                                                      |
| Provider list with the id and model count                                            | `settings/providers.ts` + `ModelRuntime`, REST `GET /api/settings`                                                                             |
| Two-pane editor: configured providers left, one form right                           | Routes `/settings/providers/$providerId` and `/new`                                                                                            |
| Add a provider pi ships, or a custom one, from a searchable picker                   | `builtins` in the snapshot; `components/settings/providers/`                                                                                   |
| Read one provider's detail, with header names but no secret values                   | REST `GET /api/settings/providers/{id}`                                                                                                        |
| Name each API family with the path it appends, in the picker                         | `PROVIDER_APIS` in `shared/src/provider-endpoints.ts`                                                                                          |
| Show the request URL a base URL produces, and warn when it repeats the family's path | `providerEndpoint` and `providerBaseUrlProblem` in `shared/src/provider-endpoints.ts`                                                          |
| Add, edit or remove a model; override a model pi ships                               | **settings** page → `models` / `modelOverrides`, with an explicit replace warning                                                              |
| Configure reasoning per model and provider                                           | **settings** page → `reasoning`, `thinkingLevelMap` and the reasoning keys of `compat`; written by the model and provider forms                |
| Fetch a provider's model list, then add the ones you pick                            | REST `POST /api/settings/providers/models`; Epsilon's own bounded GET; `supported_endpoints` sets a per-model Anthropic/Responses shape        |
| Test a provider at a reasoning level and report its tokens                           | REST `POST /api/settings/providers/test`; the same route, a `level` and the streamed usage                                                     |
| Test a provider draft or one model before Save writes it                             | REST `POST /api/settings/providers/test`; `registerProvider()` on a throwaway runtime, then `completeSimple()`                                 |
| Add, edit or remove a provider endpoint, its key, headers and models                 | **settings** page → `settings/provider-write.ts` merges `models.json`, keeps unknown keys, and logs a stored key out of `auth.json` on removal |
| Choose the default provider and model                                                | **settings** → `SettingsManager.setDefaultModelAndProvider`                                                                                    |
| Add, replace or remove an MCP server                                                 | **settings** → `settings/mcp.ts` writes `mcp.json`                                                                                             |
| Create, edit or remove a user skill                                                  | **settings** → `settings/skills.ts` writes `<agent home>/skills/<name>/SKILL.md`                                                               |
| Install or remove a package                                                          | **settings** → `DefaultPackageManager.installAndPersist` / `removeAndPersist`                                                                  |
| Apply a change to live sessions                                                      | `registry.reloadAll()` → `session.reload()`                                                                                                    |
| Readiness detail, package versions, trust state on a resources page                  | **planned (S8)**                                                                                                                               |
| OAuth or subscription login, project trust, MCP sign-in, TUI-only settings           | **terminal**: `pi`, then `/login`, `/trust`, `/mcp login`, `/settings`                                                                         |
| Update a package, clear MCP credentials, configuration import                        | **not built**                                                                                                                                  |

## Extension surface

| Feature                                                | How                                                                             |
| ------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `select`, `confirm`, `input`, `editor` dialogs         | WS `dialog` frames, answered from the page with the question's own method       |
| Toasts, status bar, widgets, window title, editor text | WS `ui` frames; the permission status drives the composer, widgets sit above it |
| Other keyed statuses                                   | held in reducer state; no surface renders them yet                              |
| Approvals and permission prompts                       | extension dialog flow; Epsilon ships the guard itself (ADR-0008)                |
| Epsilon's own defaults: `permission`, `discuss`        | inline factories in `server/src/agent/defaults/`, operator copies win by name   |
| The same defaults in a terminal                        | **not yet**; S7 passes them to the CLI with `-e` (ADR-0010)                     |
| `ctx.ui.custom` and other TUI-only methods             | **unsupported**: one notice names the methods and the terminal tab (ADR-0008)   |
| An extension handler that throws                       | one `EXTENSION_ERROR` frame in the transcript                                   |

## Planned surfaces

| Slice | Feature                                                                                                                          |
| ----- | -------------------------------------------------------------------------------------------------------------------------------- |
| S6    | File tree, source/image/CSV viewers, one-file diff, `@` path insert                                                              |
| S7    | A terminal tab running `pi` in the deployment, with Epsilon's defaults through `-e`                                              |
| S8    | Read-only resources page: skills, packages, MCP servers with scope, source and connection state                                  |
| S9    | Preview a static file or a dev server from a second origin, with Preview / Source / Diff tabs                                    |
| S10   | A phone notification when a run needs an answer, and one when it finishes                                                        |
| S11   | The container, the volume, one origin, and Host/Origin checks before a published port                                            |
| S14   | Web search, fetch and subagents from pinned packages, loaded by path ([ADR-0011](adr/0011-third-party-tools-as-dependencies.md)) |
| S15   | Context usage and cost in the page, from the engine                                                                              |
| S16   | Image paste into the composer, through `prompt(text, { images })`                                                                |

Files, git status, the terminal pty and the preview listener do not exist. Their
routes are not implemented; the `terminal*` frames are declared in
[protocol.md](protocol.md) so S7 has a contract to fill.

## Access and operations (built)

| Feature            | How                                                       |
| ------------------ | --------------------------------------------------------- |
| Agent readiness    | REST `GET /api/readiness`                                 |
| REST docs          | generated OpenAPI at `/openapi.json`, Scalar at `/scalar` |
| Health             | REST `GET /health`                                        |
| One socket per tab | `client/src/link.ts`, protocol 5                          |
| Remote access      | a tunnel in front; no auth code in the app                |

Host and Origin checks, one origin serving the built client, and a published port
are S11 and do not exist yet.

## Not building

Auth, accounts, multi-user, npm/git distribution (the deployment is a container
image), launcher, update checker, i18n, themes beyond light and dark, a settings
screen for every pi setting, configuration import, file editing, commit history,
plugin or slot system, multi-pane layouts, a second engine.

## Scope by milestone

**V1 (the product):** deployment, readiness, transcripts, composer, sessions,
extension dialogs, files, terminal, resources page, notifications.

**V2:** preview pane (static, then dev-server proxy), attachments and image
paste, transcript search, sub-agent side panel (only if a subagent extension is
installed), unread badges, MCP sign-in form.

**Never in v1:** everything in the list above.
