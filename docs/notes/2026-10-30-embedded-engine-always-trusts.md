# The embedded engine trusts the project folder by construction

## Symptom

A project's `.pi/settings.json` changes the default tools and its `.pi/mcp.json`
servers are listed and connect, in a fresh agent home whose `trust.json` holds no
decision. Documentation said pi skips those resources until the project is
trusted, so a check written from the docs could not reproduce the skip.

## Cause

The CLI resolves trust before loading project settings. `resolveProjectTrusted()`
reads `trust.json`, falls back to `defaultProjectTrust: "ask"`, and calls
`settingsManager.setProjectTrusted(false)` when no one answers. The SDK does not
run that step: `SettingsManager.create(cwd, agentDir)` starts at
`projectTrusted = true`, and `createAgentSession()` leaves it there. Extensions
read it through `ctx.isProjectTrusted()`, so the MCP extension passes
`projectTrusted: true` to `loadMcpConfig()`.

Epsilon never calls `resolveProjectTrusted()` or `setProjectTrusted()`.

## Fix

Report the truth: this deployment owns one project, chosen at deploy time, and the
embedded engine reads its `.pi` resources. Settings › MCP says the project folder
is trusted by construction instead of offering a dialog that would contradict the
engine. A real trust decision needs `ProjectTrustStore` wired into
`createAgentSession()`, not a panel checkbox.

## Check

```bash
cd server && bun -e '
import { SettingsManager } from "@earendil-works/pi-coding-agent";
console.log(SettingsManager.create("<project>", "<agent home>").isProjectTrusted());
'
```

It prints `true` with an empty `trust.json`, and a `.pi/mcp.json` entry appears in
`GET /api/settings` while `<project>/.pi/settings.json` shows up in
`getProjectSettings()`.
