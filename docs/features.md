# Features and how each one is built

Status: **design.** Implemented slices and their checks live in
[plan.md](plan.md) and [plan/slices.md](plan/slices.md). One row per feature. The
"How" column is the point of this page: it records what is possible through pi's
RPC surface, what needs our own code, and what is deliberately left to the
terminal.

Legend: **RPC** = a pi command or frame · **REST** = our HTTP route ·
**WS** = our socket · **own** = our own module · **terminal** = the terminal tab,
inside the deployment.

## Sessions

| Feature                                                           | How                                                                  |
| ----------------------------------------------------------------- | -------------------------------------------------------------------- |
| List this project's sessions, with running and needs-input badges | REST `GET /api/sessions` (live state joined server-side)             |
| Open a session, read the transcript                               | URL `/sessions/{id}` + WS `attach` → `snapshot`                      |
| Start a session from the list                                     | own: navigate to a fresh id; pi writes the file on the first message |
| Full history, tree view (read-only)                               | RPC `get_entries`, `get_tree`                                        |
| Rename                                                            | RPC `set_session_name`                                               |
| New session                                                       | RPC `new_session`                                                    |
| Fork from a message into a new session                            | RPC `fork`                                                           |
| Clone the current branch into a new session                       | RPC `clone`                                                          |
| Switch to another session file                                    | RPC `switch_session`                                                 |
| Delete                                                            | REST `DELETE /api/sessions/{id}` (refuses while a child lives)       |
| Export to HTML                                                    | RPC `export_html`                                                    |
| Search transcripts                                                | own `server/src/sessions/search.ts`                                  |
| Pins, archive, project order, unread                              | own, `~/.epsilon/ui-state.json`                                      |
| In-session branch switching (`/tree`)                             | **terminal**; `navigateTree` is not an RPC command                   |

## Running a turn

| Feature                                    | How                                                                                      |
| ------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Send a prompt, with images                 | RPC `prompt`                                                                             |
| Steer mid-run, queue a follow-up           | RPC `steer`, `follow_up`                                                                 |
| Abort, clear the queue                     | RPC `abort`, `clear_queue`                                                               |
| Queue behaviour modes                      | RPC `set_steering_mode`, `set_follow_up_mode`                                            |
| `!command` / `!!command`                   | RPC `bash`, `abort_bash`                                                                 |
| Slash palette: skills, prompts, extensions | RPC `get_commands` in the snapshot; the picked `/name` runs through `prompt`             |
| Permission policy (strict, ask, yolo)      | extension command `/permission <mode>` via RPC `prompt`; mode read from its keyed status |
| Change model, reasoning level              | RPC `set_model`, `set_thinking_level`, `cycle_*`, `get_available_*`                      |
| Compact context, with instructions         | RPC `compact`                                                                            |
| Auto-compaction, auto-retry                | RPC `set_auto_compaction`, `set_auto_retry`, `abort_retry`                               |
| Context usage, tokens, cost, tool counts   | RPC `get_session_stats` + derived from events                                            |
| Stop compaction or retry mid-flight        | RPC `abort` path + `abort_retry`                                                         |
| Completion sound, needs-input notification | own, on `agent_settled` / dialog open                                                    |

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
| Cache-miss and cost notices         | WS events + `get_session_stats`; respect pi's `showCacheMissNotices`             |
| Skills invocation turns             | parsed from the user message, like pi's TUI does                                 |

## Readiness

The deployment owns its agent home, and setup happens in a terminal inside it
([ADR-0005](adr/0005-deployment-owns-agent-home.md),
[ADR-0006](adr/0006-setup-in-the-deployment-terminal.md)). The dashboard reads that
home and reports it. It never writes pi's configuration.

| Feature                                                                                   | How                                                               |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Report readiness: home path, configured providers, default model, packages, project trust | own `agent/home.ts` behind REST `GET /api/agent`                  |
| A missing step becomes a notice naming the terminal command that fixes it                 | own, on the not-ready state; never a silently failed turn         |
| Sign in, choose a model, record trust, enable packages, sign in to MCP                    | **terminal** inside the deployment: `pi`, then `/login`, `/trust` |
| Install a package                                                                         | **terminal** (`pi install`), then an idle-gated restart           |
| Credential upload, configuration import, settings forms                                   | **not built, by decision**                                        |

## Extension surface

| Feature                                                | How                                                       |
| ------------------------------------------------------ | --------------------------------------------------------- |
| `select`, `confirm`, `input`, `editor` dialogs         | WS `dialog` frames, answered from the page                |
| Toasts, status bar, widgets, window title, editor text | WS `ui` frames; keyed status and widgets replay on attach |
| Approvals and permission prompts                       | extension dialog flow; not a pi core feature              |
| `ctx.ui.custom`                                        | **unsupported. Visible notice + terminal tab** (ADR-0002) |

## Resources (read-only)

| Feature                                      | How                                                |
| -------------------------------------------- | -------------------------------------------------- |
| Loaded skills with scope and source          | REST `GET /resources`                              |
| Installed packages and versions              | REST `GET /resources`                              |
| MCP servers, enabled state, connection state | REST `GET /resources`                              |
| Remove, update, enable, MCP sign-in          | **terminal** (`pi remove`, `pi update`, `pi mcp`)  |
| Install a package                            | **terminal** (`pi install`, `pi mcp add`)          |
| Reload after installing                      | **WS restart** of that session's child, idle-gated |

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
