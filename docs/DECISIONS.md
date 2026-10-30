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
Commands are the ones the page can send (`prompt`, `steer`, `abort`, `bash`,
`set_model`, `reload`); each is answered by `command-result` naming the command. A
frame change bumps `PROTOCOL_VERSION`, and a tab built for another version reloads.

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
by project, not by home. Development uses a sandbox home; `dev:host` is the only path to
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

Stays in the terminal, because pi exposes no host API for it:
MCP sign-in, project trust, and TUI-only toggles. The dashboard names that boundary
without printing a command for it. It never writes `trust.json`.

An MCP server also reports what the next session can reach and what a live engine
registered, because a configured server that no tool can call is a state the operator
must see. Those are reads: the panel says sign-in stays in the terminal and how a
stored credential is detected, and it never shows the credential.

Why: the dashboard must be usable without a terminal, and most of the work is editing two
documented files and calling two exported classes.

Not: writing `auth.json` (pi exports neither its store nor its locking). Epsilon-side
copies of pi config registered at engine start (lost on restart, duplicates resolution).
Showing a terminal command in the UI. A screen for every pi setting. A second key store:
the panel's field writes `models.json`, and only pi's own flows write `auth.json`.

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
