# Decisions

The choices that hold today, with the reason and the option that was rejected, so a
rejected option is not proposed again. Code and commits cite a decision by its heading.
pi facts live in [pi-sdk.md](pi-sdk.md), each with the pi file it was read from.

## Web interface for pi, keeping pi's concepts

Epsilon brings pi to the browser instead of the TUI. pi's files stay the only truth:
sessions as JSONL, `settings.json`, `models.json`, `auth.json`, MCP, packages, trust. A
terminal pi on the same home is the same agent, and Settings writes there.

Why: the operator already has an agent home; a second, Epsilon-shaped store would make
the dashboard and the terminal two different agents.

Not: a database of Epsilon sessions. A vendored copy of pi's concepts with different
names.

## One program, one socket

One Bun process serves the page and holds one WebSocket. The browser calls typed
functions; there is no REST API, no OpenAPI document and no generated client.

Why: Epsilon runs on the same machine as the browser, so an HTTP surface would exist
only for Epsilon to call itself. Effect RPC gives framing, ids, streams, interruption
and typed errors over one connection, and the protocol is one schema module both sides
import.

Cost accepted: no curl, no third-party clients, no API docs page.

Not: Hono and `openapi-fetch`, deleted with the old tree. pi's own RPC mode (see the
engine decision). A desktop shell's IPC as the first transport; it can be added later
from the same definitions.

## One engine process per live chat

Each open chat runs Epsilon's own small program in a child process, embedding pi's SDK
inside an `AgentSessionRuntime`. The server supervises it: spawn, heartbeat, memory caps,
restart policy, shutdown order, orphan cleanup.

Why: an engine or extension can throw, leak, spin or call `process.exit`, and Bun exits
on an unhandled rejection. In one process that costs every chat and the dashboard; in a
child it costs one chat, which restarts from its JSONL.

Cost accepted: about 230 ms and 60 MB per open chat, a tagged message set to own, and
registry answers that used to be synchronous become effects with a timeout.

Not: keeping pi in-process and hardening it (still loses everything to a loop or
`process.exit`). A worker per chat (memory limits are ignored, a native crash takes the
parent). pi's `--mode rpc` (no reload, no tree navigation, no tools or system-prompt
listing, `getEditorText()` empty). Engines outliving the server: they would need
version-skew handling and orphan adoption.

## `ready` before extension binding

An engine reports ready, and accepts tabs, as soon as its runtime and session exist. Its
commands and queries wait on a separate `bound` gate until pi's extensions have finished
`session_start`.

Why: pi awaits every `session_start` handler, and an extension may ask a question there.
The question needs an attached page, the page needs a tab, and the tab needs `ready`, so
binding inside `ready` deadlocks: the chat does not open, and pi stays blocked. Splitting
the two breaks the cycle and keeps a half-bound session from answering a prompt with the
wrong tool list. A bind that fails refuses commands with the reason and raises a notice
instead of killing the engine before its first frame.

Cost accepted: a chat can be open, and look idle, while binding is still in flight; the
status line reports it busy. A prompt sent in that window waits rather than failing.

Not: answering a question asked during `session_start` with pi's default, which decides
for the operator (a permission confirm would read as "no"). Not: buffering the question
until a tab attaches without gating commands, which lets a prompt run with an
unfinished tool set.

## The session index is derived

A SQLite index in `<home>/.epsilon/session-index.sqlite`, with one write connection,
rebuilt on any doubt. Listing is a stat, opening a chat is a byte-offset read, and the
transcript arrives as a window plus history pages.

Why: pi's `listAll` parses every byte of every session file, and the old sidebar asked
for it every five seconds. Reading a 46 MB session into one frame was the same mistake
in another place.

Cost accepted: the index reads pi's session fields directly, so a conformance test pins
it to `SessionManager.listAll` and must pass after every pi upgrade. Delete the index
and nothing is lost.

The index holds sessions and their entry offsets. It does not hold a project list or the
pins: those come from settings and `<home>/pinned-sessions.json` at read time, so they
cannot disagree with what pi sees.

Not: caching `SessionManager.listAll` in memory (same parse, plus staleness). Writing a
new session format. Keeping the index only in memory.

Open: the design put the writes in a Worker; it was not built, and the sync runs in the
server process, so a cold build stalls the socket. Whether to build the Worker is an item
in [the rebuild plan](../archive/docs/plan/04-safety.md).

## The sidebar pages its lists

The session column shows ten Projects, ten Chats and ten chats inside an expanded
project; `Load more` adds ten to that list. Pinned chats keep their place at the top of
Chats. Projects are ordered by the newest chat activity in the folder, not by name,
because a project is derived from its sessions' `cwd` and activity is the only recency it
has. Search reads the whole list and shows every match, so a page never hides a chat from
a search.

Why: the operator's real home held 73 project folders, one of them with 103 chats.
Alphabetical projects put `.agents` and `.pi` above the work, and the column was a wall.

Not: server-side paging, a protocol change that duplicates the grouping and trust reads
for a few hundred rows. Not: a stored project list; pi has no project record
([pi-sdk.md](pi-sdk.md)).

## An engine cap

`Engines.maxRunning` (default 8, in Epsilon's own settings file) counts engine
processes, including the transient ones used for copy and export. At the cap, the
supervisor closes the least recently used idle engine; it never kills a running turn. If
nothing is evictable it refuses with the count and a pointer to the setting.

Why: each engine is a process. Twenty tabs must not mean twenty processes, and silently
killing a turn is worse than refusing a click.

Not: unbounded processes with an OS-level OOM as the limiter.

## Concurrent writers are detected, not prevented

pi does not lock session files. One writer per session is enforced by Epsilon where it
can: an advisory lock file for other Epsilon processes, and a poll every 250 ms that
compares size and mtime against the last append the engine recorded. A mark queued just
after a change gets a 50 ms settle before the change is called foreign, because pi
persists a message after it notifies.

A foreign append makes the chat read-only in Epsilon with a notice and a Reload action.
A running turn is not aborted; its next append is refused with the same notice. Reload
disposes the runtime and re-opens it from the file.

Why: a terminal `pi --continue` beside an open tab is a legitimate thing to do. Losing
the operator's other turn silently is not.

Cost accepted: Epsilon cannot stop a terminal writer, so the contract is a notice.

Not: rewriting pi's session manager. Blocking the file for other tools.

## A command is acknowledged, not completed

The engine answers a `prompt` when pi accepts it (`preflightResult`), not when the run
ends. Run failures arrive later as notices and frames; a rejected prompt fails the
command. The same reply carries steer and follow-up acceptance.

Why: the old design awaited `prompt()`, so a slow `agent_settled` handler held the tab's
command for as long as the handler ran (F6).

Not: await the whole run and report its outcome as the command result. A tab that
reloads mid-run already rebuilds from the session file.

## The tree travels on demand

The snapshot carries the window, notices and the session id; the flat branch tree is
sent only when a tab asks (`loadTree`), as one `tree` frame. The picker asks when it opens,
and the jump rail asks when its loaded window has fewer than five user turns, so a long
assistant reply cannot hide the rail. 50,000 rows in every snapshot would exceed the 2 MB
frame budget and re-send what the picker already has.

Why: the old snapshot held the whole transcript and a recursive tree, 46 MB for a 46 MB
file (F5).

Each row carries what main's picker needs (`kind`, `text`, `hasText`, `label`, `active`,
`current`), and a row pi's default view hides names its nearest kept ancestor as
`parentId`. The reducer nests them in one pass when the frame arrives, so the wire stays
non-recursive and main's filter and tree dialog port unchanged.

Not: a recursive tree schema; a window that includes the tree; a tree endpoint separate
from the conversation stream.

## Moves and copies are pi's own

`/tree` moves pi's leaf inside the same session file; `/fork` copies the history before a
chosen message into a new file; `/clone` is the same copy taken where the chat stands. All
three are pi's operations reached as engine commands, and the page follows the new session
id the replacement broadcasts. A tree label is pi's `label` entry and the tree filter is
pi's `treeFilterMode` setting, so a terminal using the same home shows the same labels and
the same filter.

Why: main copied sessions through an HTTP route and kept the tree filter in the browser.
Neither is needed when the engine owns the session, and a browser-side filter would
disagree with pi's own picker.

Not: a copy route beside the one command boundary; a tree filter stored in Epsilon's own
settings.

## The composer's readings travel as their own frame

pi's context usage, the session's totals and the cache warmer are one `readings` frame.
It follows a snapshot and is sent again when pi's numbers change: an assistant message
ends, a compaction ends, a run settles. `main` carried them inside its snapshot state,
which this branch does not have; this branch's snapshot carries the window and notices,
and its switches ride in `sessionMeta`. A reading is not a switch, and it changes on its
own events.

Why: one frame for one answer, and a resync brings the numbers with the transcript
instead of leaving the page to guess when they are stale.

The cache warmer is the one reading that needs a timer: pi fires it on its own schedule
and sends no session event when it does, so the engine keeps one scoped fiber armed for
`nextWarmAt` and publishes the reading when it wakes. A moment in the past is never
armed again, so a coarse clock cannot spin.

Not: fields on `sessionMeta`; polling the warmer on an interval; a countdown drawn by the
page from a moment it never observed.

## Effect on the server, React on the page

Server, engine and the client's runtime layer use Effect: typed errors, scoped
resources, fibers for runs, `Clock` for time. React components stay React, and the
conversation reducer stays a pure function in `src/domain/`.

Why: every failure and every possibility is a value, resources close in reverse order,
and a test controls time instead of sleeping.

Cost accepted: a style to learn and to enforce; [effect.md](effect.md) is that style, and
lint holds the parts a reviewer would otherwise repeat.

Not: zod beside Effect Schema (two schema languages). Adapters that let old code run on
Effect: the old tree was deleted instead.

## Effect Schema replaces zod

Every wire shape, tagged error and form contract is an Effect `Schema`.

Why: Effect's RPC, `Schema.TaggedError` and forms take the same schema, so one
definition covers validation, the type, the wire encoding and the form.

Not: keeping zod for the client forms; `Schema.toStandardSchemaV1` covers that.

## Virtualize the transcript and the session list

`@tanstack/react-virtual` drives both, after the per-frame work is fixed and row keys
are stable entry ids.

Why: a 5,000-entry chat and a 500-row sidebar are normal for an agent that has been used
for a month. Virtualizing before the keys are stable would move the bug, not fix it.

Not: paginating the transcript as the primary mechanism; it stays as the loading path
for history beyond the window.

## Scrolling on send

Sending scrolls your message to the top of the view. While that anchor is active, the
transcript does not follow new output; it resumes following once you scroll to the end.

Why: the operator's own message is the reference point for the turn, and following
output fights reading it.

Cost accepted: some output arrives off-screen while the anchor is held.

Not: "always follow output", which was offered and declined.

## The chat is composed from shadcn AI Elements

The turn's steps are the copied AI Elements patterns in
`src/app/components/ai-elements/`: Chain of Thought around a turn, Reasoning inside it, Plan
when the assistant declared its calls up front, Task for the live steps, and Tool, Terminal,
Test Results, Stack Trace, Subagent and File Tree for what a call produced. The composer's
menus, the context card, the confirmation and the sources use the same set.

Why: the owner asked for the AI Elements surface, and the patterns share one Trace and one
Code Block, so a new step reads like the steps beside it. The code is vendored, so it can
follow this branch's tokens without a package release.

Not: keeping bespoke rows for each kind, which is what the port had and what made a plan and
a tool two layouts. Not: a dependency on a pattern package, because the patterns are source
that a feature composes.

The thread is the one place the pattern stops at Message and Bubble: TanStack Virtual owns
the scroll and the rows, because a 5,000-entry chat and the jump rail need one scroll owner.
Message Scroller's content mutation and auto-scroll would fight the virtualizer.

Not: dropping the virtualizer for the primitive's viewport; the long-chat flow and the jump
rail are the behavior the transcript is tested on.

The model picker is the other exception: pi offers hundreds of models, so it keeps a
searchable Command in a Popover instead of the Model Selector's scroll-only radio menu.
The thinking menu stays the second menu of that pattern.

Not: making the model menu literal; a 94-model sandbox list and a 510-model real list cannot
be searched by scrolling.

## The jump rail owns a gutter

The transcript's jump rail is a sibling of the scroll area with its own reserved column on
the transcript's left, not an absolutely positioned layer over the transcript. It lists the
active branch's user turns: the loaded window when it holds at least five, else the tree.
A dot older than the window walks history pages until its row is loaded, then scrolls there.

Why: its dots sat over a tool result's code and stole the clicks under them. A gutter keeps
the rail visible, and a wide row cannot reach it. A long assistant reply pushes the user
turns out of the 50-row window; hiding the rail there removed the only overview of the chat.

Not: adding more left padding to the transcript, which still meets a wide tool result in a
narrow window. The dot of the newest turn is marked whenever the reader is at the end of the transcript,
even when the rows above the fold belong to the turn before it: "I am on the last message"
is what the rail has to say then. A dot grows and darkens under the pointer, so the small
target reads as clickable.

Not: hiding the rail on wide screens, where it is most useful. Not: a second
session read for the rail; it uses the tree the picker already asks for.

## Local security is checked where the attack is

Bind `127.0.0.1` only. On every request and upgrade check `Host` (defeats DNS
rebinding) and `Origin`; require a per-launch token that the served page carries in a
meta tag and the client sends in its opening call. Engine IPC is a pipe, not a listening
socket.

Why: Epsilon can run bash with the operator's rights, and any web page can attempt a
local WebSocket. A token in the served HTML is unreadable to a page on another origin,
and a `Host` check stops the attacker from becoming "same origin" via DNS.

Not: a password or account system; there is one operator and one machine.

## Logs and crash reports exist before the failures do

One JSON-lines log in `<home>/.epsilon/logs/` with rotation and secret redaction. Every
supervisor decision (spawn, kill, crash, recycle, eviction) is a line. A crash writes a
record with the exit, signal, the last log lines, the heartbeat, and the versions, never
message content. Settings → Diagnostics shows running engines and the last crash
records, with a copy button.

Why: a child process exists so that its failures are containable; containable is only
true if the failure is visible afterwards.

Not: stdout scraping, or a crash report that carries conversation content.

## Tests are bounded and time-aware

`bun test` with an Effect wrapper; `TestClock` for every timer; `until()` as the only
waiting helper; a suite budget of 10 s; real-process tests under 5 s with a finalizer.

Why: a hanging test teaches nothing and blocks the next step, and a real sleep makes a
one-second test into a two-second one for no information.

Cost accepted: anything that genuinely needs wall time says so in a comment.

Not: vitest and `@effect/vitest`; the repo's runner stays `bun test`.

## Full rebuild, no transition code

The old `client/`, `server/` and `shared/` were deleted at the start and kept only as
`main`'s history. No adapters, shims, dual schema languages, old wire
frames or index-key fallbacks.

Why: compatibility code is permanent and hides the design it was meant to protect.

Kept compatible on purpose, because they are not Epsilon's legacy: pi's files, and
`<home>/pinned-sessions.json` (same path and shape).

Amended 2026-11-04: "no transition code" covers code, never features. The first version
said the plan, not the old tree, was the reference, and let the app stay broken until
the end. The plan listed architecture but no features, nobody could open the app to
notice, and much of the UI was lost (the MCP settings kept 4% of their code). See
"`main` is the feature specification".

## `main` is the feature specification

Every feature, screen, word, animation and test of `main` at `48226bb` is ported 1:1.
What may differ is a closed list in [the rebuild plan](../archive/docs/plan/03-port.md): the data source,
the schema language, file boundaries, render performance and the feedback system.
Dropping or changing anything else needs the owner's dated yes in the ledger. The app
runs after every commit.

Why: the rebuild is a better foundation for the same product, not a new product. A
rewrite from a description loses whatever the description left out.

Not: rebuilding screens from the plan's prose; "the app runs at the end".

## One name per concept across the roots

A concept has one name in `src/protocol/`, `src/backend/`, `src/app/features/` and the
URL: `settings/mcp` everywhere, not `config` on the server and `settings` on the page.

Why: two names for one thing (`config`/`settings`, `engine`/`engines`,
`catalog`/`sessions`) sent agents to the wrong folder. The moves are in
[the rebuild plan](../archive/docs/plan/01-structure.md).

## Feedback has one surface per scope

An app-wide problem goes to the status line, a crashed route to a route error inside the
shell, a pane's state to `StatusView`, a section's message to `Notice`, a control's
result to `InlineStatus`, a field's to `FieldError`, a turn's to the transcript. One tone
vocabulary, one error translator (`errorView`), no toasts. The rules are in
[ARCHITECTURE.md, Feedback surfaces](ARCHITECTURE.md#feedback-surfaces).

Why: `main` had three tone vocabularies, raw alerts, full-page route errors and ad hoc
red text, so the same failure looked different on each page.

Not: toasts. A message that disappears is a failure nobody saw.

## One package, no workspaces

One `package.json`, one lockfile, no turbo. `src/protocol`, `src/domain`, `src/backend`,
`src/engine`, `src/app` are separated by tsconfig project references and lint import
rules.

Why: three packages existed to separate DOM types from Bun types and to run three build
tasks. Project references do the first; one Vite build and one server build do the
second.

Not: keeping turbo for a two-command build.

## Files are split by meaning

No file that only re-exports or wraps one line. No folder for one file. A split happens
when a file holds two concepts, not to hit a line count.

Why: the old tree had one-line route files and a wrapper for every call, which made the
real shape hard to see. [ARCHITECTURE.md](ARCHITECTURE.md#file-rules) carries the rules.

Not: a maximum line count. Meaning, not size, decides.

## Tight tooling, strict from line one

Type-aware Oxlint with every rule at error, the Effect rule preset, Oxfmt sorting,
Knip with config hints as errors and cycle detection, strict TypeScript, `prek` hooks.

Why: with the old tree deleted there is nothing to clean up later, so every rule can be
on from the first line. A rule added later costs a sweep and a debate.

Cost accepted: the lint command is `effect-tsgo oxlint` (stock Oxlint cannot read the
Effect preset), and an Oxlint bump past `1.90.0` must wait for `@effect/tsgo`.

Not: the `style` and `restriction` categories, `react-perf`, and per-rule severity
tuning before there is code to judge.

## Upgrading pi is a procedure, not a version bump

pi is pinned exactly. An upgrade is one commit that reads pi's changelog, runs the
catalog conformance test, re-checks the facts in [pi-sdk.md](pi-sdk.md) that code relies
on ([the procedure](pi-sdk.md#upgrading-pi)), and passes `check`, e2e and benchmarks. An upgrade that fails for a reason not
understood is refused.

Why: the index reads pi's fields directly and the engine depends on pi's runtime shape.
A silent behaviour change there breaks chats in ways tests would otherwise miss.

Not: a version range, or upgrading to pick up a feature mid-step.

## A feature that needs the other direction takes data as a prop

`sessions` imports `projects` (the sidebar opens the folder picker), so `projects` may not
import `sessions`. The continue gate needs the chat list, which `sessions` owns: its caller
reads the list once and passes `recent` down, rather than `projects/queries.ts` growing a
hook that reads across the edge. The lint's `no-feature-internals` and `no-cycle` rules
enforce both halves.

Why: main had no such edge because every feature called its own HTTP endpoint. One socket
with feature roots makes the direction explicit, and a cycle here is a real build-order
problem, not a style preference.

Not: lifting the read into `hooks/` or `lib/` yet. ARCHITECTURE.md's file rules say to do
that on the third use; this is the second.

## The chat's missing folder is a field of the list

`SessionSummary.cwdMissing` is computed by the server when the list is read, one stat per
distinct folder, and it travels with the row. The page gates on it before it attaches.

Why: only the server can answer whether a folder still exists, and the gate must decide
before an engine starts. A second read from the page would be a second truth for the same
question.

Not: the page checking through a folder-picker call, or the engine refusing after it
attached. Both would show the chat first and explain second.

## A dialog's deadline is a clock time, not a countdown

The engine sends `deadlineAt`, the time the question closes at, read from `Clock`. The
page counts down from it; a tab that attaches late, or a reconnect that replays the
question, sees the time pi's deadline has left instead of restarting the count. pi's own
`select`/`confirm`/`input` take a `timeout`, and the engine turns it into that time once.

Why: a countdown sent as a duration is only true at the moment it was sent, and main's
server had to recompute the remaining time on every replay. One absolute time needs no
recomputation and cannot drift between two tabs.

Not: `timeoutMs` as remaining milliseconds, or the page starting its own timer.

## Moving a chat into a project is a fork, and the original goes

`sessions.move` hands the file to pi's `SessionManager.forkFrom`: the whole history is
written as a new session in the project folder, under a new id, and Epsilon then deletes
the old file. The page follows the new id.

Why: a session records the folder it ran in, so a plain file rename would leave the chat
claiming a folder it is not in, and the project's resources would never load. pi already
has the operation that rewrites the folder, and a second copy would only make two rows for
one conversation.

Not: renaming the file and leaving the recorded folder alone. The old service did that,
and nothing used it.

Cost accepted: `SessionManager` is now one of the pi surfaces `platform/pi.ts` imports
(AGENTS.md, invariant 1), because the fork is a file-level operation and an idle chat has
no engine to ask.

## Another agent's skill folder is linked, not copied

A folder other agents keep (`~/.claude/skills`, `~/.codex/skills`, a project's
`.claude/skills`) is read through pi's own loader and, when linked, its absolute path goes
into the `skills` setting of the scope it belongs to. Unlinking removes every entry that
names it and nothing else.

Why: pi already reads a folder a path names, with the same parser, warnings and reload as
a skill under a root. A copy would go stale the moment the other agent edits its skill, and
would leave two files with one name.

Not: copying the folder into `~/.pi/agent/skills`. Not a symlink: pi records the folder it
read, and a link would still need the same setting entry to be found.

Cost accepted: the page may only link a folder Epsilon detected, so a path pasted or typed
into a request is refused.

## A pasted skill archive is unpacked on the server

The import sends a picked `.zip`, `.tar`, `.tar.gz` or `.tgz` as one file. The server
unpacks it with the same `src/domain/skills/archive.ts` that the upload path already used,
and every entry goes through one set of path rules there.

Why: one unpacker cannot disagree with another about what a path means, the checks that
matter run where the files are written, and the page stops shipping a zip parser. The old
dialog unzipped in the browser and uploaded the entries, so two implementations had to
agree on stripped paths, modes and size limits.

Not: unzipping in the page. Not trusting the archive's own paths.

## A project's chats are chosen by the server

`sessions.removeProject` takes a folder, asks the index which chats ran in it, checks
every one for a live engine, and only then deletes the files and their pins. The page
passes the folder's path and no list.

Why: the page's rows can be a refetch behind the files. A loop of `sessions.remove` from
the page deleted the chats it happened to know about and then failed on the one that was
still open, so a project could be left half deleted, where main's route refused the whole
answer before touching a file.

Cost accepted: the sidebar's "N chats" sentence comes from the same list, so a chat a
terminal pi wrote after that refetch is deleted without being counted there.

Not: a per-chat loop on the page. Not deleting from a list the page supplies.

## MCP sign-in runs in the chat's engine

`settings.mcp.command` sends pi's own `/mcp login|logout|reconnect <name>` line to a chat
already running in the settings folder, through `Engines.command`. It refuses when no chat
is open there, in pi's own words, instead of pretending it ran. The extension asks for the
redirect URL through `ui.input`, which the page already draws, and opens the authorization
URL on the machine running the engine.

Why: the connection and its OAuth state belong to the engine that holds the MCP client. A
second client in the backend would open a second connection per server. The owner approved
this in place of the earlier invariant ("MCP sign-in stays in the terminal"); invariant 5
now says Epsilon never writes `mcp-auth.json`.

## The index yields between slices, it is not a worker

The catalog reconciles session files in the process that holds the socket, and Effect does
not preempt synchronous work: a cold build on the owner's real home (1.8 GB, 955 sessions)
took **14.7 s** during which the server answered nothing. `sync` now hands control back
with `Effect.yieldNow` when a slice has run 40 ms, so one slice is the longest the server
is deaf.

Why: measured on that copy, the freeze was every open tab. The fix is one loop condition,
one writer, and no second process to own; `catalog-stall` (100 ms) reads 49 ms with it and
653 ms without, and a catalog test proves another fiber gets turns — it sees zero without
the yield. Cost accepted:
the cold build is ~7% slower (15.7 s), paid once when the index is built.

Not: a Worker with the index's write connection. The design named one, but a second
context plus a message protocol buys nothing the clock-gated yield does not, and it would
have to share the sqlite connection that must stay single-writer.

## pi's `sessionDir` decides where the list reads

pi writes a folder's sessions under `<agent>/sessions` unless a settings file names a
`sessionDir`, which pi resolves against the folder. The catalog reads pi's own answer for
the home's chat folder and for every folder its rows name, and reconciles those roots.

Why: before this, a home or project that moved its sessions had no chats in the dashboard
at all — not listed, not openable, not deletable — because the index walked one root. The
window line has to follow the same setting.

Cost accepted: a folder that moved its sessions is only discoverable from a chat's
recorded cwd, so a brand-new session in a custom folder is found on the next list read,
which is also when main listed it.

Not: a second root list the operator maintains by hand. Not refusing a custom
`sessionDir`.

## "Can run a turn" counts configured providers

The General page's Status row counts, and the Default model picker offers, only models
whose provider pi reports as configured. The settings rows still describe every composed
model.

Why: pi's catalog is a catalogue, not a bill of health — on the dev sandbox it composes
1693 models against one credential, so the row promised runs that would fail. pi's own
answer to "configured" is the one the engine obeys.

Not: counting the whole catalog and rewording the sentence.

## A chat pi cannot total opens, and says why

pi's `getSessionStats()` reads `message.usage.input` on every assistant message and
throws when one has none, which only a hand-written file does. The readings are computed
on the engine's event loop behind `Effect.try`; a chat pi cannot total sends one notice
("This chat's readings could not be read: …") and keeps serving.

Why: the snapshot computed the readings inline, so such a file killed the engine during
attach, the supervisor recorded a crash, and the next message reattached into the same
crash. A missing usage block is a bad reading, not a bad chat.

Not: refusing the file with words. Not trusting the numbers and rendering zero totals,
which would be a lie about cost.

## Terminal-only extension calls live in Diagnostics

`setFooter(undefined)`, `setHeader(undefined)` and `setEditorComponent(undefined)` are
clears: they restore the built-in UI and succeed without a notice. A call the browser
cannot serve — a custom editor, footer or header, a component widget, raw terminal input,
a terminal-only dialog — is recorded on the running engine and listed under Settings →
Diagnostics → Extension UI, together with what the page uses instead. It does not become
a warning in the chat.

Why: the chat showed one card per method every time it opened, and the same three alerts
buried the conversation with a gap the reader could not fix from there. The status bar was
only clearing its footer, so that warning was false. The paster's user-visible job, image
paste, is already the composer's paste and paperclip. Diagnostics is where a capability
gap belongs: visible, specific and away from the conversation.

Not: pretending `mode` is `tui`, which would invite every terminal component into a page
that cannot draw it. Not: hiding a gap that the page truly has. Not: keeping a custom
editor factory that is never mounted, or a raw-input subscription that is never called.

## A refusal's words come from the translator

A refused command reaches the page as a tagged error whose `message` is empty by design;
the composer reports the error itself and lets `errorView` supply the sentence. Every
`Notice`/`StatusView` takes `error={…}`, and no feature prints `error.message`.

Why: compacting a chat with nothing to compact drew a status line with an icon and no
words. The same defect had already been fixed once for the delete dialogs, because a
tagged error's message is empty. pi's data messages — a test result, a login question, a
parse problem — are not thrown errors and stay text.

Not: filling `message` on the protocol's errors, which would duplicate the translator's
words in two places.

## The e2e specs assert the app as built

The Playwright specs are updated to the controls the pages draw, and a spec that expects a
control no version of the app has is a spec bug. They were written before the UI existed
("write the specs first"), which is why most of the seven failures expected controls no
version of the app has: a "Session settings" dialog, a "Branch tree" button, a link
labelled "add provider".

Why: the suite's value is that it opens the real app and reads it. A spec pinned to a
prototype turns every UI decision into a red test that says nothing about the code.

Not: keeping both UIs alive to satisfy the specs. Not deleting a spec that found a real
bug: `onboarding` found that a custom model without cost rates could not be saved at all.

## A run of steps is one row

Consecutive assistant messages that only called tools are drawn as one row, keyed by the
first of them: a header that names the work (`Ran 8 steps · 8 commands · 1 failed`), the
steps as one line each behind it. A message that wrote text ends the run, a user message
ends it, a tool result never does. The run opens while it works, opens when a step failed,
and closes once the answer starts. A run of one step is the step's own line, with no
header over it.

Why: pi's loop sends one assistant message per call, so a stretch of work arrives as
dozens of messages. A row each produced a ladder of `Thought and ran 1 tool` headings,
each one repeating the message before it; in the owner's chat one run was 24 messages and
another 80. The heading was also less informative than the line it replaced, which main
drew as the command itself. Every reference does one of the two halves (opencode and
codeshell fold a run, Claude Code and pi's TUI give each step one compact line) and none
draws a heading per message.

A page read from history carries entries, not live runs, so a step's status and output are
read from its `toolResult` entry when the engine did not replay one; without that an old
run would read `running` and open into nothing.

Not: a heading for each message with better words, which is still one row per message. Not:
folding the turn through its answer (codeshell's second level): the answer is what the
reader is looking for, and a run that swallowed it would hide it behind a click. Not:
swallowing the thinking into the header — each thought is its own labelled line above the
step it led to, quoting its first line and opening into the whole of it with the same
height transition as every other trace line, so it reads as a card and not as loose prose.
One component draws every thought: a step's, an answer's, the streaming one. Two of them
(beside a step and above an answer) were the same fact in two shapes, which read as two
different things.

## An older page arrives without moving the reader

The transcript remembers the scroll height before it asks for the page above, and the
layout effect adds the height that page brought. A zero-height line at the top of the
scroller says `Loading earlier messages` while the page is in flight, and says so with a
retry when it did not arrive.

Why: the page lands above the fold, so the content under the reader moved down by its
whole height — a jump of several screens in a chat with history. Nothing said a page was
being read, and a refused page was silent.

Not: following the new page to its top, which loses the reader's place in the opposite
direction. Not: animating the prepended rows into place, which would move what is being
read; the line above the fold is what moves, not the reader.
