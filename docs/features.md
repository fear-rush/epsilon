# Features and how each one is built

Status: **design.** Implemented slices and their checks live in
[plan.md](plan.md) and [plan/slices.md](plan/slices.md). One row per feature. The
"How" column is the point of this page: it records what the engine exposes, what
needs our own code, and what is deliberately left to the terminal.

Legend: **engine** = an `AgentSession` method in this process · **REST** = our HTTP
route · **WS** = our socket command or frame · **own** = our own module ·
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

## Readiness

The deployment owns its agent home, and setup happens in a terminal inside it
([ADR-0005](adr/0005-deployment-owns-agent-home.md),
[ADR-0006](adr/0006-setup-in-the-deployment-terminal.md)). The dashboard reads that
home and reports it. It never writes pi's configuration.

| Feature                                                                                   | How                                                               |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Report readiness: home path, configured providers, default model, packages, project trust | own module behind REST `GET /api/agent`                           |
| A missing step becomes a notice naming the terminal command that fixes it                 | own, on the not-ready state; never a silently failed turn         |
| Sign in, choose a model, record trust, enable packages, sign in to MCP                    | **terminal** inside the deployment: `pi`, then `/login`, `/trust` |
| Install a package                                                                         | **terminal** (`pi install`), then `/reload` in the page           |
| Credential upload, configuration import, settings forms                                   | **not built, by decision**                                        |

## Extension surface

| Feature                                                | How                                                                      |
| ------------------------------------------------------ | ------------------------------------------------------------------------ |
| `select`, `confirm`, `input`, `editor` dialogs         | WS `dialog` frames, answered from the page                               |
| Toasts, status bar, widgets, window title, editor text | WS `ui` frames; keyed status and widgets replay on attach                |
| Approvals and permission prompts                       | extension dialog flow; not a pi core feature                             |
| `ctx.ui.custom` and other TUI-only methods             | **unsupported. One notice per method names the terminal tab** (ADR-0008) |

## Resources (read-only)

| Feature                                      | How                                               |
| -------------------------------------------- | ------------------------------------------------- |
| Loaded skills with scope and source          | REST `GET /resources`                             |
| Installed packages and versions              | REST `GET /resources`                             |
| MCP servers, enabled state, connection state | REST `GET /resources`                             |
| Remove, update, enable, MCP sign-in          | **terminal** (`pi remove`, `pi update`, `pi mcp`) |
| Install a package                            | **terminal** (`pi install`, `pi mcp add`)         |
| Reload after installing                      | WS `reload` → `session.reload()`, in place        |

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
| Agent readiness            | REST `GET /api/agent`                                            |
| One origin in deployment   | the server serves the built client; [deploy.md](deploy.md)       |
| Remote access from a phone | Tailscale or SSH tunnel; no auth code in the app                 |
| REST docs                  | generated OpenAPI + Scalar                                       |
| Socket docs                | `docs/protocol.md`                                               |
| Health                     | `GET /health`                                                    |

## Not building

Auth, accounts, multi-user, npm/git distribution (the deployment is a container
image), launcher, update checker, i18n, themes beyond light and dark, settings
settings forms for models, MCP, plugins or skills, file editing, commit history,
plugin or slot system, multi-pane layouts, a second engine, credential upload and
configuration import.

## Scope by milestone

**V1 (the product):** deployment, readiness, transcripts, composer, sessions,
extension dialogs, files, terminal, resources page, notifications.

**V2:** preview pane (static, then dev-server proxy), attachments and image
paste, transcript search, sub-agent side panel (only if a subagent extension is
installed), unread badges, MCP sign-in form.

**Never in v1:** everything in the list above.
