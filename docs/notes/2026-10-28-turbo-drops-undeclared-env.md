# Turbo drops an env var the task never declared

## Symptom

`EPSILON_AGENT_HOME=/tmp/eps-home bun run dev` served the same session list as a
plain run, and so did `PI_CODING_AGENT_DIR=/tmp/nowhere bun run dev`. Printing the
server process's environment showed neither variable.

## Cause

`bun run dev` is `turbo dev`, and Turborepo's `envMode` defaults to `"strict"`,
which passes a task only the variables named in `env` and `globalEnv` in
`turbo.json`. `EPSILON_AGENT_HOME`, `EPSILON_PROJECT` and `PI_CODING_AGENT_DIR`
were not named, so they never reached `server:dev`. The same would have happened to
the `EPSILON_PROJECT` documented in [deploy.md](../deploy.md).

## Fix

The `dev` task in `turbo.json` lists them. A variable a task needs must be declared
there, or the task runs without it while the shell looks correct.

## Check

```
PORT=3129 EPSILON_AGENT_HOME=/tmp/eps-home bun run dev:server
curl -s http://127.0.0.1:3129/api/sessions
```

An empty session list on the fresh home proves the variable arrived. Then
`PORT=3130 PI_CODING_AGENT_DIR=/tmp/nowhere bun run dev:server` must still list the
operator's sessions and must not create `/tmp/nowhere`.
