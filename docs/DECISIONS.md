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
in [plan/04-safety.md](plan/04-safety.md).

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
sent only when a tab asks (`loadTree`), as one `tree` frame. 50,000 rows in every
snapshot would exceed the 2 MB frame budget and re-send what the picker already has.

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
What may differ is a closed list in [plan/03-port.md](plan/03-port.md): the data source,
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
[plan/01-structure.md](plan/01-structure.md).

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
