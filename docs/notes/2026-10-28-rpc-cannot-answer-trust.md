# RPC cannot answer the project-trust prompt

## Symptom

A session in a fresh agent home ignores the project's own resources. Extension
commands from `.pi/extensions` are missing from the command palette, project MCP
servers from `.pi/mcp.json` never connect, and project skills never appear. Nothing is
reported. The session looks healthy and simply runs with less than the project
declares.

## Cause

pi requires a decision before it loads resources supplied by the working folder
(`.pi/settings.json`, `.pi/mcp.json`, `.pi/extensions`, `.pi/skills`,
`.pi/prompts`, `.pi/themes`, `.pi/SYSTEM.md`, `.pi/APPEND_SYSTEM.md`, and project
`.agents/skills`). The decision is stored in `<agent home>/trust.json`.

pi's `docs/security.md` states the trap directly: "Print, JSON, and RPC modes
cannot show the built-in trust prompt." An embedded engine can receive the
`project_trust` event from an extension, but Epsilon does not answer it: that
would make the dashboard the place where a project is trusted
([ADR-0006](../adr/0006-setup-in-the-deployment-terminal.md)). With no stored
decision and no `--approve`, the default `defaultProjectTrust: "ask"` skips the
protected resources instead of blocking. An empty trust store, which every fresh home and
every new container volume has, therefore means silently reduced capability.

A `pi` process started from a terminal on the same host does show the prompt, so
the same project works there and fails here.

## Fix

Report the trust state instead of guessing. The dashboard must show "this project's
`.pi` resources are skipped because the project is not trusted", naming the
directory, and the fix is `/trust` in a terminal inside the deployment. Storing a decision is a deliberate action, either recorded
once by `pi` in the deployment or answered by a future trust surface. Do not set
`defaultProjectTrust: "always"` as a convenience: it turns a per-project decision
into a permanent yes for every project the agent is ever pointed at.

## Check

In a fresh agent home whose project has `.pi/extensions`, open a session and read
its snapshot's `commands`. The project's extension command is absent while
`<agent home>/trust.json` lacks the project path. Add the path through a terminal
in that same home, restart the session, and the command appears.
