# pi's surface: SDK and CLI

Reference for what pi exposes to an embedding host and what it does not. Everything
here was read from pi's shipped types and code, not from documentation prose.
Epsilon embeds pi's engine through this SDK ([DECISIONS.md](DECISIONS.md), "One engine
process per live chat") and configures it through the same exports plus pi's documented
files ([DECISIONS.md](DECISIONS.md), "Web interface for pi, keeping pi's concepts").

This file describes pi. Where Epsilon applies a fact, it says what Epsilon does, never
which file does it: file paths go stale when code moves, and the code's own comments
carry them. How to re-verify all of it on a pi upgrade is the last section,
[Upgrading pi](#upgrading-pi).

**Re-verify after every pi upgrade.** The sources of truth. Paths are relative to the
pinned package, `node_modules/@earendil-works/pi-coding-agent`, which is the
copy epsilon drives. `pi` on `PATH` may be a different version, so grep the pinned
package, not the installed CLI.

| Fact                         | File                                                          |
| ---------------------------- | ------------------------------------------------------------- |
| SDK exports                  | `dist/index.d.ts`                                             |
| Session creation and runtime | `dist/core/sdk.d.ts`, `dist/core/agent-session.d.ts`          |
| Event and input types        | `dist/core/extensions/types.d.ts`                             |
| Model runtime and auth       | `dist/core/model-runtime.d.ts`, `@earendil-works/pi-ai` types |
| Settings writer              | `dist/core/settings-manager.d.ts`                             |
| Package manager              | `dist/core/package-manager.d.ts`                              |
| Models config shape          | `dist/core/model-config.d.ts`                                 |
| MCP config shape             | `dist/extensions/mcp/config.d.ts`, pi's `docs/mcp.md`         |
| What the CLI does            | `dist/main.js` (a host over the library, not a second engine) |

Verified against 1.4.0.

## Embedding

`createAgentSession()` gives a `ModelRuntime` on `<agent home>/auth.json` and
`models.json`, a file-backed `SettingsManager`, a persistent `SessionManager`, a
`DefaultResourceLoader`, and the configured default tools.

What it does **not** load, and the CLI does: `codemode`, `tool_search` and MCP. Add
`createCodemodeExtension()`, `createToolSearchExtension()` and
`createMcpExtension()` to `DefaultResourceLoader`'s `extensionFactories`, enable the
tool names the settings expect, and call `session.bindExtensions()` so MCP servers
connect on session start. `createCodemodeExtension()` without options reads the
`codemode.mode` setting; passing `{ mode: "on" }` overrides it.

`codemode` and `tool_search` are registered inactive, so a tool is only reachable
once something activates the one that reaches it. Two things do, and the host
should not add a third: the `defaultTools` setting naming `codemode` (or
`tool_search`), or the MCP extension itself, which activates `codemode` for a
`codemode` server while the file's `autoEnableCodemode` is on and `tool_search` for a
`deferred` one. Either reaching tool can call both kinds of MCP tool, which is why
pi warns only when neither is active. Passing `tools` to `createAgentSession`
restricts the session to the named tools and hides MCP tools; Epsilon passes none.
pi's `docs/sdk.md#codemode-mcp` and `examples/sdk/14-codemode-mcp.ts` are the
reference wiring.

Register those three the way the CLI does, as
`{ name, factory, replaceable: true, builtin: true }` in `dist/extensions/index.js`.
That list is not exported; a host that wants CLI parity builds the same entries.

An extension can add a tool of its own with `pi.registerTool`, which the host should
use only when it means to ask the user something or reach something pi does not:

- The `parameters` field is **TypeBox**, not Effect Schema and not zod. pi validates a
  call against it before `execute` runs, and its own tools import `Type` from
  `typebox`; the host must declare `typebox` itself rather than relying on pi's copy.
- `execute(toolCallId, params, signal, onUpdate, ctx)` returns
  `{ content, details }`. `details` is the host's shape, kept beside the tool result;
  `content` is what the model reads.
- A tool that asks a question does it through `ctx.ui.select`, `ctx.ui.confirm` or
  `ctx.ui.input`. pi waits for the answer, so an unanswered dialog blocks the turn.
  With a `uiContext` bound in `"json"` mode these calls become the host's dialogs,
  which is how `discuss` reaches the page.
- `promptSnippet` and `promptGuidelines` are how a custom tool is described in the
  system prompt; a tool without a snippet is left out of the Available tools section.

Other facts worth having before embedding:

- `mode` is not on `AgentSessionConfig`. It is a field of `ExtensionBindings`,
  passed as `session.bindExtensions({ mode, uiContext })`, and extensions read it
  as `ctx.mode`. The union is `"tui" | "rpc" | "json" | "print"`. Epsilon passes
  `"json"`: it is a headless host, and the only distinction extensions act on is
  `mode === "tui"`. The mode names a presentation, not a transport, and the
  combination `"json"` **with** a `uiContext` is one pi never produces itself, so
  `hasUI` (true here) is the field to branch on, not the mode.
- `InputSource` is `"interactive" | "rpc" | "extension"`. A prompt typed by a person
  in the browser is `"interactive"`.
- Adding to a run that is already going goes through `prompt`, never `steer`: while
  streaming, `prompt` needs `streamingBehavior` (`"steer"` interrupts after the
  current turn's tools, `"followUp"` waits for the run to settle), and it dispatches a
  registered extension command immediately. `steer()` and `followUp()` throw
  `Extension command "/x" cannot be queued`.
- `getContextUsage()` is `undefined` until a model is chosen, and answers `null`
  tokens and percent after a compaction until an assistant has responded again.
  `getSessionStats()` sums every entry in the session file, including the history a
  compaction removed. `compact()` aborts the running turn before it compacts, and
  answers `Nothing to compact (session too small)` when it cannot.
- `cacheWarmingStatus` is `undefined` until the warmer exists, then
  `{ state: "inactive" | "scheduled" | "refreshing", reason?, nextWarmAt?, decision? }`.
  No session event fires when it changes: the warmer runs on its own timer, so a host
  that displays it needs its own refresh at `nextWarmAt`. `decision` is pi's price
  model (warm cost, miss cost, continuation probability, expected savings); the rest
  is what a panel needs to say when and why.
- A `uiContext` is required for dialogs; without one a `confirm` has nowhere to go.
  `ExtensionUIContext` is 27 methods plus a `theme` property
  (`dist/core/extensions/types.d.ts`):
  - **answer** a person: `select`, `confirm`, `input`, `editor`. The first three take
    `ExtensionUIDialogOptions { signal?, timeout? }`; `editor(title, prefill)` takes no
    options in 1.4.0, and no `EditorDialogOptions` exists. pi's RPC host resolves a
    dialog whose signal is already aborted with the method's default and sends no
    request at all, and on an abort or timeout it resolves the default without telling
    the host, so a dialog already drawn stays on screen unless the host closes it. The
    MCP extension's sign-in passes `{ signal }` to `ctx.ui.input`.
  - **show** state: `notify`, `setStatus`, `setTitle`, `setWidget` (text lines or a
    TUI component), `setEditorText`, `pasteToEditor`, `getEditorText`. `notify`'s
    optional second argument is `info | warning | error`, and pi sends no type when an
    extension omits it, so a host reads a missing type as `info`.
    `setEditorText` and `pasteToEditor` are fire-and-forget and have no reply. The TUI
    makes the paste insert at the editor's cursor; the RPC host falls back to
    `setEditorText`. `getEditorText` is **synchronous**, so it can only answer what the
    host already holds: the TUI reads the editor, and the RPC host always answers `""`.
    A host with a real composer reports the draft into the engine and answers from that.
  - **working and view state**: `setWorkingMessage`, `setWorkingVisible`,
    `setWorkingIndicator`, `setHiddenThinkingLabel`, `getToolsExpanded`,
    `setToolsExpanded`. `setWorkingMessage()` with no argument restores pi's own word,
    `"Working"`, and `setHiddenThinkingLabel()` restores `"Thinking..."`. That label is
    what pi draws **instead of** the thinking text when `hideThinkingBlock` is set:
    pi does not drop the block silently, and a reply that only thought still shows the
    label. `setWorkingIndicator` takes animation frames and an interval for the TUI
    spinner, which is why a host that draws its own spinner cannot honour it. Tool
    expansion is one session-wide boolean, `false` in pi's defaults, and
    `getToolsExpanded()` is synchronous, so it answers what was last set.
  - **terminal only**: `custom`, `onTerminalInput`, `setFooter`, `setHeader`,
    `setEditorComponent`, `getEditorComponent`, `setWorkingIndicator`, and the theme
    trio `getAllThemes`, `getTheme`, `setTheme`
    `custom` exists and takes a component factory, so a host with no terminal cannot
    render it. `theme` does not belong with the trio: it is a working `Theme` in every
    mode where a host supplies a uiContext, and an extension reads it without asking.
    The singleton is **not** reachable: it lives in the internal
    `dist/modes/interactive/theme/theme.js`, the package's `exports` map names only
    `.` and `./rpc-entry`, and
    `dist/index.d.ts` exports `Theme`, `initTheme` and the `get*Theme` helpers but not
    `theme`. pi's own RPC mode reaches it by an internal relative import that a host
    cannot copy, and `new Theme(...)` throws without pi's token tables. A host must
    therefore supply its own `Theme` value where every colour method returns its text
    unchanged. A host that returns a stub which throws kills whichever handler reads
    it, and pi counts a failed `tool_call` handler as blocking the tool. Of the 28
    members (27 methods and `theme`), Epsilon answers 18: the dialog group, the display
    and composer groups, the autocomplete chain and `theme`. It refuses 7 with one notice
    each (`custom`, `onTerminalInput`, `setFooter`, `setHeader`, `setEditorComponent`,
    `getEditorComponent`, `setWorkingIndicator`) and answers the theme trio with an empty
    or failing result by design.
- `mode` and `hasUI` answer different questions, and only one of them matters to an
  extension. `ExtensionMode` is `"tui" | "rpc" | "json" | "print"`: a presentation, not
  a transport, and its doc comment says to use `"tui"` as the guard for terminal-only UI.
  `hasUI` is the field for dialog-capable UI, and pi computes it from the uiContext
  itself (`runner.hasUI()` is `uiContext !== noOpUIContext`), so any host that supplies
  one has `hasUI: true` whatever the mode says. Epsilon therefore keeps `"json"` and
  still supplies a full uiContext: a combination pi's own modes never produce, and the
  one that makes an extension's dialogs work in a browser. Its `mode` is honest about
  the presentation and its `hasUI` is honest about the dialogs.
- Autocomplete is a provider chain, not a list of items. `addAutocompleteProvider`
  takes `AutocompleteProviderFactory = (current: AutocompleteProvider) => AutocompleteProvider`
  and pi applies the factories in registration order over its own base, collecting
  each one's `triggerCharacters` (`dist/modes/interactive/interactive-mode.js`,
  `setupAutocompleteProvider`). A provider answers
  `getSuggestions(lines, cursorLine, cursorCol, { signal, force? })`, which is
  **async** and returns `{ items, prefix } | null`; `items` are
  `{ value, label, description? }`, and `prefix` is the text before the cursor the
  provider matched. `applyCompletion(lines, cursorLine, cursorCol, item, prefix)`
  turns a pick into new lines and a cursor position. pi's RPC host ignores the whole
  method, so a host that wants it must build the chain itself.
- `NewSessionOptions.id` creates a session with an exact id. `SessionManager` lists,
  opens, finds, creates and owns `getEntries()`, `getTree()` and `getSessionName()`.
  `SessionManager.forkFrom(sourcePath, targetCwd, sessionDir?)` copies a file's history
  into a new session under a new id in another folder, which is how a chat moves into a
  project: Epsilon uses it in `src/backend/platform/pi.ts`, and the target folder must be
  trusted first because the fork loads its resources. `AgentSessionRuntime` owns
  `newSession`, `switchSession`, `fork` and
  `importFromJsonl`, and replaces the active session. It is built by
  `createAgentSessionRuntime(createRuntime, { cwd, agentDir, sessionManager })`, and
  `createRuntime({ cwd, agentDir, sessionManager, sessionStartEvent, projectTrustContext })`
  answers `{ ...createAgentSessionFromServices({ services, sessionManager, sessionStartEvent }), services, diagnostics }`,
  where `services` come from `createAgentSessionServices({ cwd, agentDir, settingsManager,
  resourceLoaderOptions })`. The factory runs again for every replacement, with the
  effective cwd. Subscriptions belong to the session that was replaced, so a host passes
  `setRebindSession()` to bind extensions and re-subscribe on the new one; the
  runtime's `dispose()` emits `session_shutdown` with reason `quit` and disposes the
  session it holds. `fork(entryId)` copies the
  branch up to a user message, `fork(leafId, { position: "at" })` is the CLI's `/clone`,
  and both write a new session file under a fresh id — a fork before the first message
  makes an empty session that has no file yet. Epsilon opens one runtime per live
  session and keeps every id it held, so a replacement is pi's operation and the page
  follows the new id; a copy is a second runtime built for that request and closed.
- `AgentSession` also carries the controls around a turn: `prompt` (with
  `streamingBehavior`), `steer`, `followUp`, `abort`, `clearQueue`,
  `getSteeringMessages`, `getFollowUpMessages`, `getSessionStats`, `getContextUsage`,
  `compact`, `abortCompaction`, `setAutoCompactionEnabled`, `abortRetry`,
  `setAutoRetryEnabled`, `isRetrying`, `executeBash`, `abortBash`, `isBashRunning`,
  `cacheWarmingStatus`, `setSessionName`, `navigateTree`, `exportToHtml`,
  `exportToJsonl`, `getAllTools` and the model and thinking setters. A socket feature
  uses one of these instead of inventing an RPC command.
- `clearQueue()` **returns** the prompts it removed, as `{ steering, followUp }`, and
  its doc comment names the reason: restoring them to the editor. `abort()` does not
  clear the queue, so a host that wants the text back calls `clearQueue()` first. pi's
  own editor joins the returned prompts with a blank line and puts them in front of
  whatever is already typed.
- `exportToHtml(outputPath?, options?)` and `exportToJsonl(outputPath?)` write a file
  and answer its path; neither hands back the bytes. `exportToHtml` refuses a session
  with nothing written yet (`Nothing to export yet - start a conversation first`, and
  `Cannot export in-memory session to HTML` when it has no file at all), fills pi's
  bundled template (read from pi's own package directory, which `PI_PACKAGE_DIR` can
  move) into one self-contained page, and pre-renders custom tool output through the
  live extension runners, so it needs the engine, not just the file. `exportToJsonl`
  serialises the current branch, header first, and needs no file. The package's
  `exports` map exposes only `.` and `./rpc-entry`, so `dist/core/session-export.*`
  is private: a host exports through a live session rather than a standalone call.
- `prompt()` takes images as `ImageContent` (`{ type: "image", data, mimeType }`, the
  base64 without a `data:` prefix) in its `images` option, and pi normalises them
  itself: it runs `processImage` with the `images.autoResize` setting and the model's
  `inputLimits.images.resize`, and an image it rejects becomes a hint in the run
  instead of a failed turn. A host therefore bounds only the memory one frame may
  hold, not the format or the size the model finally sees.
- `navigateTree(targetId)` moves the leaf within the same session file, and throws
  while the session is streaming or compacting (`Wait for the current response to
  finish…`), so a host that offers it needs no state of its own to keep a run safe.
  A target that is a user message sets the leaf to that message's **parent** and
  returns its text as `editorText`; the next prompt then starts a sibling branch.
  Any other entry becomes the leaf itself. Either way the switch refreshes
  `agent.messages` and restores the active tools before it resolves, and
  `sessionManager.getBranch()` answers the new branch, root to leaf. Its options also
  take `summarize`, `customInstructions` and `replaceInstructions` for the branch it
  leaves, and a `label` for the summary entry; the summary is a model call.
  `getUserMessagesForForking()` is not a branch list: it returns the user messages
  of every branch in the file.
- `toJsonEvent` is the transformation between a live event and the JSON the reducer
  consumes: `message_update` loses its `partial` payload and `toolcall_start` gains
  `id` and `toolName`. It is **not exported**. A host carries the transform itself
  (see Traps).
- `session.dispose()` aborts work, invalidates extension contexts and removes
  listeners. A host that forgets it leaks a running agent. It does **not** emit
  `session_shutdown`; only the runtime's `dispose()` does (see Traps), so a host that
  calls the plain one skips every extension cleanup registered on that event.
- `session.reload()` re-reads resources without replacing the session or changing its
  id, but it does tear the extension runners down and start them again: extensions see
  `session_shutdown` and then `session_start`, both with reason `reload` (Extensions,
  below). Epsilon exposes it as a socket command and calls it after every settings write.
- `prompt()` dispatches extension commands, prompt templates and `/skill:` entries. It
  does **not** dispatch pi's built-in slash commands: `/compact`, `/model` and the rest
  of `dist/core/slash-commands.js` are answered by the TUI's submit handler, so a host
  that forwards the raw text sends `/compact` to the model. Epsilon carries the name
  list as a table both sides read and answers each row itself.

## Events

`JsonAgentSessionEvent` is the type the reducer reads. `message_start` gives the
initial message, deltas build on it, and `message_end` gives the authoritative
message. A refused provider call is an assistant `message_end` with
`stopReason: "error"` and an `errorMessage`; there is no separate error event.

Run lifecycle: `agent_start`, `turn_start`, `turn_end`, `agent_end`, `agent_settled`

Messages: `message_start`, `message_update`, `message_end`, `entry_appended`

Tools: `tool_execution_start`, `tool_execution_update`, `tool_execution_end`

Compaction and retries: `compaction_start`, `compaction_end`, `auto_retry_start`,
`auto_retry_end`, `summarization_retry_scheduled`,
`summarization_retry_attempt_start`, `summarization_retry_finished`

Session and queue: `queue_update`, `session_info_changed`,
`thinking_level_changed`, `bash_execution_update`

Extension lifecycle names (`session_start`, `session_shutdown`, `tool_call`,
`project_trust` and the rest) are `ExtensionEvent`s the extension subscribes to in
`pi.on(...)`, not members of the `AgentSessionEvent` union the socket carries. A host
does not receive them as frames.

`bash_execution_update` exists in the union but pi's own UI ignores it. The `bash`
tool also records a `bashExecution` message in the session, which reaches a reader
only through the session's messages
(see Traps).

`bash_execution_update` carries the `id` a caller passed to `executeBash` and one
`delta` per chunk, so a host that passes an id can show a command's output while it
runs and tell two runs apart. Without an id the field is absent, which is what pi's
own interactive mode does.

`compaction_end` reports its own outcome and nothing else does: `reason`, a `result`
carrying `summary`, `firstKeptEntryId`, `tokensBefore`, `estimatedTokensAfter`, the
summarizer's `usage` and any `details`, plus `aborted`, `willRetry` and
`errorMessage`. A successful compaction also appends a `compaction` entry, which is
what a snapshot shows as a `compactionSummary` message.

`entry_appended` is pi's append-only record, not a message stream. `custom_message`
entries become messages (`getMessages()` projects them, with `display` as pi wrote
it); a plain `custom` entry is bookkeeping and is drawn only by a renderer the
extension registered for its `customType`
(`session.extensionRunner.getEntryRenderer(customType)`). pi draws nothing for the
rest, and neither does a faithful host.

`tool_execution_start`, `tool_execution_update` and `tool_execution_end` carry
`parentToolCallId` when another tool made the call (`ctx.executeTool()`, as a
codemode script does), and the model-issued call's tool result carries the bounded
record of them in `nestedCalls` (`{ calls, complete }`). The record keeps the call,
its arguments up to pi's size limits, `status: "ok" | "error" | "unfinished"`,
`durationMs` and pi's truncated error text; it keeps no results. A nested call is
never a top-level row and is not a message of its own.

## Writers: what the SDK can and cannot save

| Thing                      | Writer                                                                                                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Default provider and model | `SettingsManager.setDefaultModelAndProvider`, then `flush()`                                                                                                                                           |
| Other settings             | `SettingsManager` setters (there is none for `defaultTools`, below)                                                                                                                                    |
| Packages                   | `DefaultPackageManager.installAndPersist`, `removeAndPersist`, `listConfiguredPackages`, `update`, `checkForAvailableUpdates`; `SettingsManager.setPackages` and `setProjectPackages` for a filter     |
| Project trust              | `ProjectTrustStore.set`                                                                                                                                                                                |
| Tree labels                | `SessionManager.appendLabelChange(targetId, label)` writes one `label` entry; `undefined` clears it                                                                                                    |
| Providers (`models.json`)  | **none.** `registerProvider()` is runtime-only; `ModelConfig` is read-only                                                                                                                             |
| MCP servers (`mcp.json`)   | **none reachable.** `addMcpServerConfig`, `removeMcpServerConfig` and `loadMcpConfig` exist, but the package's `exports` map exposes only `.` and `./rpc-entry`, so they cannot be imported through it |
| Skills                     | **files, plus the `skills` setting.** A skill is a directory with `SKILL.md`; `SettingsManager.setSkillPaths` and `setProjectSkillPaths` write the array of paths and `-path` overrides                |
| Credentials (`auth.json`)  | `ModelRuntime.login()` and `logout()` for a provider that declares a login method                                                                                                                      |

`ModelRuntime.login(providerId, type, interaction)` drives a whole sign-in and
persists through the credential store; `logout()` removes it. `type` is `"api_key"` or
`"oauth"`, and what a provider offers is on its `auth` field. The interaction is
`prompt()` plus `notify()`: a prompt is `text`, `secret`, `select` (answer with an
option id) or `manual_code`, and a notify is `info`, `auth_url`, `device_code` or
`progress`. `AuthPrompt.signal` lets pi withdraw a question it no longer needs, a
`manual_code` raced against its own callback server, and the host must reject that
prompt. An OAuth flow starts its own callback server on a fixed loopback port, so two
sign-ins for one provider cannot run at the same time. `LoginOptions.getDeviceId` is
read by the providers that name an agent (ChatGPT's); pi's CLI passes
`SettingsManager.getOrCreateDeviceId()`.

`ProviderAuth` declares `apiKey?: ApiKeyAuth` and `oauth?: OAuthAuth`. An API-key
method with `login` asks for the key and for any provider-scoped `env`
(`ApiKeyCredential.env`, such as Cloudflare's account id) through the same prompt
callback, so a host that already relays questions needs nothing special for it;
`apiKey.name` is the label a panel shows. A method without `login` is ambient-only,
so a host has nothing to start and only the environment or a stored key can configure
it.

A custom `models.json` endpoint gets pi's fabricated API-key login, which asks for one
bare key and nothing else, so the dashboard writes that key to `models.json`'s
documented `apiKey` field instead: the field accepts a literal, `$NAME`, or `!command`
output, which the fabricated prompt cannot express.

`auth.json` holds at most one credential per provider, and pi resolves it first: a
stored credential wins over a `models.json` `apiKey` and over the ambient environment.
`getProviderAuthStatus()` names which one it is (`stored`, `runtime`, `environment`,
`models_json_key`, `models_json_command`, `fallback`), with a `label` for the source in
pi's own words (`ANTHROPIC_API_KEY`, `~/.aws/credentials`), and `listCredentials()` is
the non-secret enumeration of `{ providerId, type }`.

Readiness is not a model count. `checkAuth(providerId)` resolves that provider's auth
and returns `{ type, source }`, or `undefined` when it has no credential; it runs the
provider's own side-effect-free `check()` where one exists. `getError()` holds the
composition failure for the whole `models.json` snapshot, and pi's sentence names the
provider it could not build. `pi auth check` maps those to `ready`, `not_ready` and
`invalid`.

Because the flow asks and reports through callbacks, a host without a terminal serves
it with a record per provider: what pi reported, the question it waits on, and an
abort signal, polled by the page. pi also narrates the loopback callback server it
opens, which names a port the operator cannot act on, so those lines are dropped and
the rest of what it reports is shown. Epsilon keeps that record in its providers login
service and writes no `auth.json` of its own; pi exports neither the store nor its
cross-process lock.

`models.json` is parsed with `ModelConfig.load()`, which is read-only. Its provider
fields are documented in pi's `docs/models-configuration.md`: `name`, `baseUrl`,
`apiKey`, `api`, `headers`, `authHeader`, `oauth`, `models`, `modelOverrides`,
`compat` and the per-model extras (`thinkingLevelMap`, `inputLimits`, `promptCache`,
`samplingParams`, `samplingParamsByThinkingLevel`, `headers`). The panel writes
`thinkingLevelMap` and the reasoning subset of `compat` from the model dialog,
provider-wide `compat` from the provider's reasoning defaults, and keeps every
unknown key in both objects. A model
needs only `id`; `input` defaults to `["text"]`, `contextWindow` to 128000 and
`maxTokens` to 16384. `cost` is optional, and when present its four fields are
required; `cost.tiers` is optional. A `modelOverrides` object merges field by field
for object fields such as `cost`; every other field replaces the model's value.
`ModelRuntime.getModels()` returns the composed model, with the stored override
already applied, so the panel seeds its dialog from the runtime's answer rather
than from the file. The runtime's composed model also carries `inputLimits`,
`promptCache`, `samplingParams` and `samplingParamsByThinkingLevel`, but never the
per-model header values: `rawModelHeaders()` applies those from the file. The
extension-facing `ProviderModelConfig` that `registerProvider()` takes has no
`samplingParamsByThinkingLevel`, so a provider registered at runtime cannot set
that field while `models.json` can.

## Skills

What the dashboard relies on, read from `dist/core/skills.js`, `package-manager.js`
and `resource-loader.js` (1.4.0):

- **Fields pi honors:** `name`, `description` and `disable-model-invocation`. A skill
  without a description is not loaded, and pi reports why. `name` is optional: without
  it pi uses the folder name, and a declared name may differ from the folder with no
  warning at all. A bad name only warns. The body is optional, so frontmatter alone
  loads. `disable-model-invocation: true` keeps the skill out of the system prompt;
  `/skill:name` still runs it. Every other key is parsed and ignored.
- **`enableSkillCommands: false`** removes the `/skill:name` entries from the editor's
  autocomplete and changes nothing else: `prompt()` still expands a typed `/skill:name`.
  pi's setting is read when the engine starts, so a running chat keeps its old palette
  until it reloads.
- **What Epsilon may write**, because pi loads it: a non-empty description of at most
  1024 characters, any text in that description (pi XML-escapes `name`, `description`
  and the path inside `<available_skills>`, so `<`, `>` and `&` are legal), a name
  matching `^[a-z0-9-]+$` with no leading, trailing or double hyphen, and `SKILL.md` as
  the file name. Epsilon refuses a bad name that pi would only warn about.
- **Where skills come from, and who wins:** pi's resolver carries a precedence rank
  and a package skill ranks **last** (`resourcePrecedenceRank` in
  `dist/core/package-manager.js`), so a project or user skill of the same name beats
  it. The sources are entries of the `skills` setting (project, then user),
  `<project>/.pi/skills`, `.agents/skills` in the project and each parent up to the
  git root (trusted projects only), `<agent home>/skills`, then `~/.agents/skills`,
  with packages at the bottom of the order. The `~/.agents/skills` path reads
  `process.env.HOME`, not a value Epsilon passes. The first skill with a name wins;
  each loser gets a `collision` diagnostic with the winner's and loser's paths.
- **The inventory is pi's.** `DefaultPackageManager.resolve()` lists every skill file
  with `enabled` and where it came from; `loadSkills` and `loadSkillsFromDir` parse
  them. `resolve()` installs a missing package unless the `onMissing` callback
  answers `"skip"`, so a read always passes one.
- **Turning one skill off** is a `-<path>` entry in the `skills` array of the file
  that owns the skill's scope. `isEnabledByOverrides` matches the skill's absolute
  directory, its `SKILL.md` path, or either relative to the scope's base folder. A
  package skill is filtered through that package's entry instead.
- **Folders of other agents** (`~/.claude/skills`, `~/.codex/skills`) are not
  scanned. A plain path in the `skills` array adds the folder: any directory, or one
  `.md` file. A file with no frontmatter `name` takes its parent folder's name, which a
  flat file makes an invalid skill name, so give a standalone file a `name`.
- **Skills an extension adds at runtime** come from the `resources_discover` event,
  which returns `skillPaths` (and `promptPaths` and `themePaths`). pi extends the live
  resource loader with them, tagged `source: "extension:<file name>"` and
  `scope: "temporary"`, so `agent.resourceLoader.getSkills()` lists them and
  `resolve()` never does. They exist only inside a live engine.

Prompt templates and themes are resources with the same shape: `resolve()` lists their
files with `enabled` and their source metadata, a path in the `prompts` or `themes`
setting adds a folder or a file, and a `-<file>` entry excludes one. pi's own prompts
and themes folders are discovered under the agent dir and a trusted project's `.pi`. A
prompt template is named after its file without `.md`; its description is the
frontmatter `description`, else the body's first line. A theme is a `.json` file and
pi applies exactly one. The session's `promptTemplates` is what the palette lists, and
`prompt()` expands `/name args` into the message it sends.

## Context files and the system prompt

What pi loads before a request, read from `dist/core/resource-loader.js`
(1.4.0):

- **Context files:** `loadProjectContextFiles({ cwd, agentDir })` is a root export. It
  reads one file per folder, trying `AGENTS.override.md`, `AGENTS.md`, `AGENTS.MD`,
  `CLAUDE.md`, `CLAUDE.MD` in that order, starting with the agent directory and then
  every ancestor of `cwd` from the root down to `cwd`. They load regardless of project
  trust, so a folder's context files apply before anything is trusted. A nested
  `git worktree` whose own copy shadows the main repository's file is skipped.
  `ResourceLoader.getAgentsFiles()` answers the same list from inside an engine.
- **The system prompt file:** `<cwd>/.pi/SYSTEM.md` when the project is trusted, else
  `<agentDir>/SYSTEM.md`. `APPEND_SYSTEM.md` is discovered the same way, and only one
  of the two is used. Both discoveries are private methods on `DefaultResourceLoader`,
  reachable only by calling `reload()`, which resolves packages with no `onMissing`
  handler and therefore installs a missing one. A reader that must not install
  reproduces the four file checks instead.
- **The prompt itself:** `agent.systemPrompt` is the exact text the model receives,
  extensions' `before_agent_start` substitutions included. `agent.promptTemplates` is
  pi's own parse of the templates, extension-contributed ones included.
- **Frontmatter:** `parseFrontmatter` and `stripFrontmatter` are root exports.
  `loadPromptTemplates` is not, so a reader outside an engine parses a template file
  itself and repeats pi's two fallbacks: the name is the file's without `.md`, and the
  description is the frontmatter `description`, else the body's first line cut at 60
  characters.

## API family paths

pi's clients append a fixed path to a provider's `baseUrl`. Verified against the
clients in the pinned package and the vendors' references (OpenAI API reference,
Anthropic TypeScript SDK, Google Gen AI SDK) on 2026-10-29.

| Family                 | Appended path                     | Model list    | Auth header                   |
| ---------------------- | --------------------------------- | ------------- | ----------------------------- |
| `openai-completions`   | `/chat/completions`               | `/models`     | `Authorization: Bearer <key>` |
| `openai-responses`     | `/responses`                      | `/models`     | `Authorization: Bearer <key>` |
| `anthropic-messages`   | `/v1/messages`                    | `/v1/models`  | `x-api-key` plus a version    |
| `google-generative-ai` | `/models/{model}:generateContent` | different API | `x-goog-api-key`              |

The base URL is not interchangeable between families:

- OpenAI expects the version in the base URL (`https://api.openai.com/v1`), so the
  request is `…/v1/chat/completions`.
- The Anthropic client posts `/v1/messages` relative to its base URL, so a gateway
  with its own `/v1` segment needs the base above it. For commandcode, the OpenAI
  base is `https://api.commandcode.ai/provider/v1` while the Anthropic base is
  `https://api.commandcode.ai/provider`.
- pi sets Google's `apiVersion` to empty when a `baseUrl` is present, so the base
  must include the version path (`https://generativelanguage.googleapis.com/v1beta`).

Epsilon's provider rules mirror this table. The provider form's API
picker labels each family with the path it appends, the base URL field names the
request URL that results, and the model-list fetch reads `modelsPath` from the same
list. A list that carries `supported_endpoints` (commandcode does) is read as a
gateway hint: a `/messages`-only model gets the Anthropic API and a base above its
`/v1`, and a `/responses`-only model gets the Responses API. That keeps one
provider's mixed catalog correct. An exact id and API match in pi's catalog also
supplies `reasoning`, `thinkingLevelMap` and `forceAdaptiveThinking`; the rest of
the gateway's compat is left alone. A base that repeats the family's path is a warning under the field, not a
silent rewrite, because pi calls exactly the base it is given. Its test pins the
commandcode paths.

The model list is not a pi SDK method. The settings panel makes its own bounded
`GET` to the endpoints above, with the typed key or the credential resolved by
`ModelRuntime.getAuth()`, no cross-origin redirects, a ten second timeout and a
response cap. The headers follow the rules pi applies to a request: a provider's
`authHeader` sends the key as `Authorization: Bearer` and wins over the family's
header, a credential header resolved to `null` is suppressed rather than replaced,
and the credential's `baseUrl` and `env` values apply, including the `{NAME}`
placeholders Cloudflare endpoints use. Google's list API is a different shape, so
the panel asks for those models by hand.

The provider test is a pi SDK call instead. It registers the draft with
`ModelRuntime.registerProvider()` on a throwaway runtime, which is runtime-only and
writes no file, then asks `completeSimple()` for a small answer. A typed key or
header overrides the stored one, so the test tries what Save would write, and the
request goes through pi's own client rather than a second wire implementation.

It runs two probes. The keyless one registers a placeholder key, because pi refuses
to stream an unconfigured provider, then suppresses the family's auth header with a
`null` header value so the endpoint sees no key. The keyed one uses the typed or
stored credential. That is how a local or keyless endpoint and a real key are told
apart before Save. A `level` on the request is passed to `completeSimple` as
`reasoning`; the test reads the request payload and a clone of the provider stream,
then reports the field the request carried plus the `reasoning_tokens` or thinking
characters the provider returned.

## Session files the index reads

The session index reads pi's v3 JSONL directly, so these are the fields it depends on.
The index's conformance test pins each one to `SessionManager.listAll`; a pi upgrade that
changes one fails there first.

- The first line is `{ type: "session", version: 3, id, timestamp, cwd, parentSession? }`.
  A file whose first entry is not a session header is not listed.
- Every entry is `{ type, id, parentId, timestamp, ... }`; `session_info` carries `name`.
- `messageCount` counts every `message` entry, tool results included.
- Activity time is the newest user or assistant message: `message.timestamp` when it is a
  number, else the entry's `timestamp`. A tool result does not move it.
- `firstMessage` is the first non-empty text of a user message, or `"(no messages)"`.
- Text content is a string, or an array whose `text` blocks are joined with a space.
- The line order is `{ type, id, parentId, timestamp, message }`, which is why a prefix
  peek is possible at all (Traps).
- Appending is the only write Epsilon expects; a rewrite (compaction, branch rewrite,
  migration) is detected by a changed inode, a shrunken size or a changed head, and the
  whole file is re-read.

## Files in the agent home

| Path            | Owner   | What it holds                                                              |
| --------------- | ------- | -------------------------------------------------------------------------- |
| `settings.json` | pi      | Defaults, tools, compaction, packages, skill locations                     |
| `models.json`   | pi      | Provider endpoints, headers, model catalogs, `apiKey` overrides            |
| `auth.json`     | pi      | Stored credentials, one per provider, written through login/logout         |
| `mcp.json`      | pi      | `mcpServers` and `autoEnableCodemode`, shared shape with other MCP clients |
| `mcp.log`       | pi      | Messages MCP servers send with `notifications/message`, rotated at 5 MB    |
| `trust.json`    | pi      | Project trust decisions                                                    |
| `mcp-auth.json` | pi      | MCP OAuth tokens                                                           |
| `skills/`       | pi      | User skills; each directory holds a `SKILL.md`                             |
| `sessions/`     | pi      | One JSONL per session, under `--<encoded cwd>--/`                          |
| `chats/`        | Epsilon | The empty folder every chat runs in; it never holds a `.pi`                |

`sessionDir` in `settings.json` moves the session files. pi reads the merged
setting, including a project's `.pi/settings.json` before trust, and resolves a
relative value from the working directory. `SessionManager.create()` and `open()`
take the directory as their second argument, `list(cwd, sessionDir)` and
`listAll(sessionDir)` read it, and a custom directory makes `list()` filter to that
folder's own sessions. `open()` uses the directory for `/new` and `/branch`, and
derives it from the file's parent when none is given.

Skills also load from `<cwd>/.pi/skills`, `<cwd>/.agents/skills`, `~/.agents/skills`
and installed packages.
Packages are declared in `settings.json` and installed with
`pi install npm:@scope/pkg`, `pi install git:host/repo` or `pi install ./path`.
An entry is a source string or an object with `source`, an optional `autoload`, and
optional `extensions`, `skills`, `prompts` and `themes` arrays. A filter pattern is
a path relative to the package root: `-rel` forces it off, `+rel` forces it on,
`!rel` excludes what a glob includes, and a plain entry includes it. An empty array
disables that whole kind. `autoload: false` makes the entry a delta over the package of
the same identity in the other scope, so only the named files load; `pi config` removes
the entry when its last filter goes, which restores the parent. A project entry without
`autoload: false` replaces a global entry of the same package. Identity is an npm
package name without its version, a git host and path, or a local path resolved against
the settings file's folder.
`checkForAvailableUpdates()` answers which npm and git sources are outdated; a local
source, an exact npm version and an offline pi are never checked. `update(source)`
runs the npm or git command itself: a failed command rejects with the command line
and its exit code, and a source that matches nothing gets pi's "No matching package
found" sentence.
MCP servers come from `mcp.json` and a project's `.pi/mcp.json`. The project file
is read only in a trusted project (see Project trust); a project entry
there replaces a global entry of the same name, and one without `command`, `url`
or `type` only overrides its `enabled`, `exposure` and `toolExposure`. A project
entry cannot set `auth`. `pi mcp add` writes user-level servers unless `-l` is
given.

`mcp.json` is parsed with a strict `JSON.parse`, unlike `models.json`: a comment or a
trailing comma makes the whole file unreadable to pi, so a host that read it leniently
would list servers pi never loads. `readConfigFile()` judges a top-level key on its own
and keeps going — a non-boolean `autoEnableCodemode` is one error and the servers in
that file still load — while an unreadable file or a non-object `mcpServers` yields
nothing from it. A server entry is checked by `validateMcpServerConfig()`, which looks
at `args`, `env` and `cwd` only for a stdio entry and `headers`, `oauth` and `auth` only
for an HTTP one; the keys the entry's transport does not use are never inspected and
stay in the file.

`updateMcpServerConfig()` writes `enabled: true` by deleting the key and
`exposure: "codemode"` likewise; an override keeps both written because it
replaces the global entry's values. `timeout` is in **seconds**. Those functions
live in `pi-coding-agent`'s `dist/extensions/mcp/config`, and its `exports` map
exposes only `.` and `./rpc-entry`, so the dashboard parses the documented shape
itself.

Two more published packages sit under that extension, and `pi-coding-agent`
depends on the same versions (`1.4.0` here):

- `@earendil-works/pi-mcp`: the MCP client (`McpClient`, `StdioTransport`,
  `StreamableHttpTransport`, `toLlmContent`) and, at `/oauth`, the authorization
  helpers (`McpOAuthProvider`, `OAuthCallbackServer`, `authorizeMcp`). It speaks
  `2025-11-25` and older, and its README lists what it does not do: no sampling,
  no tasks, no legacy SSE, no batch messages. It has **no configuration surface**
  at all, so `mcp.json` is still pi-coding-agent's.
- `@earendil-works/pi-codemode`: the QuickJS-in-WASM sandbox behind the
  `codemode` tool, with no pi dependencies. The coding agent adds the tool and
  the script globals the docs describe; the package itself is only the VM.

`/mcp` is the extension command over all of it, and it is reachable by typing the
line into a session: `prompt()` dispatches extension commands. Outside the TUI it
answers through `ctx.ui` — with no argument it notifies `formatStatus()`, one line per
server with its state, tool count and exposure; `login` notifies the authorization URL,
calls `openUrl()` **on the machine running the engine**, and asks for a redirect URL
through `ui.input` while the loopback callback races that prompt; `logout` and
`reconnect` notify their outcome, the reconnect one naming pi's own state. So a host
that can show a notice and ask for input can sign in, and one that cannot yet can still
say so.

`createMcpExtension()` and `createCodemodeExtension()` are wrappers over them, and
that is the surface Epsilon uses. Importing the packages directly would mean a
second MCP client: another connection per server, a second stdio process for
every local server, and none of the `mcp.json` resolution, exposure, OAuth,
resources or permission hooks the extension already applies.

The top-level `autoEnableCodemode` (default `true`) is what lets a connecting
`codemode` server activate the codemode tool, and a project value overrides the
global one. Turning it off while `defaultTools` does not name codemode leaves the
server connected but unreachable; the panel reads that state and offers to name
`codemode` or `tool_search` in `defaultTools` for the home. `oauth`
and `auth.provider` decide how an HTTP server authenticates: `auth` sends a
`/login` provider's token and is refused in a project file, and both `oauth` and
`auth` are bounded to https or loopback hosts. Epsilon writes those keys and runs
every save back through the same rules pi's validator applies, so a save either
produces an entry pi loads or is refused with pi's reason.

`exposure` and `toolExposure` are matched by `getMcpToolExposure()` against the name
the **server** reports: an exact key first, then the first `*` pattern in the object,
else the server's own `exposure`. The name pi registers the tool under is a different
string: `mcp__<server>__<tool>` with every character outside `[A-Za-z0-9_]` replaced
by `_`, truncated to 55 characters plus `_` and eight hex digits of a SHA-256 when it
exceeds 64 (the provider limit). `session.getAllTools()` reports that registered name,
the namespace, the annotations and the exposure pi resolved for the tool (its
`codemode` arrives as `deferred`), and never the server's own spelling. So a rule key
is exact only when the registered name carries no `_`: a tool the server calls
`read-file` is registered as `mcp__<server>__read_file` and stays reachable under that
key, which is why Epsilon writes a `*` for every unknown character instead of the
registered spelling.

pi reads `mcp.json` from `getAgentDir()`, the `PI_CODING_AGENT_DIR` process variable
or `~/.pi/agent`, not from the `agentDir` an engine is built with. `main.ts` publishes
the chosen home there once for that reason (AGENTS.md, Invariants 5), and a check that
opens an engine on a scratch home sets it to that home, or pi loads the operator's
`mcp.json` beside it.

A server may offer resources instead of tools. `syncResourceTools()` registers
`list_mcp_resources`, `list_mcp_resource_templates` and `read_mcp_resource` once for
the session, with no server namespace, when at least one enabled server has resources
and its exposure is not `hidden`; their `exposure` is the widest of those servers, and
they are never registered at all otherwise. So the three names prove resources are
reachable and say nothing about which server holds them, and a server that offers only
resources registers no tool, so `getAllTools()` has no row for it.

Connection state still reaches a host, but only as a notice. After the connections
settle (`session_start`) and after a reconnect batch, `reportProblems()` in
`dist/extensions/mcp/index.js` pushes one notice naming every server that needs
attention:

```
MCP servers need attention:
  docs: needs sign-in
  files: failed: connect ECONNREFUSED 127.0.0.1:3001
Run /mcp to fix.
```

A server appears only while it is `needs-auth` or `failed`; a `config:` line reports
a `mcp.json` pi could not read, not a server. The list is complete for the moment it
is sent, so the host replaces what it kept rather than merging into it, and `reload()`
clears it before pi speaks again. The engine parses those lines (Epsilon's MCP
attention rules) and reports them with the live tools, so the panel can
show `needs-sign-in` and `failed` per server; `disabled`, connected with its tool count
and no-tool-yet come from the file and the tool inventory instead. `connected` is never
claimed from the notice: a tool registered for the server is the proof, which is why a
recovered server stops reading as failed without another notice.

The two files a connection leaves behind are readable without a token. A line of
`mcp.log` is `<ISO time> [<server>] <level>: <text>`, and pi rotates it to `mcp.log.1`
at 5 MB. `mcp-auth.json` keys a credential by `<namespace>|<url>`, or by the URL alone
in older versions, so a detail pane can find one server's log tail and tell whether a
sign-in is stored without ever reading the token. Epsilon's MCP store reads those
names.

A settings write reaches the live engines through `session.reload()`, which emits
`session_shutdown` (reason `reload`). The MCP extension closes every connection
there and reconnects on the next `session_start`, so an edit in the panel applies
to a session that is already open.

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

## The CLI, for what an embedding host does not do

These run as commands in a terminal using the same agent home. The dashboard does not
shell out to them, and does not need to for anything below: the pieces it shares with
the TUI (`/login`, `/logout`) it drives as SDK calls, as the Writers section says.

| Command                                                  | What it does                                                                                              |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `pi`                                                     | The interactive TUI: `/login`, `/settings`, `/trust`, `/mcp`, `/model`, `/compact`, `/fork`, `/resume`    |
| `pi auth check --provider <p> [--json]`                  | Reads provider readiness: `ready`, `not_ready` or `invalid`, with a matching exit code                    |
| `pi auth print-api-key`, `print-bearer-token`            | Reads the stored credential or a refreshed token. Read-only; there is no command that writes a credential |
| `pi mcp add`, `remove`, `list --json`, `login`, `logout` | Configures MCP servers and signs in to OAuth servers. `login` opens a browser and waits, with `--timeout` |
| `pi install <source> [-l]`, `remove`, `list`, `update`   | Installs packages and edits the settings that declare them                                                |
| `pi config`                                              | Toggles package resources. TUI only                                                                       |
| `pi --list-models [search]`                              | Lists models, but only authenticated ones: with no credential it prints "No models available"             |

The dashboard writes the same files these commands write, but it does not call them:
a server that spawns the CLI would duplicate argument parsing and lose structured
errors.

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

## Upgrading pi

pi is pinned exactly (`@earendil-works/pi-coding-agent`), because Epsilon reads its session
files directly and embeds its runtime. An upgrade is one commit, never a version range.

### Procedure

1. **Read pi's changelog** between the pinned version and the new one. List anything
   touching sessions, extensions, settings, MCP, auth, the SDK surface or the RPC mode.
2. **Run the session index's conformance test** (the test named "agrees with
   SessionManager.listAll, field by field"). It builds the index from fixtures and
   compares every field with `SessionManager.listAll`, which is the oracle. A mismatch
   means pi changed a rule the index copies.
3. **Confirm the index rebuild.** `meta` carries `schema_version`, `pi_version` and
   `format_version`; a version change drops and rebuilds the tables. Start Epsilon on a
   copy of a real home and check the list appears.
4. **Re-verify the facts Epsilon relies on**, each in [Traps](#traps) with the pi file
   and line it was read from: the `agent_settled` prompt deferral, the `settings.json`
   lock options, the `appendMessage` key order, the bash update snapshot bound, that pi
   locks no session file, which readers resolve `getAgentDir()` themselves, and that
   the SDK path leaves stdout unguarded. Grep the pinned package, not the docs.
5. **Update this file** in the same commit. A trap that moved is a trap a future reader
   will trust.
6. **Run the engine test** (`test/engine.test.ts`). It starts a real engine on a scratch
   home with the stub model and a fake extension, so a moved `message_end` or
   `bindExtensions` contract fails before a chat does.
7. **Run everything:** `bun run check`, `bun run test:e2e`, `bun run bench`.
8. **Refuse the upgrade** if the conformance test or an e2e flow fails for a reason you
   do not understand. Staying pinned is a supported state; a silently lossy index is not.
