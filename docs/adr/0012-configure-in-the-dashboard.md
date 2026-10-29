# ADR-0012: Configure the deployment in the dashboard

- Status: Accepted
- Date: 2026-10-29
- Supersedes: [ADR-0006](0006-setup-in-the-deployment-terminal.md)

## Context

ADR-0006 put every configuration step in a terminal inside the deployment and
kept the dashboard read-only. That was defensible while the dashboard was a
viewer for sessions a terminal created. It stops being defensible when the
dashboard is the only surface a phone can reach: a fresh deployment showed a
notice that named a command the phone cannot run, and the operator had no way
to add a provider, an MCP server, a skill or a package from the browser.

The reasons ADR-0006 rejected a browser flow are still real, so they shape the
implementation instead of blocking it:

- pi exposes no RPC command that writes a credential, and no command that writes
  a provider. `/login` is interactive-only.
- `ModelRuntime` can persist a credential only for a provider that declares an
  `apiKey` login method, which a custom `models.json` endpoint does not.
- `models.json` and `mcp.json` have documented shapes but no exported writer.
- `SettingsManager` and `DefaultPackageManager` are exported writers for defaults
  and packages. Packages also have `listConfiguredPackages`.

So most of the work is not a new frontend for a text protocol; it is editing two
documented JSON files and calling two exported classes.

## Decision

1. Configuration lives in the dashboard: provider endpoints and their models, the
   default model, MCP servers, user skills and packages. It is a settings page with
   its own navigation, opened from the deployment card in the sidebar footer and
   linked from the not-ready notice.
2. Writes go through pi's SDK where it exposes a writer: `SettingsManager` for the
   default provider and model, `DefaultPackageManager` for packages.
3. Where pi exposes no writer (`models.json`, `mcp.json`), the dashboard parses the
   documented shape with zod and merges it. It keeps keys it does not model, and
   it refuses to write a file it cannot parse rather than clobbering it.
4. A credential is written to the documented `apiKey` field of `models.json`,
   which pi resolves literally, as `$NAME`, or as `!command`. The dashboard never
   writes `auth.json`, `settings.json` or `trust.json` itself, and it never sends a
   stored key back to the browser.
5. A skill is a directory with a `SKILL.md`, so the dashboard writes that file
   under `<agent home>/skills`. Removing a skill deletes that directory only.
6. The not-ready notice tells the operator to open Settings and add a provider. It
   no longer names a terminal command.
7. Every settings write reloads the live engines, so an open tab sees the new
   provider, MCP server or skill without a restart.
8. The engine stays embedded through the SDK. It is not an RPC child, it never
   enters pi's RPC mode, and it does not speak pi's RPC envelope.
9. A provider pi ships keeps its catalog. The panel edits one model through
   `modelOverrides`. A `models` list is written for a custom provider, or for a
   built-in only after an explicit confirmation that it replaces that catalog.
10. Importing models is Epsilon's own bounded HTTP call to the endpoint each API
    family documents. It is not a pi SDK capability, and the panel says so by
    disabling it where no shared list shape exists.

## What stays in the terminal

Only what pi does not expose over its SDK:

- OAuth and subscription login, which needs pi's interactive provider flows.
- MCP OAuth sign-in, which opens a browser and waits.
- Project trust decisions, which pi reports but does not accept over a host API.
- TUI-only behaviour such as `pi config` toggles and themes.

The panel names that boundary instead of faking it.

## Consequences

- A fresh deployment becomes usable from a phone: open Settings, add a provider,
  pick a model.
- The write surface grows from sessions to four documented file families. The
  dashboard owns validation, locking (one in-process queue per path), file mode
  (0600) and unknown-key preservation.
- `models.json` and `mcp.json` can change between pi versions. The merge is
  schema-tolerant and refuses unreadable files, and the reference records which
  facts were verified against pi 1.4.0.
- A provider key is stored in `models.json`, not `auth.json`. That matches pi's own
  documented custom-provider field and keeps one file to explain. A key typed in
  the terminal later still wins the way pi resolves credentials.
- The settings page is now a place bugs accumulate. It stays five small sections
  with one form each, and the plan carries a scope risk for it.

## Rejected alternatives

- **A second copy of pi's config in Epsilon state, registered at engine start.**
  Keeps pi's files untouched, but loses settings and providers whenever the engine
  restarts and duplicates the resolution order pi already owns.
- **Credential writes to `auth.json`.** pi does not export its credential store or
  its locking, so this would duplicate the format that ADR-0006 rejected.
- **Keeping ADR-0006 and showing a command.** Leaves a phone-only deployment
  unusable, which is the case that motivated the product.
- **A general settings screen for every pi setting.** Out of scope by
  [../features.md](../features.md). The panel covers what blocks a turn.

## Revisit if

- pi exports writers for `models.json` and `mcp.json`, which would let the panel
  drop its own merge and validation.
- pi exposes login and trust to an embedding host, which would remove the last
  terminal-only steps.
