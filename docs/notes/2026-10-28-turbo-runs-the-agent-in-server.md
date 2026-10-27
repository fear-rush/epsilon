# `turbo dev` makes the agent's project `server/`

Date: 2026-10-28

## Symptom

A session created by `pi` in the repository root opens as an empty transcript.
The child writes `No project session found with id …, creating a new session with
that id` to stderr, and a new directory appears next to the real one:

```
~/.pi/agent/sessions/--Users-maryln-Developer-epsilon--         has the session
~/.pi/agent/sessions/--Users-maryln-Developer-epsilon-server--  empty
```

## Cause

`SessionRegistry` was built from `process.cwd()`. Turbo runs the `dev` task of
each workspace in that workspace's directory, so the server process, and every
`pi` child it spawns, had `server/` as its working directory. pi treats the
working directory as the project and stores sessions per project, so the id
existed in a different project than the one the child looked in.

## Fix

`server/src/config.ts` resolves the project once: `EPSILON_PROJECT` when set,
otherwise the repository root, derived from the module's own path rather than the
working directory. `serve.ts` passes it to the registry and prints it at startup
so the next surprise is visible in the log.

## Check

`bun run dev`, then open `/?session=<id>` for a session the terminal created in
the repository root. The transcript renders and the startup line names the
project:

```
epsilon on http://127.0.0.1:3000 (socket /api/link, project /Users/…/epsilon)
```
