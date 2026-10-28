# ADR-0008: Embed pi's engine and ship Epsilon's own defaults

- Status: Accepted
- Date: 2026-10-28

Supersedes [0001](0001-engine-rpc-child.md) decision 1 and
[0004](0004-own-the-rpc-driver.md), reverses the rejection recorded in
[0007](0007-embed-pi-engine.md), and narrows [0002](0002-own-the-ui-contract.md)
decisions 1 and 3: the UI contract is still the nine extension UI methods, but it
arrives through `ExtensionUIContext` instead of RPC frames. Decisions 2 to 4 of 0001
stand: sessions are pi's JSONL files, epsilon stores almost nothing, and there is no
`pi-durable`, no chord, no database.

## Context

The product decision changed. Epsilon is not a thin view over whatever `pi` the
operator happens to have. It ships defaults: a permission guard, an ask-question
flow, and later whatever else proves worth having, running as pi extensions so they
behave the same in the browser and in a terminal. Those defaults are opinionated on
purpose, and they are the reason to install epsilon rather than pi-web.

Over RPC that decision cannot be honoured well:

- **No arbitration.** The SDK loads an inline extension with `replaceable: true`
  and leaves it out when another extension registers a tool, command or flag of
  the same name. Over RPC an extension is a file, file extensions have no
  `replaceable` flag, and a duplicate command becomes `/permission:2` while both
  handlers run. Shipping a guard would silently produce two guards answering one
  tool call.
- **No inline extensions.** A default has to be written into the agent home as a
  file, which makes epsilon a writer of pi's configuration and turns provisioning
  into vendoring with drift.
- **No reload.** `session.reload()` re-reads resources without replacing the
  session, so installing a package or a skill would not need the idle-gated
  restart that RPC requires.
- **No tree.** `navigateTree` stays terminal-only under RPC.

pi's own documentation draws the same line: the SDK is for an in-process TypeScript
host that wants complete API access, RPC for language-independent integrations,
process isolation, IDEs and custom clients. Epsilon is a TypeScript host.

## Decision

1. The server embeds the engine. `server/src/agent/` imports
   `@earendil-works/pi-coding-agent` and creates one `AgentSession` per open
   session id, with `cwd`, the agent home from `config.ts`, and
   `mode: "rpc"` so extensions see the same surface they see in the CLI.
2. The browser contract does not change. The frames, the zod schemas, the protocol
   version and `shared/src/conversation/reduce.ts` stay as they are. Engine events
   pass through `toJsonEvent` into the same `event` frames.
3. Epsilon owns the extension set, in this order of precedence: the operator's own
   extensions discovered from the home, then epsilon's inline extensions. Epsilon's
   extensions are named and marked `replaceable: true`, so an operator extension
   using the same command, tool or flag name wins by rule instead of colliding.
4. Epsilon owns CLI parity for the three extensions the CLI adds and the SDK does
   not: `createCodemodeExtension()`, `createToolSearchExtension()` and
   `createMcpExtension()` join the `DefaultResourceLoader` factories, are activated
   through `defaultTools`, and `session.bindExtensions()` runs so MCP servers
   connect on `session_start`.
5. Epsilon owns `ExtensionUIContext`. The dialogs (`select`, `confirm`, `input`,
   `editor`) are answered from the browser. Display methods (`notify`,
   `setStatus`, `setWidget` as text, `setTitle`) map to what the UI already
   renders. Methods that need pi's TUI (`custom`, footer and header components,
   `onTerminalInput`) answer with an unsupported notice, never silence.
6. Setup stays in the terminal ([0006](0006-setup-in-the-deployment-terminal.md)).
   Credentials, project trust, MCP sign-in and package installs are not epsilon's
   write surface. The home keeps them; epsilon no longer writes extension files
   into it.
7. Sessions are disposed, not leaked. An idle session is `dispose()`d and recreated
   on the next attach, because it now holds a live engine in this process.

## Consequences

- **No crash containment.** A bug in an extension or in the engine can take the
  server down, where a child process could die alone. Accepted: the deployment runs
  one user's extensions, and the session files survive.
- **One heap.** Every live session shares the server's memory. Idle disposal and a
  cap on live sessions are epsilon's work now, not the OS's.
- **Tool activation is our bug surface.** A session that fails to activate
  `codemode`, `tool_search` or MCP looks healthy and is quietly less capable. The
  check belongs in the S12 list, not in a comment.
- **A larger image.** The deployment bundles pi's modules and native dependencies.
  The CLI is still installed for the terminal tab and for setup, so the image
  carries both surfaces.
- **Upgrades move the maintenance burden.** Re-verification is against the library
  declarations (`dist/core/*.d.ts`), not `dist/modes/rpc/rpc-types.d.ts`.
- **Provisioning shrinks.** A home needs credentials, trust, packages and MCP
  servers. Default extensions stop being files to copy and become code.
- **Duplicate guards remain possible by behaviour.** `replaceable` resolves names,
  so two guards with different command names both run. The resources view (S8) is
  where an operator can see what loaded.
- **Two writers on one session is unchanged.** A terminal `pi` and the dashboard on
  the same session interleave entries, as before.

## Rejected alternatives

- **Stay on RPC and ship no extensions.** Cheaper, isolates crashes, and keeps the
  extension set entirely the operator's business. Rejected because it removes the
  product's reason to exist: the defaults are the opinion that makes epsilon worth
  installing over pi-web.
- **Ship extensions as files in a seeded home.** Keeps the child process but gives
  up arbitration, adds a repository of vendored extension code, absolute paths in a
  seeded `settings.json`, and drift between the operator's dotfiles and the repo.
- **Both engines, per session.** Two runtimes and two vocabularies in one UI.
  0001 rejected it and nothing here changes that.
- **Embed in a worker thread instead of the server process.** Keeps crash
  containment, but the engine's services, extensions and MCP clients do not cross a
  worker boundary without reimplementing the frontend this decision exists to
  avoid. Worth revisiting only if crash containment becomes a requirement.

## Revisit if

- RPC gains `replaceable` semantics, inline extensions and `reload`, which would
  make the cheap contract sufficient again.
- More than one user or one deployment must be served, which turns crash
  containment and memory isolation into requirements rather than costs.
- The library surface changes often enough that maintenance dominates, which is the
  signal to go back to 0007's reasoning with new evidence.
