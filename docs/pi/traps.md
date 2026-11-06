# pi reference: Traps

## Traps

Behaviour that cost time and that no type or test shows. Each is a fact about pi or
the runtime.

- **A session file is read once.** An engine loads its transcript at creation and does
  not re-read the file. Another process writing it is invisible until the engine is
  replaced; `reload()` re-reads resources, not the session. A host that wants to show
  the file as it is must watch it and rebuild the engine (`navigateTree`'s `summarize`
  is a model call during a navigation, so it is slower than plain navigation and can
  fail when no model is available).
- **A bash result is a message, not an event.** `executeBash` appends a
  `bashExecution` message without emitting `message_start`/`message_end`, and holds
  it until the run settles when streaming. Re-read the snapshot after a `bash`
  command and again at `agent_settled`.
- **`isBashRunning` and `abortBash()` cover `executeBash` only.** The set behind them
  is filled by `executeBash` (the composer's `!cmd` and extensions that call it).
  The bash tool runs under the run's abort signal, so a tool call is stopped by
  `abort()`, not `abortBash()`.
- **`executeBash` does not emit `user_bash`.** The gate that can inspect, rewrite or
  block a direct shell command is the caller's job (`dist/modes/rpc/rpc-mode.js` and
  the TUI's bash handler run it), so a bare `AgentSession.executeBash()` skips every
  `user_bash` handler. A handler answers `{ result }` or `{ operations }`, and the
  operations object is passed back in as the command's runner.
- **`toJsonEvent` is not exported.** `package.json` exports only `.` and
  `./rpc-entry`; `dist/modes/json-event.js` is private. Epsilon does not consume pi's
  JSON event shape: the engine maps events and session entries onto the wire frames
  directly.
- **A `message_end` listener runs before the entry is persisted.** The listener is
  called, then `SessionManager.appendMessage` writes it; a listener that reads the leaf
  sees the previous message. Look the entry up after the event (or by the message
  object).
- **pi exposes no MCP connection state.** A connected server's tools appear in
  `session.getAllTools()` with `namespace.name === "mcp__<server>"` and, when the
  server sent hints, `annotations` (`readOnlyHint`, `destructiveHint`,
  `idempotentHint`, `openWorldHint`). Each also carries `exposure`, the value pi
  resolved for it, so a saved `toolExposure` rule is checkable from outside without
  guessing; the name the server reported is not in `ToolInfo`, only the registered
  one (see the MCP section on the key rule). The two states it does report, a needed
  sign-in and a failure, arrive as the attention notice described there. `session.getActiveToolNames()` says whether
  `codemode`/`tool_search` are active. That is all a host can read: pi keeps its six
  connection states (`connecting`, `connected`, `disconnected`, `needs-auth`,
  `failed`, `closed`) inside its own MCP extension, so failed, needs-sign-in and
  still-connecting are indistinguishable, and the panel says which question it
  cannot answer. Servers an extension registers with `pi.registerMcpServer()` are
  only visible from inside an extension: `pi.getMcpServers()` answers
  `{ name, config, extensionPath }` for them, `mcp_servers_change` carries the same
  list whenever it changes, and servers defined in `mcp.json` take precedence, so
  those are not in it. None of it is reachable from the files.
- **Handling `mcp_servers_change` silences pi's own warning.** pi reports "MCP
  server X is registered, but no loaded extension connects MCP servers" only when no
  extension handles that event (`runner.reportUnhandledMcpServers`), so a handler
  that merely observes is indistinguishable from one that connects. Epsilon's
  observer accepts this: in every configuration with pi's own MCP extension loaded
  nothing changes, and where MCP support was replaced the panel still names the
  server as registered with no tools. An extension that only wants to observe
  without that cost has to read `pi.getMcpServers()` on `session_start` alone and
  miss the registrations that happen later.
- **The engine trusts whatever folder it is given.** `SettingsManager.create`
  starts with `projectTrusted = true`, and nothing in `createAgentSession()` runs a
  trust decision, so `.pi/settings.json` and `.pi/mcp.json` load with an empty
  `trust.json`. The host must decide before it builds an engine. The SDK exports the
  store, `hasTrustRequiringProjectResources` and `SettingsManager.setProjectTrusted`
  for this; `resolveProjectTrusted`, `emitProjectTrustEvent`,
  `getProjectTrustOptions` and `getProjectTrustParentPath` are private, and
  `DefaultResourceLoaderOptions` has no trust field. The two-pass hook is on
  `ResourceLoaderReloadOptions` instead: `createAgentSessionServices()` takes one as
  `resourceLoaderReloadOptions`, loads the untrusted extension set, calls the
  callback with it, sets the decision and reloads. `Extension.handlers` is public, so
  the event can also be emitted directly. A host that wants pi's real chain (no gated resource means
  trusted, then the `project_trust` event, then the store, then `defaultProjectTrust`,
  then ask) reproduces it over those public pieces.
- **A skill needs a reading tool.** The system prompt lists skills only when a
  `read`-type tool is declared (`dist/core/system-prompt.js`), because the model
  loads a skill by reading its `SKILL.md`. Turning off every built-in tool turns
  skills off with them.
- **pi records the tool set, not the host.** `setActiveToolsByName()` changes the
  live tools; the next run writes the loadout to the transcript and reopening the
  session restores it. A change before the first message lives only in memory,
  like a `model_change` (below).
- **`SessionManager.open()` does not require the recorded folder.** It takes a
  `cwdOverride` as the third argument, and the session header keeps the old cwd, so
  the choice applies to that open only. The helpers that detect this
  (`getMissingSessionCwdIssue`, `assertSessionCwdExists`, `MissingSessionCwdError`)
  are private; a host checks `getCwd()` with its own filesystem call. `findById` is
  the wrong lookup here: it creates the default directory first.
- **`SessionManager.findById(cwd)` creates a directory.** It goes through
  `getDefaultSessionDir`, which `mkdir`s `sessions/--<cwd>--` even when `sessionDir`
  names another place. Look an id up through `SessionManager.listAll(sessionDir)` or
  the catalog when the folder is not known yet.
- **A permission `confirm` blocks the turn.** `ctx.ui.confirm` waits for the host's
  `ExtensionUIContext` with no timeout and no error. A host that never answers
  leaves the tool call hanging after `tool_execution_start`.
- **`bindExtensions` without `commandContextActions` installs stubs that lie.**
  `ExtensionRunner.bindCommandContext(undefined)` sets `newSession`, `fork`,
  `switchSession` and `navigateTree` to `async () => ({ cancelled: false })` and
  `reload` to a no-op, so an extension command drives a session replacement, reports
  success, and nothing happens. A host that supplies a `uiContext` must supply these
  too, plus `shutdownHandler` if `ctx.shutdown()` is to mean anything. The argument
  shapes are in `dist/modes/rpc/rpc-mode.js`.
- **A fresh session id writes no file.** The JSONL (and its project directory) is
  created on the first appended entry. A `model_change` before the first message
  lives only in memory and is lost on reload.
- **`getAvailableSnapshot()` is a cached view.** It listed 420 models where
  `getAllAvailable()` returned 514 on the same runtime. Read `getAllAvailable()` on
  open and after `reload`, with a timeout and the snapshot as fallback.
- **`dispose()` does not end the process.** MCP transports, extension timers and the
  cache warmer keep handles open. A one-shot check script needs `process.exit(0)`.
- **A model list's `supported_endpoints` is a gateway hint.** A model that only
  accepts `/messages` or `/responses` needs that API on its own entry, and newer
  Claude models need adaptive thinking metadata. Import both per model.
- **Configuration shapes with no exporter, and several without a setter.**
  `SettingsManager` has `getDefaultTools()` and no `setDefaultTools`, so the
  `defaultTools` array is a merge. That getter answers the **resolved** list
  (`resolveDefaultTools` in `dist/core/settings-manager.js`): plain names replace
  pi's `["read", "bash", "edit", "write"]`, `+name` and `-name` modify it, and an
  empty array means no tools at all. A host that writes the resolved list back
  freezes today's defaults, so Epsilon adds `+name` to a file that has no list and
  removes the key rather than writing `[]`. The same holds, with getters only, for
  `compaction.reserveTokens`, `compaction.keepRecentTokens`,
  `compaction.modelOverrides`, `retry.maxRetries`, `retry.baseDelayMs`,
  `retry.maxAgentDelayMs`, `branchSummary.reserveTokens` and
  `branchSummary.skipPrompt`. `getCompactionReserveTokens(model)` resolves the
  model's override before the ordinary number, so a host that shows only the
  ordinary value is showing the wrong one. `models.json` `modelOverrides` accepts no `api` and
  no `baseUrl` (pi ignores both when present rather than refusing the file), and its
  `cost` may be partial, field by field. pi reads `models.json` with a comment- and
  trailing-comma-tolerant reader (`dist/utils/json.js`), so a strict rewrite deletes
  comments an operator relies on; `settings.json` and `mcp.json` are parsed strictly.
- **`hideThinkingBlock` is a global setting with a writer.**
  `SettingsManager.getHideThinkingBlock()` and `setHideThinkingBlock(hide)` read and
  write `globalSettings.hideThinkingBlock` and save pi's own `settings.json`, so a
  host that changes it from the browser needs no file code and a terminal sees the
  same value.
- **A setting's value, its layer and its refusal are three separate reads.**
  `getSettings()` is the merged view, `getGlobalSettings()` and
  `getProjectSettings()` are the files as loaded, and the getters add pi's built-in
  default, which appears in neither file. `getCacheWarmingMode()` and
  `getDefaultProjectTrust()` read the global layer alone, so a project value for
  either is kept by pi and does nothing. `getCompactionReserveTokens()`,
  `getCompactionKeepRecentTokens()` and `getHttpIdleTimeoutMs()` throw on a value pi
  refuses, so a host that reads many keys catches per key: one hand-edited number
  would otherwise fail every read of the file. `getWarnings()` returns only the keys
  a file writes, so an absent `anthropicExtraUsage` means pi's default of `true`
  rather than `false`, and `setWarnings()` replaces the whole object.
- **`drainErrors()` is the only signal that a settings file failed to load.**
  `SettingsManager.create()` records the error and carries on with `{}`, so every
  getter then answers with pi's defaults and nothing reads as wrong. `save()`
  returns without writing while the global file's load failed
  (`globalSettingsLoadError`), so a host that does not drain the errors reports a
  successful write that changed nothing. Drain once after creation, once before a
  write, and surface the file's path with pi's message.
- **Installed packages are bound to one platform.** Native optional dependencies are
  resolved at install time. Install on the machine that runs them; config
  files are portable, dependency trees are not.
- **A pi call that defaults its `cwd` uses the process's.** `process.cwd()` of the server
  or an engine is never a chat's folder, and pi would take it as the project and load
  its `.pi`. No pi call may default its `cwd`; every one is given a chat's or a
  project's folder.
- **`prompt()` waits for every `agent_settled` handler.** While pi emits
  `agent_settled` (`_isEmittingAgentSettled`), `prompt()` queues itself on
  `_deferredSettledActions` and returns; it reaches preflight only after every handler
  finishes (`core/agent-session.js:128-130,684-700,1629-1635`; custom messages too, at
  `:1866`). A handler that awaits a network call holds the next prompt for as long as it
  runs, so a host acknowledges a command instead of awaiting it and gives a run a
  deadline.
- **pi does not redirect stdout, so stdout is not a protocol channel.**
  `takeOverStdout()` — which sends `process.stdout.write` to stderr — is called only by
  `modes/rpc/rpc-mode.js` and the CLI's `main.js`. The SDK path an engine uses does not
  call it, so pi, its extensions and codemode may write to stdout at any moment. An
  engine's protocol rides Bun IPC; logs go over IPC or stderr.
- **`settings.json` is locked, with specific options.** `FileSettingsStorage.withLock`
  takes `lockfile.lockSync(path, { realpath: false })`, retries 10 times with a 20 ms
  synchronous spin, and only locks when the file exists or a write is produced
  (`core/settings-manager.js:126-180`). A host taking the same lock must pass the same
  path and options; use the async `lockfile.lock` so the spin never blocks the server.
- **A session file is not locked by pi.** `proper-lockfile` is used by the trust,
  settings, auth, package-CLI and MCP-OAuth stores only; `session-manager.js` has no
  lock. Two processes appending to one session is possible and undetected by pi.
- **A bash tool update is the whole accumulated output, not a delta.**
  `tool_execution_update` carries `output.snapshot(...)`, tail-truncated to 2,000 lines
  or 50 KB and throttled to one update per 100 ms (`core/tools/bash.js:180-195`,
  `renderers/bash.js:15`). A host that wants deltas computes them itself.
- **A session line is `{ type, id, parentId, timestamp, message }` in that order.**
  `appendMessage` builds the literal and `_persist` writes one `JSON.stringify` line
  (`core/session-manager.js:812,827`). A reader that peeks at a line prefix may rely on
  it; the conformance test guards it.
- **`mcp.json` and `mcp-auth.json` take no directory argument.**
  `extensions/mcp/index.js:1202` and `oauth.js:88` resolve `getAgentDir()` themselves, so
  the only way to point them at another home is `PI_CODING_AGENT_DIR` in the process
  environment. Every other reader accepts an explicit directory.
