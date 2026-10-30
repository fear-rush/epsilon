# Slice checks

Status: **S1 to S5, S12, S13 and S17 are verified. S14 is active; S6 to S11, S15 and
S16 are open.** This page holds the checks. [../plan.md](../plan.md) holds the jobs,
the slice table and the risks.

A slice ends when you can run its checks yourself, by hand, in a browser. A slice
is not done because it compiles.

A check keeps its own state. `bun run dev` already writes to `.sandbox/agent`; a check
that starts a server, an engine or a browser sets `EPSILON_AGENT_HOME` to a scratch
directory and `EPSILON_PROJECT` to a scratch project. Nothing here verifies anything
against the operator's `~/.pi`, and `bun run dev:host` is never a verification path
(AGENTS.md rule 9).

### S1: One live turn

**Historical.** S1 drove `pi --mode rpc` and framed its stdout. S12 replaced the
child with an embedded engine ([ADR-0008](../adr/0008-embed-pi-engine-with-opinions.md)),
so the spawn and kill checks below describe what was done, not what the code does
now. Do not rebuild a child to repeat them.

- [x] A prompt sent from the browser streams a real answer back, incrementally
- [x] Kill the child mid-stream: the page reports the agent exited, no silence
- [x] A tool-using turn is recorded and committed to
      `shared/src/conversation/fixtures/`
- [x] `@earendil-works/*` is imported only in `server/src/agent/` and
      `shared/src/pi.ts` (`rg` proves it; no lint rule enforces it)

### S2: Transcript

Reducer plus renderers, driven by the fixture first, then live.

- [x] A session created in the terminal `pi` is readable in the browser
- [x] On a phone width: no horizontal scrolling, no layout jump while streaming
- [x] A `bash` card shows command and output; an `edit` shows a diff; an image
      result shows the image
- [x] A tool name with no renderer still renders (generic fallback, never blank)
- [x] Replaying a recorded fixture twice yields an identical transcript

### S3: Sessions and resume

- [x] The project's sessions are listed newest first; a pending dialog shows a
      needs-input badge
- [x] Open a session the CLI created, steer it, and the CLI shows the same messages
- [x] Close the tab mid-run, reopen it, and the run has continued
- [x] Deleting a session from the UI removes it from `pi`'s list too

### S4: Composer

All four are verified in a browser, including the palette: it carries 64 commands
in three columns, the arrow keys move the highlight, and picking `skill:find-skills`
wrote `/skill:find-skills ` and ran it. The palette is as wide as the composer, and
nothing overflows at 390px.

- [x] Steer mid-run and see the message land in the transcript
- [x] Abort, and the run stops in the CLI as well
- [x] Change model; the next turn uses it, and the CLI agrees
      (socket: `set_model` answered ok, the refreshed snapshot carries the new
      model, and a bogus pair answers `Model not found`; the menu is a
      DropdownMenu in the composer footer)
- [x] An installed skill or prompt template appears in the palette and runs
      (browser: the palette carries 64 commands with `extension`, `prompt` and
      `skill` sources; picking writes `/name ` into the composer, and
      `skill:find-skills` ran and answered)
- [x] `!ls` runs a shell command and its output is in the transcript
      (socket and reducer: the reply is followed by a snapshot carrying the
      `bashExecution` message)

### S5: Extension dialogs

- [x] A permission prompt appears in the browser; approving continues the run
- [x] A second tab cannot answer the same prompt twice: both tabs showed the
      dialog, one answer closed it in both, and the other had nothing left to press
- [x] Reload the page while a prompt is pending: it is shown again, and the run
      continues after the replayed answer
- [x] An extension using `ctx.ui.custom` shows the unsupported notice and points
      at the terminal tab: "An extension used custom, which needs the terminal tab."

### S13: A fresh home is usable

Epsilon's own defaults are code in `server/src/agent/defaults/`, registered after the
CLI's three built-ins ([ADR-0008](../adr/0008-embed-pi-engine-with-opinions.md),
decision 3). The checks below run against a scratch home: `auth.json` and
`models.json` copied from the operator's home, a `settings.json` naming only the
provider and the model, and no `extensions/` directory. That is the deployment shape
from [../deploy.md](../deploy.md), minus a container.

- [x] The permission guard loads and publishes its mode: the snapshot's commands
      carry `permission` and a `setStatus` arrives with `perm:ask` before any turn
- [x] `/permission strict` switches it and the status follows: `perm:strict` and a
      notify, with no run started and no message written
- [x] Under `strict` a `bash` call waits for a human, and a refused dialog blocks it:
      the dialog arrived as `confirm Allow bash? echo gate-probe`, and pi's session
      file records `Blocked by user: echo gate-probe`
- [x] Under `yolo` the same turn runs with no dialog at all, and its output is in the
      session file
- [x] An operator extension registering `/permission` wins instead of colliding: a
      probe file claiming the command and the status key became the only
      `permission` command, with no `permission:2`, and its status won
- [x] `discuss` is available on the same home, and its popup arrives as the
      browser's dialogs: the `select` carried `["Strict", "Yolo", "Type something."]`,
      picking the last one opened the `input` dialog, and the tool result was
      `User wrote: custom-answer-from-browser`; picking a preset gave
      `User selected: 1. Strict`
- [x] The readiness answer follows the home: `GET /api/readiness` replies
      `{"ready":true}` for the scratch home and `{"ready":false, home, detail,
      fix}` for an empty one, and one call costs about 4 ms
- [x] A browser pass, with Playwright, on the client pointed at the check server:
      the composer showed a `Strict` control after `/permission strict`, a `bash`
      turn raised `Allow bash? echo browser-probe`, refusing it left the card marked
      `failed`, `discuss` opened a dialog with the two presets plus
      `Type something.`, the answer read back as `User selected: 2. Yolo` once the
      tool card was expanded, and an empty home replaced every page with the notice
      and no composer ([note](../notes/2026-10-28-browser-checks-assert-ui-not-prose.md))
- [ ] The terminal tab shows the same defaults. It does not, and
      [ADR-0010](../adr/0010-defaults-are-engine-only.md) says so: S7 is where the tab
      passes them to the CLI with `-e`

### S6: Files and diff

- [ ] Browse the project tree; open a source file, an image and a CSV
- [ ] A path outside the project is refused with a path error, never read
- [ ] Open the diff of the file the agent just edited
- [ ] Insert a file path into the composer with `@`

### S7: Terminal

- [ ] `pi` itself runs in the terminal tab; `/login` works for OAuth, while the
      dashboard covers provider, MCP, skill and package configuration (ADR-0012)
- [ ] The tab's `pi` loads Epsilon's defaults through `-e`, so the same edit asks for
      confirmation there and `/permission` switches the same guard
      ([ADR-0010](../adr/0010-defaults-are-engine-only.md))
- [ ] Resize works, and the touch key row types Esc, Tab and Ctrl+C
- [ ] Closing the tab kills the pty: `pgrep -f pi` shows no orphan

### S8: Resources

- [ ] Skills, packages and MCP servers are listed with scope and source path
- [ ] Install a package in the terminal tab, restart the session, and its tool
      appears in the browser
- [ ] Nothing on this page writes

### S9: Preview

- [ ] Preview an HTML file the agent wrote, from the phone
- [ ] A dev server started by the agent is previewable, and edits hot-reload
- [ ] The previewed page cannot read the API (`fetch` fails from the frame)
- [ ] Preview / Source / Diff tabs agree with each other

### S10: Notifications

- [ ] With a pending prompt and no open tab, a notification arrives on the phone
- [ ] A finished run notifies once, not once per message
- [ ] Opening the notification lands on the right session

### S11: A deployment you can reach from a phone

The container, the volume and the single origin. Details in
[../deploy.md](../deploy.md). Setup is the dashboard, except OAuth login, MCP sign-in
and trust, which stay in a terminal inside the deployment
([ADR-0012](../adr/0012-configure-in-the-dashboard.md)).

- [ ] One published port serves the client and the API; a page reload works
- [ ] The agent home is the container's volume; the host `~/.pi/agent` is untouched
      (compare a file's mtime before and after a turn)
- [ ] Rebuild the image, restart, and the home, its packages and its sessions are
      still there
- [ ] From the phone over the tunnel, open a session and get a real answer
- [ ] Publishing is bound to loopback: a request from another host on the LAN is
      refused, and the error names the reason
- [ ] `EPSILON_PROJECT` decides the session list, and the agent's `pwd` agrees
- [ ] Deleting the volume and starting over reaches a not-ready notice that names
      the missing step and opens Settings, instead of a broken session
- [ ] The notice names the missing step and the home path; an untrusted project
      shows its own notice rather than a silent downgrade

### S12: Embedded engine

The engine runs in the server instead of a child process
([ADR-0008](../adr/0008-embed-pi-engine-with-opinions.md)), and the socket carries
Epsilon's own commands ([ADR-0009](../adr/0009-socket-speaks-epsilon.md)). Every
check below was run in a browser; socket evidence is named where it proves
something the page cannot show.

- [x] A prompt streams a real answer with no `pi` child: `pgrep -f "mode rpc"` is
      empty while the turn runs, in the page and in `server/scripts/protocol-check.ts`
- [x] Steer, abort, the model picker, `!cmd` and the palette behave in the page as
      they did on the child: a steer lands as a user message, abort settles the
      run, a model switch is used by the next turn and survives a reload, `!echo`
      makes a bash card, and a palette skill ran
- [x] A session written elsewhere opens, and a turn from this engine is readable:
      attaching to a session that another process wrote returned its transcript,
      including messages written moments earlier
- [x] `codemode`, `tool_search` and MCP are active when the settings ask for them:
      the three built-ins are registered the way the CLI registers them, `codemode`
      is active in this home, MCP's `/mcp` command is registered, and
      `tool_search` stays inactive because neither the settings nor an MCP exposure
      asks for it
- [x] The operator's own extensions load (permission, fff, subagents) and their
      dialogs are answered: a tool call blocked on `confirm` and continued from the
      socket
- [x] A replaceable built-in is dropped when the operator's extension registers the
      same command or tool name, instead of appearing as `name:2`: a probe extension
      registering `/mcp` became the only `mcp` entry, with no `mcp:2`, and removing
      it restored the built-in after `/reload`
- [x] `/reload` re-reads resources without restarting the server: it answers ok
      while idle and while a run streams, the run settles, and the probe extension
      appeared and disappeared only after a reload
- [x] A tab that closes with nothing running disposes its session after ten seconds,
      and the next attach rebuilds it from the session file; a run or a pending
      dialog keeps it alive. Verified: a run grew from 172 to 548 characters across
      a close and reopen, and the session reported `running: false` after twelve
      idle seconds

### S14: Reach the web and delegate

[ADR-0011](../adr/0011-third-party-tools-as-dependencies.md): `pi-web-access` and
`pi-subagents` become pinned dependencies of `server` and are loaded by path, with
their skills and prompts, from the same loader that gets Epsilon's defaults.

- [ ] On a fresh home, `web_search` and `fetch_content` answer, and the result lands
      in the transcript as a tool card
- [ ] A subagent runs from the browser and its result arrives; its TUI widgets show
      the "needs the terminal tab" notice instead of breaking the run
- [ ] `pi-subagents` skills and prompts are in the palette without an install step
- [ ] The home's own copy wins: a deployment whose `settings.json` names the same
      package loads one copy, not two, and the resources view says which
- [ ] The engine keeps no duplicate tool names: `getAllTools()` has one entry per
      tool, and a second registration would have been skipped by name

### S15: See what the context is spending

The browser replacement for `pi-context-view`, built from the engine rather than the
extension: `AgentSession.getContextUsage()` and `AgentSession.getSessionStats()`.

- [ ] The page shows the context window used against its limit, and it updates as a
      run streams
- [ ] A per-part breakdown (system, tools, messages) matches what the engine reports
      for the same moment
- [ ] Nothing is read from `pi-context-view` or its files; removing the package
      changes nothing on the page
- [ ] A session with no usage yet shows a state, not a zero

### S16: Paste an image into the composer

The browser replacement for `pi-paster`: the `prompt` frame carries images and
`AgentSession.prompt(text, { images })` receives them.

- [ ] A pasted image becomes an attachment chip in the composer and is sent with the
      next message
- [ ] The transcript shows the image the model received, not the path
- [ ] A message with an image and no text is allowed; an image over the size limit is
      refused with a notice, never silently dropped
- [ ] `steer` accepts an image too, with the same rules

### S17: Configure providers, MCP, skills and packages in Settings

[ADR-0012](../adr/0012-configure-in-the-dashboard.md): the dashboard writes pi's
documented files and calls its exported writers. The not-ready notice opens the
panel instead of naming a terminal command.

Server and reducer checks, run over HTTP against a scratch home:

- [x] A home with no credential answers `ready: false`, and the fix names Settings
- [x] `POST /api/settings/providers` writes the documented `models.json` entry with
      mode 0600; the next snapshot lists it, marks it configured from
      `models_json_key`, and readiness flips to ready
- [x] `PUT /api/settings/default-model` writes `defaultProvider` and `defaultModel`
      into `settings.json`
- [x] MCP add and delete, skill create, read and delete, and package refusal all
      return the documented answer and restore the empty shape when removed
- [x] A write refuses a file it cannot parse instead of replacing it
- [x] An entry pi cannot compose (a provider with no `api`) arrives as one sentence in
      the panel, from `ModelRuntime.getError()`
- [x] A failed provider call renders as an `Alert` with pi's `errorMessage`, rebuilt
      from the assistant message in a real session file
- [x] The list carries only configured providers (plus every built-in for the
      picker), and a built-in detail reports `builtin: true` with its catalog
- [x] Saving only an API key for a built-in writes `{ "apiKey": … }` and leaves pi's
      catalog intact; the entry then lists as configured
- [x] A provider detail exposes header names but no values, full model entries and
      `modelOverrides`
- [x] A header write keeps a stored value when the row is blank, removes a header
      left out of the record, and the form refuses a new row with a missing name or
      value
- [x] `thinkingLevelMap` and the reasoning compat round-trip through a provider write,
      and unknown keys survive on both
- [x] Fetch returns ids from `/models` for the OpenAI family and `/v1/models` for
      Anthropic; the stored key is used server-side and is withheld from the page
- [x] A `/messages`-only model imports with the Anthropic API and the base above its
      `/v1`; a `/responses`-only model gets that API; an exact id and API copy pi's
      reasoning, map and adaptive switch
- [x] A provider/model test at a level names the sent field and the returned
      reasoning tokens, runs keyless and keyed, and refuses a malformed key
- [x] The API table pins each family's path and the model-list path: commandcode's
      `/provider/v1` is followed by `/chat/completions` and `/responses`, Anthropic
      adds `/v1/models`, and Google has no shared list
- [x] Removing a provider drops its `models.json` entry and, when the key is stored
      in `auth.json`, logs the provider out, so the row does not come back
- [x] A provider write refuses a blank required field, an unsafe id and a relative
      base URL, and a model refuses a non-numeric token count and a half-filled cost

Provider identity, reasoning, import and tests (verified by code and real provider requests):

- [x] A custom provider's name derives a unique id (`-2` on a collision), the id is
      not shown, a duplicate name is refused, and the id is fixed after save
- [x] The Providers page lists configured providers by name and model count; a
      custom provider does not repeat its id, and a pi-shipped one says `pi default`
- [x] The base URL field names the resolved request URL and warns when the base
      repeats the family's path, without rewriting it
- [x] A stored header row with a blank value keeps it; a new row needs a name and a
      value; adding and removing a row animates it open and closed
- [x] A mixed model list gives each model its own shape, and an exact pi catalog
      match supplies its reasoning metadata
- [x] A reasoning model shows the level matrix and compat fields; the composer
      offers its supported levels and hides the control when only Off exists
- [x] Test opens a model picker and level select; the model dialog's Test uses the
      same level select, disabled until Reasoning model is on
- [x] A new provider's footer is Test, Cancel, Save; Cancel confirms before
      discarding, and a saved provider's footer is Test, Delete, Save
- [x] A failed settings query replaces the providers route with one sentence, with
      no list, editor, retry label or back button

Browser checks, confirmed by the operator:

- [x] The bottom-left deployment card opens a menu, and Settings from it opens the
      full page; the not-ready notice links to the same page
- [x] The API picker names each family with the path it appends, and the model count
      sits in the group title ("Models pi ships (29)")
- [x] A built-in catalog is read-only; Override writes `modelOverrides`; Add model or
      Fetch models from provider asks before replacing the catalog, and Use pi's
      catalog undoes the draft
- [x] A stored header row with a blank value keeps the stored header after save;
      removing the row removes the header
- [x] Fetch models from provider returns ids for an OpenAI base and an Anthropic
      base, and is disabled for Google
- [x] A provider added on the page is visible without a reload, its key stays hidden,
      and the General default-model picker searches and offers its models
- [x] Leaving the editor with unsaved changes asks to discard; saving a new provider
      navigates to its route without the prompt; the footer stays pinned to the
      bottom of the column
- [x] MCP, skill and package sections add, edit and remove their entries, and error
      text appears in the form; MCP reads "Add MCP"
- [x] Settings is a full page with its own navigation, not a modal; Search filters
      the sections, Back to app returns to the session list, and the phone layout
      keeps every section reachable
- [x] A live session picks up a new provider, MCP server or skill without a restart
- [x] `rg -i rpc server shared client` finds no engine path that enters pi's RPC mode
      or speaks its envelope; `mode` is `"json"` and a prompt source is `"interactive"`
      or speaks its envelope; `mode` is `"json"` and a prompt source is `"interactive"`
