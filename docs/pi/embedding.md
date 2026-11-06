# pi's surface: SDK and CLI

Reference for what pi exposes to an embedding host and what it does not. Everything
here was read from pi's shipped types and code, not from documentation prose.
Epsilon embeds pi's engine through this SDK (decision 003, "One engine
process per live chat") and configures it through the same exports plus pi's documented
files (decision 001, "Web interface for pi, keeping pi's concepts").

This file describes pi. Where Epsilon applies a fact, it says what Epsilon does, never
which file does it: file paths go stale when code moves, and the code's own comments
carry them. How to re-verify all of it on a pi upgrade is the last section,
[Upgrading pi](upgrading.md).

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
- `bindExtensions()` resolves only after every `session_start` handler has settled,
  because pi awaits each handler (`dist/core/extensions/runner.js`, `emit`). A handler
  that calls `ctx.ui.confirm` therefore holds the bind open until the question is
  answered, so a host must report the session ready and take a tab **before** the bind
  resolves, and hold commands until it does. Epsilon gates commands on that binding
  rather than on `ready`.
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
    members (27 methods and `theme`), Epsilon answers the dialog group, the display and
    composer groups, the autocomplete chain and `theme`. It answers the clear calls
    (`setFooter(undefined)`, `setHeader(undefined)`, `setEditorComponent(undefined)`) as
    no-ops, records a custom editor, footer or header, raw terminal input, a custom
    dialog, a component widget and a working indicator in Settings → Diagnostics, and
    answers `getEditorComponent` with `undefined`. The theme trio answers with an empty or
    failing result by design.
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
