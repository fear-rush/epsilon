# Decisions

The architecture decisions that hold today. Each has the reason and the option that was
rejected, so the rejected option is not proposed again. Code cites a decision by its
heading.

## Embedded engine

The server runs pi's engine in its own process through the SDK: one `AgentSession` per
open session id, created with the working directory and the agent home. Epsilon does
not spawn `pi`, does not use pi's RPC mode and does not speak its envelope.

Why: Epsilon ships its own default extensions, and the SDK is the only surface that can
load inline extensions, arbitrate names (`replaceable`), reload resources and navigate
the session tree. An idle engine is disposed and recreated on the next attach.

Cost accepted: an engine or extension bug takes every live session down with the server
(session files survive), and all sessions share one heap.

Not: an RPC child process (no inline extensions, no arbitration, no reload). A worker
thread (the engine's services and MCP clients do not cross the boundary without
rewriting a frontend). Two engines side by side (two vocabularies in one UI). A second
MCP client from `@earendil-works/pi-mcp`, which is importable on its own: it would open
a second connection, and a second stdio process, for every server, without the MCP
extension's config resolution, exposure, OAuth or permission hooks.

## Socket vocabulary

The browser socket carries Epsilon's own commands and zod shapes, defined in `shared/`.
Commands are the ones the page can send: a prompt and the queue behavior it joins a
running turn with, the aborts (turn, retry, compaction, bash), bash itself, the model,
thinking-level and coding-tool switches, manual compaction, the auto-compaction and
auto-retry toggles, the queue clear, the move to an earlier message of the branch,
and reload. `commandNameSchema` in
`shared/src/protocol/frames.ts` is the list. Each is answered by `command-result`
naming the command. A frame change bumps `PROTOCOL_VERSION`, and a tab built for
another version reloads.

Why: with no RPC envelope under it, pi's RPC types would be a translation layer, and a
change to pi's private types would become a change to Epsilon's public contract.
`/reload` is a socket command, never a slash command the model sees.

Not: keeping pi's RPC types for compatibility (nothing speaks them). Request/response
frames for reads (the engine exposes state synchronously, so a snapshot needs no round
trip). Deep-importing pi's JSON event transform (blocked by the package `exports` map;
the engine carries a small copy and names its source).

## UI contract

Epsilon renders the extension UI methods that are data (`select`, `confirm`, `input`,
`editor`, `notify`, `setStatus`, `setWidget` as text, `setTitle`), through
`ExtensionUIContext`. A method that needs pi's terminal UI (`custom`, footer and header
components, terminal input) answers with a visible notice naming it, once. Silence is
never an answer. Dialog timeouts are enforced by the engine.

Why: terminal components have no data form, and the set of extensions is open-ended, so
an adapter has no cost ceiling.

Not: rendering `pi-tui` components headlessly in the browser (couples the server to pi's
internals and produces terminal-shaped dialogs). A per-extension UI adapter.

## Agent home

Epsilon owns one agent home, at pi's default path (`$HOME/.pi/agent`),
resolved once in `server/src/main.ts` and passed to every engine explicitly. An inherited `PI_*`
variable never decides it. Nothing records the choice. Sessions are grouped
by folder, as pi groups them. Development uses a sandbox home; `dev:host` is the only path to
the operator's real one.

Why: pi's home holds credentials, policy, extensions and sessions that a dev run
should not adopt silently.

Not: a dev loop on the real home. A home at `~/.epsilon/agent` (pi and
`getAgentDir()` would disagree). A config file naming the home (a second truth for a
deterministic value).

## Configure in the dashboard

Settings configures the agent: provider endpoints and their models, the default
model, MCP servers, skills and packages. Writes go through an exported pi writer where
one exists (`SettingsManager`, `DefaultPackageManager`). Otherwise the dashboard parses
the documented file with zod, merges it, keeps unknown keys, writes at mode 0600 under
one in-process queue per path, and refuses a file it cannot parse. A provider key goes to
the documented `apiKey` field of `models.json` and is never sent back to the browser.
Every settings write reloads the live engines. A pi-shipped provider keeps its catalog
and is edited through `modelOverrides`; importing models is Epsilon's own bounded HTTP
call, disabled where an API family has no shared list shape.

Signing in with an account is the dashboard's too, because `ModelRuntime.login()` is a
host API: the panel starts the flow, relays the questions and links pi reports, and
cancels it. It never writes `auth.json` itself; a credential changes only through
`login()` and `logout()`. `auth.json` holds one credential per provider and pi uses it
ahead of a key in `models.json` and ahead of the environment, so the panel names the
credential in use and offers sign-out, instead of letting a typed key look active
while an account shadows it. A provider pi ships needs no endpoint from the panel
for that: pi supplies the endpoint, the API family and the catalog, and the credential
supplies the auth, so those fields are an override there rather than part of adding
it. A provider the operator defines has none of them and needs all of them.

Stays in the terminal, because pi exposes no host API for it: MCP sign-in and
TUI-only toggles. The dashboard names that boundary and the documented terminal step
(`pi mcp login <name>`) and offers no sign-in button. Project trust is not one of them: it goes through pi's exported
`ProjectTrustStore` (Chats and projects), and the dashboard never writes
`trust.json` by hand.

An MCP server also reports what the next session can reach and what a live engine
registered, because a configured server that no tool can call is a state the operator
must see. A server's page lists the tool names a live engine registered, with a switch
that writes an exact-name `toolExposure` rule; with no live engine it says to open a
chat instead of guessing. Those are reads: the panel says sign-in stays in the terminal and how a
stored credential is detected, and it never shows the credential.

An MCP server and a skill can also be edited raw. For an MCP server that is its own
entry under `mcpServers` and nothing else; stored env values, header values and the
OAuth client secret are shown as `"<stored>"`, and a `"<stored>"` left in place keeps the
stored value on save. A save that does not parse writes nothing. A skill's raw view is
its folder: `SKILL.md` with its frontmatter, written as typed once the name and
description pass pi's rules, and every bundled file.

Adding an MCP server can start from a registry: the official MCP registry, and GitHub's
(`api.mcp.github.com`), which is looked up in the official one first. A registry entry has
no command, so the panel derives it from the package type (`npx -y` for npm, `uvx` for
PyPI, `docker run -i --rm` for OCI) or takes the remote's URL and headers, and asks only
for the required and secret values. Legacy SSE and package types pi cannot run are listed
as unsupported with the reason.

Why: the dashboard must be usable without a terminal, and most of the work is editing two
documented files and calling two exported classes.

Not: writing `auth.json` (pi exports neither its store nor its locking). Epsilon-side
copies of pi config registered at engine start (lost on restart, duplicates resolution).
Showing a terminal command in the UI. A screen for every pi setting. A second key store:
the panel's field writes `models.json`, and only pi's own flows write `auth.json`. Raw
editing of the whole `mcp.json` (one entry is enough, and the rest stays out of reach).
Glama and mcp.so as registries: Glama needs an API key, gives no install command and
requires its credit on every page; mcp.so has no public API.

## Chats and projects

A conversation is a pi session, and the interface calls every one a chat. Where it
runs decides what it sees:

- A **chat** runs in `<agent home>/chats`, one empty folder Epsilon creates. It has
  no `.pi`, so it sees the home's settings, skills, MCP servers and packages and
  nothing else. It starts with the coding tools (`bash`, `edit`, `write`) off.
- A **project** is any folder the operator opens and trusts. Its chats run there and
  add that folder's `.pi` and context files. They start with pi's default tools.

Both carry a per-session tool switch; pi records the loadout in the transcript, so
the choice survives a reopen. `read` stays on either way, because skills need it.

Nothing runs in a project folder until pi's `ProjectTrustStore` says it is trusted.
The page asks before it attaches, and the server refuses to build an engine or write
project settings in an untrusted folder. The Trust button writes that store, which
is the file `/trust` writes, so a terminal and the dashboard share decisions.

The list of projects is derived from the folders pi's session files record; nothing
stores it. A folder opened but never used exists only in the page URL until its first
message. A chat moves into a project through `SessionManager.forkFrom`, which writes
the history under the new folder, and the original file is then removed.

A chat's display name is pi's own session-name entry, written through the engine (or
`SessionManager` when no engine holds the file), so a terminal sees the same name. A
pin is Epsilon's own list preference: `pinned-sessions.json` in the agent home holds
the ids, and the list route joins them to pi's sessions. Pinned rows lead their place;
a project's chats stay inside that project.

Deleting a chat moves its session file to Epsilon's trash and drops its pin; an idle engine
on it is closed first, and only a turn in progress refuses. Removing a project moves the
session files recorded in that folder to the trash, which is all that puts it on the list;
the folder and pi's trust record are left alone. The trash is `<agent home>/trash`, beside
`sessions/` because pi lists every folder under `sessions/` as a live session: one file per
chat, plus a sidecar naming the path it came from and the day it moved. A restore puts the
file back, and refuses when something already sits at that path; only deleting it from the
trash destroys it. A chat moved into a project is removed rather than trashed: its history
lives on in the fork, so a second copy would only be confusing.

Why: pi has no pin concept, and a browser-only pin would vanish on another tab or a
reload. A pi session file with an unknown pin entry would be a second truth for pi's
own data. A delete nobody can undo throws a conversation away for good. Not:
writing pins into a session transcript or keeping them in server memory. Not: the `trash`
CLI pi's own picker calls, which stock macOS does not have and which would only add a child
process around two file moves.

MCP servers, skills and packages each open on a Global | Project tab, the split pi
makes between the home and a project's `.pi`. The tab decides what Add writes and
names the file; a project tab also lists the global entries it inherits, and
switching an inherited MCP server there writes an override in the project file. The
project is in the Settings URL, so a project's menu in the sidebar links straight to
it.

Why: skills, MCP servers and packages exist at two scopes in pi, and an Epsilon tied
to one startup folder could only ever show one project's scope. Opening any folder
from a browser makes a trust decision necessary: a cloned repository's
`.pi/extensions` is code.

Not: a chat with no folder (pi has no such mode). A chat in `$HOME` (its ancestors
would become project resources). Always trusting an opened folder, which was only
defensible when the folder was chosen at startup. Gating chats on trust (their folder
is Epsilon's own). A stored project list (a second truth beside pi's session files).

## Branching

Going back is one direction of pi's session tree, and this is v1 of it: the composer
lists the user messages of the branch the transcript shows, and picking one calls
`AgentSession.navigateTree`, which moves the leaf to just before that message and
hands its text back for the box. Sending it starts a new branch; the one it left
stays in the session file. pi refuses the move while a run or a compaction is going,
so the control is disabled with that reason.

Why: moving the leaf is a command on the live engine, and the text coming back to the
composer is what makes the new branch start from the message the operator picked
rather than a retyped copy of it.

Not: branch summarisation (`navigateTree`'s `summarize`), a tree of the other
branches, and fork or clone. The missing parts are a model call in the middle of a
navigation and a second session file, so they are not commands a tab asks for yet.

## Skills

The skills list is pi's own answer: its resolver says which `SKILL.md` files exist and
whether a setting turns one off, its loader says which name won a collision and why a
file was refused. Each skill shows one status (automatic, manual only, off, shadowed,
invalid, untrusted) and where it came from. A save rewrites only the fields the panel
edits and keeps every other frontmatter key and comment; a file whose frontmatter does
not parse is shown, not rewritten. Fields from other agents (Claude Code's `context`,
`user-invocable` and the rest) are shown read-only with a notice that pi ignores them.
Turning one skill off is a `-<path>` entry in pi's `skills` setting; a skill folder of
another agent (`~/.claude/skills`, `~/.codex/skills`) is used only when the operator
links it, which adds the folder to the same setting.

Why: pi honors `name`, `description` and `disable-model-invocation` and nothing else,
so an editor for other agents' fields would promise behavior the agent does not have.
A scan of our own would disagree with the agent the first time pi changes its order.

Not: rebuilding pi's discovery. Editing fields pi ignores. Copying or symlinking other
agents' skills into the home.

Installing skills is one path for every source: a picked folder, an archive, or a
pasted `skills add` command is staged under the agent home, every skill in it is
validated strictly, the operator reviews the report, and only then are the chosen
skills moved into `<agent home>/skills` or a project's `.agents/skills`. A pasted
command runs the `skills` CLI at a pinned version as a short-lived child process, with
telemetry off and the operator's `~` replaced by the sandbox's under `bun run dev`; it
only fetches into the stage and never places anything itself. A repository pi can read
as a package (a root `skills/` or a `pi` manifest) can instead be installed as a pi
package filtered to the chosen skills, which keeps it updating; the default stays a
copy, because a package update is not validated again.

Why: the CLI already resolves every source people paste from skills.sh (GitHub,
GitLab, private git, archives), and staging keeps one validation for all of them.
Project skills go to `.agents/skills` because other agents read the same folder.

Cost accepted: the installer is a child process and needs the network; the engine
stays in-process.

Not: letting the CLI write the final location (no validation, and `-g` would write the
real `~/.agents`). Re-implementing the CLI's fetchers. A lock file of our own.

Dev and host follow separate rules and never mix. Under `bun run dev` the sandbox's `~`
is `HOME` for the server, pi and every child, and a project must be a folder inside it;
the folder picker cannot leave it and the server refuses anything else. On a host the
real `~` is used, as a terminal would. In both, `~/.agents/skills` of the `~` in effect is
an editable global skills folder.

Why: pi loads every `AGENTS.md` up to `/` and every `.agents/skills` up to the git root
above a project, so one project on the operator's disk carried their configuration into
the sandbox, filed as project skills. Not: letting the sandbox open any folder and warning
about it.

## Default extensions

Epsilon ships its own defaults (a permission guard, an ask-question flow) as code,
registered as inline factories with `builtin: true` and `replaceable: true`, beside the
CLI's own built-ins (codemode, tool search, MCP). An operator extension with the same
command, tool or flag name wins by rule instead of colliding. MCP servers connect when
the extensions are bound.

The defaults exist in the dashboard's engine only. They are not written into the home
and are not claimed to exist in a terminal; the dashboard is therefore more guarded than
a terminal using the same agent home, and the docs say so.

Why: writing extension files into pi's home makes Epsilon a writer of pi's configuration
and lets copies drift from the repository.

Not: seeding extension files into the home. Telling operators to copy files. Claiming
parity with the terminal.

## Design system

The client has one set of tokens (`client/src/styles/tokens.css`) and one layer of
patterns (`client/src/components/patterns`) that every feature composes. Tokens name
roles, not values: `h-bar`, `gap-field`, `text-title`, `max-w-dialog-md`,
`animate-enter-rise`. `cn` is configured with them (`client/src/lib/cn.ts`), because
the stock merger reads `text-title` as a colour and drops it. The `design-tokens` lint
rule is an error in `features/` and `components/patterns/`: no bracketed values, no
raw palette colours, type and spacing only from the scale.

Why: the same idea was drawn many ways (38 paddings, six dialog sizes, seven error
layouts, twelve one-off entrances), so columns did not line up, dialogs resized
between tabs and an offline server showed three different messages at once.

Not: a design per section. Bracketed values in features. A second component for an
idea a pattern already draws.

## Feature modules

Server `features/<name>/`, client `features/settings/<name>/` and shared
`<feature>/rules.ts` carry matching names. Server feature files have fixed roles:
`contract` (zod request and response schemas), `domain` (pure), `store` (pi files),
`service` (use cases), `routes` (thin), with the direction routes, service, domain,
store, platform. Another feature is imported only through its public index; `settings/`
is the one aggregator. There is no file-size cap: one concept per file, split by meaning.

Why: a length cap split single concepts across files and was a lint target, not a design
rule.

Not: keeping the cap and adding files.

## OpenAPI client

The server's OpenAPI document is the REST contract. `bun run api:generate` writes the
client schema and contract files; `shared/` keeps only the socket protocol, the reducer
and rules both sides run. Every response carries `x-epsilon-contract`, and the client
shows one reload notice on a mismatch instead of parsing responses.

Why: the contract used to exist three times (zod, hand-written fetchers, browser
parsing) and drifted.

Not: zod-parsing REST responses in the browser (a second copy that still drifted).
Revisit if a route needs streaming or uploads that the generated client cannot express.

## Documentation

Docs hold decisions, the pi reference and a map. Code, types and tests state
everything else; plans, feature lists, UI inventories and frame lists are not kept in
prose because they drift. This file states a decision as it holds now and is edited in
place when a decision changes.
