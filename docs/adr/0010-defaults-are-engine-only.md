# ADR-0010: The defaults are engine-only until the terminal can load them

- Status: Accepted
- Date: 2026-10-28

Narrows [0008](0008-embed-pi-engine-with-opinions.md): its Context says Epsilon's
defaults run "as pi extensions so they behave the same in the browser and in a
terminal". They do not. Decisions 1 to 7 stand; only that sentence is corrected.

## Context

The defaults are inline factories. `server/src/agent/engine.ts` hands them to
`DefaultResourceLoader` as `extensionFactories`, which is code injected into the
engine this process creates. The `pi` CLI in the same deployment builds its own
resource loader from the home: `extensions/`, packages from `settings.json`, and
`builtin:` names pi itself ships. There is no path from Epsilon's factories into
that loader.

So a deployment configured through this ADR gets a guarded dashboard and an
unguarded terminal. Verified on a scratch home with no `extensions/` directory: the
browser's engine published `perm:ask` and stopped a `bash` call, while the same home
has nothing for a terminal `pi` to load.

Writing the defaults into the home as files would close it, and that is exactly what
0008 rejected: Epsilon becomes a writer of pi's configuration
([0006](0006-setup-in-the-deployment-terminal.md)), and two copies of one guard drift.
The CLI does accept `-e <path>`, so a command line can load a file Epsilon ships
without touching the home, but the terminal tab that would pass it is S7 and does not
exist yet.

## Decision

1. Until the terminal tab exists, the defaults are engine-only. They are not
   installed into the home, not copied into it, and not described as available in a
   terminal.
2. A deployment that wants a guarded terminal installs its own extension, in the
   terminal, as it does today. That file wins over Epsilon's default by
   `replaceable`, so the two never both answer one tool call.
3. Parity is restored in S7 by launching the terminal's `pi` with `-e <path>` for a
   file shipped inside the Epsilon package. The home stays pi's. This is a
   requirement on S7, not a change to this record.
4. The resources view (S8) shows which of Epsilon's defaults are active, so a
   difference between the two surfaces is visible rather than assumed.

## Consequences

- The dashboard is strictly more guarded than the terminal in the same deployment.
  Anyone who relies on the guard must know that, and the docs say it instead of
  implying parity.
- No code is written into the agent home, so provisioning stays "code, not vendored
  files", and a pi upgrade cannot leave a stale copy of a guard on disk.
- `-e <path>` makes the shipped file a second entry point that must be kept in step
  with the inline factory. S7 owns that cost, and can generate the file from the same
  module instead of hand-writing it.
- A terminal started outside Epsilon (a plain `docker compose run … pi`) never loads
  the defaults, whatever S7 does. That is accepted: this record is about the terminal
  Epsilon opens.

## Rejected alternatives

- **Install the defaults into `extensions/` at startup.** Closes the gap today and
  costs exactly what 0008 rejected: Epsilon writes pi's configuration, the home
  becomes a deployment artifact that drifts from the repository, and removing a
  default is no longer deleting code.
- **Keep the claim and fix it later.** Leaves a documented capability that does not
  exist, which is the failure mode the stop-and-ask rules in AGENTS.md exist to
  prevent.
- **Tell operators to copy the two files themselves.** Moves the drift to every
  deployment, and a copied guard cannot be upgraded or disabled by name.

## Revisit if

- pi gives its library a way to contribute extensions to a CLI process that a
  separate command starts, which would make `-e` unnecessary.
- The terminal tab is abandoned, which makes this record permanent rather than
  temporary and worth restating in `features.md`.
