# Features and how each one is built

Status: **design.** Implemented slices and their checks live in
[plan.md](plan.md) and [plan/slices.md](plan/slices.md). One row per feature. The
"How" column is the point of this page: it records what the engine exposes, what
needs our own code, and what is deliberately left to the terminal.

Legend: **engine** = an `AgentSession` method in this process · **REST** = our HTTP
route · **WS** = our socket command or frame · **own** = our own module ·
**settings** = the settings page, which writes through REST ·
**terminal** = the terminal tab, inside the deployment.

## Sessions

| Feature                                                           | How                                                                  |
| ----------------------------------------------------------------- | -------------------------------------------------------------------- |
| List this project's sessions, with running and needs-input badges | REST `GET /api/sessions` (live state joined server-side)             |
| Open a session, read the transcript                               | URL `/sessions/{id}` + WS `attach` → `snapshot`                      |
| Start a session from the list                                     | own: navigate to a fresh id; pi writes the file on the first message |
| Full history, tree view (read-only)                               | engine `sessionManager.getEntries()`, `getTree()`                    |
| Rename                                                            | engine `sessionManager.setSessionName()`                             |
| New session                                                       | engine runtime `newSession()`                                        |
| Fork from a message into a new session                            | engine runtime `fork()`                                              |
| Clone the current branch into a new session                       | engine runtime `fork()` on the current entry                         |
| Switch to another session file                                    | engine runtime `switchSession()`                                     |
| Delete                                                            | REST `DELETE /api/sessions/{id}` (refuses while an engine holds it)  |
| Export to HTML                                                    | engine `exportToHtml()`                                              |
| Search transcripts                                                | own `server/src/sessions/search.ts`                                  |
| Pins, archive, project order, unread                              | own, `~/.epsilon/ui-state.json`                                      |
| In-session branch switching (`/tree`)                             | **terminal**; `AgentSession.navigateTree()` is not on the socket     |

## Running a turn

| Feature                                    | How                                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Send a prompt                              | WS `prompt` → engine `prompt()`                                                             |
| Steer mid-run, queue a follow-up           | WS `steer` → `steer()`, `followUp()`                                                        |
| Abort, clear the queue                     | WS `abort` → `abort()`, `clearQueue()`                                                      |
| Queue behaviour modes                      | engine `setSteeringMode()`, `setFollowUpMode()`                                             |
| `!command` / `!!command`                   | WS `bash` → `executeBash()`; `abortBash()` for a stop                                       |
| Slash palette: skills, prompts, extensions | the snapshot's `commands`; the picked `/name` runs through `prompt()`                       |
| Permission policy (strict, ask, yolo)      | extension command `/permission <mode>` via `prompt()`; mode read from its keyed status      |
| Change model, reasoning level              | WS `set_model` → `setModel()`; `setThinkingLevel()`, `cycleModel()`, `cycleThinkingLevel()` |
| Compact context, with instructions         | engine `compact()`                                                                          |
| Auto-compaction, auto-retry                | engine `setAutoCompactionEnabled()`, `setAutoRetryEnabled()`, `abortRetry()`                |
| Context usage, tokens, cost, tool counts   | engine `getSessionStats()` + derived from events                                            |
| Stop compaction or retry mid-flight        | engine `abort()`, `abortCompaction()`, `abortRetry()`                                       |
| Completion sound, needs-input notification | own, on `agent_settled` / dialog open                                                       |

## Transcript rendering

| Feature                             | How                                                                              |
| ----------------------------------- | -------------------------------------------------------------------------------- |
| Streaming assistant text            | WS `event` (`message_start`/`_update`/`_end`)                                    |
| Thinking blocks with duration       | WS events; duration from `message_end` diagnostics if present, else local timing |
| Tool calls, running and finished    | WS `tool_execution_*`; unknown and MCP tools use the generic renderer            |
| Diffs from `edit`                   | own `components/chat/tools/edit.tsx` over the tool result                        |
| Bash output, truncated output paths | tool result fields                                                               |
| Images in tool results              | tool result content blocks                                                       |
| Compaction summaries, notices       | WS `compaction_*`, `entry_appended`                                              |
| Cache-miss and cost notices         | WS events + `getSessionStats()`; respect pi's `showCacheMissNotices`             |
| Skills invocation turns             | parsed from the user message, like pi's TUI does                                 |

## Configuration

The deployment owns its agent home ([ADR-0005](adr/0005-deployment-owns-agent-home.md)).
The dashboard configures it through pi's SDK and its documented files
([ADR-0012](adr/0012-configure-in-the-dashboard.md)). What stays in the terminal is
only what pi does not expose to a host.

| Feature                                                                       | How                                                                                                                                                  |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Report readiness: is there a usable model in this home, and where is the home | `agent/readiness.ts` behind REST `GET /api/readiness`                                                                                                |
| A missing provider becomes a notice that opens Settings                       | own, on the not-ready state; never a silently failed turn                                                                                            |
| Provider list with the id and model count                                     | `settings/providers.ts` + `ModelRuntime`, REST `GET /api/settings`                                                                                   |
| Two-pane editor: configured providers and their models left, one form right   | Routes `/settings/providers/$providerId` and `/new`                                                                                                  |
| Add a provider pi ships, or a custom one, from a searchable picker            | `builtins` in the snapshot; `components/settings/providers/`                                                                                         |
| Read one provider's detail, with header names but no secret values            | REST `GET /api/settings/providers/{id}`                                                                                                              |
| Name each API family with the path it appends, in the picker                  | `PROVIDER_APIS` in `shared/src/provider-endpoints.ts`                                                                                                |
| Add, edit or remove a model; override a model pi ships                        | **settings** page → `models` / `modelOverrides`, with an explicit replace warning                                                                    |
| Fetch a provider's model list, then add the ones you pick                     | REST `POST /api/settings/providers/models`; Epsilon's own bounded GET                                                                                |
| Add, edit or remove a provider endpoint, its key, headers and models          | **settings** page → `models.json`, zod-parsed and validated in the form, unknown keys kept; removing a provider logs a stored key out of `auth.json` |
| Choose the default provider and model                                         | **settings** → `SettingsManager.setDefaultModelAndProvider`                                                                                          |
| Add, replace or remove an MCP server                                          | **settings** → `mcp.json`                                                                                                                            |
| Create, edit or remove a user skill                                           | **settings** → `<agent home>/skills/<name>/SKILL.md`                                                                                                 |
| Install or remove a package                                                   | **settings** → `DefaultPackageManager.installAndPersist` / `removeAndPersist`                                                                        |
| Apply a change to live sessions                                               | `registry.reloadAll()` → `session.reload()`                                                                                                          |
| Readiness detail, package versions, trust state on a resources page           | **not built**; S8 owns the read-only page                                                                                                            |
| OAuth or subscription login, project trust, MCP sign-in, TUI-only settings    | **terminal**: `pi`, then `/login`, `/trust`, `/mcp login`, `/settings`                                                                               |
| Update a package, clear MCP credentials, configuration import                 | **not built**                                                                                                                                        |

## Extension surface

| Feature                                                | How                                                                           |
| ------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `select`, `confirm`, `input`, `editor` dialogs         | WS `dialog` frames, answered from the page                                    |
| Toasts, status bar, widgets, window title, editor text | WS `ui` frames; keyed status and widgets replay on attach                     |
| Approvals and permission prompts                       | extension dialog flow; Epsilon ships the guard itself (ADR-0008)              |
| Epsilon's own defaults: `permission`, `discuss`        | inline factories in `server/src/agent/defaults/`, operator copies win by name |
| The same defaults in a terminal                        | **not yet**; S7 passes them to the CLI with `-e` (ADR-0010)                   |
| `ctx.ui.custom` and other TUI-only methods             | **unsupported. One notice names the methods and the terminal tab** (ADR-0008) |

## Resources (read-only)

| Feature                                                 | How                                        |
| ------------------------------------------------------- | ------------------------------------------ |
| Loaded skills with scope and source                     | REST `GET /resources`                      |
| Installed packages and versions                         | REST `GET /resources`                      |
| MCP servers, enabled state, connection state            | REST `GET /resources`                      |
| Enable or remove a package, add or remove an MCP server | **settings**                               |
| Update a package, MCP sign-in                           | **terminal** (`pi update`, `pi mcp login`) |
| Reload after installing                                 | WS `reload` → `session.reload()`, in place |

## Files, git, terminal, preview

| Feature                                                    | How                                                               |
| ---------------------------------------------------------- | ----------------------------------------------------------------- |
| File tree with git badges                                  | REST `GET /files`                                                 |
| View source, markdown, image, audio, video, PDF, DOCX, CSV | REST `GET /files` + own viewers                                   |
| Download, upload, drag-drop                                | REST `GET /files/raw`, `POST /files/upload`                       |
| Insert a path into the composer                            | own `@`-mention + button action                                   |
| Git status, one-file diff                                  | REST `/git/status`, `/git/diff`                                   |
| Worktree list                                              | REST `/git/worktrees` (create/remove: later)                      |
| Terminal                                                   | own pty sessions, WS `terminal` frames                            |
| Preview static file / dev server                           | second origin, sandboxed iframe; `Preview`, `Source`, `Diff` tabs |

## Access and operations

| Feature                    | How                                                              |
| -------------------------- | ---------------------------------------------------------------- |
| Host and Origin checks     | own `server/src/security.ts`; required before any published port |
| Agent readiness            | REST `GET /api/readiness`                                        |
| One origin in deployment   | the server serves the built client; [deploy.md](deploy.md)       |
| Remote access from a phone | Tailscale or SSH tunnel; no auth code in the app                 |
| REST docs                  | generated OpenAPI + Scalar                                       |
| Socket docs                | `docs/protocol.md`                                               |
| Health                     | `GET /health`                                                    |

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
