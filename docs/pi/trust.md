# pi reference: Project trust

## Project trust

Trust is decided before project settings load, in this order
(`resolveProjectTrusted()` in `dist/core/project-trust.js`):

1. A folder with no trust-requiring resource is trusted, with no decision and no
   record.
2. The `project_trust` extension event: the first handler that answers `"yes"` or
   `"no"` wins, `"undecided"` falls through to the next handler, and
   `remember: true` writes the answer to `trust.json`. A handler that throws is
   reported and does not decide.
3. `trust.json`, through `ProjectTrustStore.get()`, which answers the closest saved
   decision, so a trusted parent covers its subfolders.
4. `defaultProjectTrust` from the home's settings: `"always"`, `"never"` or
   `"ask"`.
5. For `"ask"`, pi's own dialog, when it has a UI.

`getDefaultProjectTrust()` reads the global settings only; a project's
`.pi/settings.json` is not loaded until the folder is trusted. Epsilon reads that file
before trust for one exception: to report a parse error on the trust page. No value
from it is applied. Extensions see the result through `ctx.isProjectTrusted()`, which
returns `settingsManager.isProjectTrusted()`. `resolveProjectTrusted`,
`emitProjectTrustEvent`, `getProjectTrustOptions` and `getProjectTrustParentPath` are
private.

`SettingsManager.create(cwd, agentDir)` starts at `projectTrusted = true`
(`dist/core/settings-manager.js`), and nothing in `createAgentSession()` changes it.
A host that builds an engine in a folder therefore loads that folder's `.pi` whatever
`trust.json` says, unless it decides first. Epsilon's engine does: for a gated folder it
creates the manager with `projectTrusted: false` and passes pi's bootstrap
`extensionsResult` through `ResourceLoaderReloadOptions.resolveProjectTrust`, so a
`project_trust` handler decides before the folder's own extensions, skills and
`SYSTEM.md` load.

What the SDK exports for that decision:

- `ProjectTrustStore(agentDir)`: `get(cwd)` answers the closest saved decision
  (`true`, `false` or `null`); `set(cwd, decision)` writes `trust.json` under pi's
  own lock, and `null` removes that folder's entry so a parent or the default
  decides again. Trusting a parent writes the parent's `true` and `null` for the
  folder, which is what pi's own "Trust parent folder" choice does. It is the same
  file `/trust` writes, so a terminal and the dashboard share decisions.
- `hasTrustRequiringProjectResources(cwd)`: whether the folder holds anything pi
  gates (`.pi/settings.json`, `.pi/mcp.json`, `.pi/extensions|skills|prompts|themes`,
  `.pi/SYSTEM.md`, `.agents/skills` in the folder or a parent). Context files
  (`AGENTS.md`, `CLAUDE.md`) are never gated.
- `SettingsManager.setProjectTrusted(trusted)` and
  `getDefaultProjectTrust()`.
- `createAgentSessionServices()` takes `resourceLoaderReloadOptions`, whose
  `resolveProjectTrust` callback is pi's own two-pass load: the resource loader loads
  the untrusted extension set first, calls back with the result, sets the decision
  and reloads the resources for it.

Epsilon's server runs the same chain with no extension set, for the project page and
the engine registry: their answer comes from the store and the default. The engine's
chain adds the extension handlers, so the two agree unless a handler decided. The store is pi's, so the page, an engine and a
terminal pi share one `trust.json`.

A gated project's engine starts untrusted and passes pi's bootstrap
`extensionsResult` through `ResourceLoaderReloadOptions.resolveProjectTrust`, so a
`project_trust` handler decides before the folder's own extensions, skills and
`SYSTEM.md` load. Handlers see `hasUI: false`: there is no synchronous dialog, and
`"ask"` is answered by the page's Trust gate, which shows because the answer is
false. A handler that throws is reported in the chat as pi's extension error, and the
rest of the chain still decides.
