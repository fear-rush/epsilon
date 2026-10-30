# ADR-0006: Setup happens in a terminal inside the deployment

- Status: Accepted
- Date: 2026-10-28

## Context

A deployment owns its agent home ([ADR-0005](0005-deployment-owns-agent-home.md)),
so a fresh one has no credentials, no default model, no extensions and no project
trust decisions. Something has to configure it, and the dashboard is reachable from
a phone where there is no terminal.

Two paths were considered. Reimplement setup in the browser: pi's library exposes
`ModelRuntime.login`, `logout`, `listCredentials`, `getProviderAuthStatus`,
`SettingsManager` setters and `ProjectTrustStore.set`, so a sign-in flow and a
settings form are buildable. Or use the terminal that pi already ships, inside the
deployment, for the same job.

The first is a second frontend for configuration with its own frames, its own UI and
its own failure modes. The second is `docker compose run --rm -it epsilon pi`.

## Decision

1. Setup, sign-in, settings, project trust, MCP sign-in and package enabling happen
   in a terminal inside the deployment, using `pi` itself. The container image
   therefore installs `pi` and can be entered.
2. The dashboard does not modify pi's configuration. No login form, no settings
   form, no trust prompt, no credential or configuration upload.
3. The dashboard reports readiness and stops there: it reads the agent home and
   shows what is missing, naming the step and the directory, so a failed turn is
   never the first sign that something is unconfigured. Readiness is a REST read.
4. A prompt that cannot run because the home is unconfigured is refused with pi's
   own message, not a silent empty turn.

This keeps ADR-0002 decision 5 intact rather than superseding it: the terminal is
where TUI-only behaviour, login, trust, settings and resource installation happen.
The change is only that the terminal lives inside the deployment, not on the
operator's host.

## Consequences

- The dashboard's write surface stays what it is: sessions, one file deletion, and
  later its own `ui-state.json`. Nothing in `~/.pi/agent` is written by epsilon.
- Every TUI-only capability is available on day one, including `pi config` toggles
  and MCP OAuth sign-in, instead of being reimplemented and lagging.
- The image must be enterable: `docker compose run --rm -it epsilon pi`. A
  deployment that cannot be entered can still be configured through provider
  environment variables, and nothing else.
- A first run from a phone shows a not-ready notice, not a wizard. That is the
  intended trade: less work, fewer ways to fail, and one obvious place to look.
- Setup steps are not scriptable from the dashboard. If that becomes necessary, it
  is a new record, not an extension of this one.

## Rejected alternatives

- **Browser sign-in through pi's library.** Buildable, and rejected as the larger
  surface with no requirement behind it: the operator has a terminal, and the only
  case it wins is a deployment with no shell at all, which provider environment
  variables already cover.
- **A settings page for models, MCP, packages and trust.** The scope this project
  explicitly does not take on ([../features.md](../features.md), Not building).
- **Writing `auth.json`, `settings.json` or `trust.json` directly.** Duplicates pi's
  formats and locking, and breaks on an upgrade.
- **Credential upload from the browser.** Removes the setup friction and
  simultaneously removes the isolation that makes a deployment worth having, and
  native packages do not survive the move between platforms anyway.

## Revisit if

- A deployment must be configured with no shell available at all, such as a managed
  platform that only exposes HTTP.
- pi adds login, settings or trust to its RPC surface, which would make a browser
  flow a thin client instead of a second frontend.
