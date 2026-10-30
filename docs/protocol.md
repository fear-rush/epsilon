# Browser protocol

Status: **protocol 6 implemented.** This is the contract between `server/` and
`client/`. Both sides implement it; neither invents frames.

On the wire today: `hello`, `welcome`, `attach`, `detach`, `command`,
`command-result`, `dialog`, `dialog-closed`, `ui`, `ping`/`pong`, `snapshot`,
`event` and `error`. The `terminal*` frames are declared and unimplemented (S7).
The coalescing, backpressure and heartbeat rules below are targets, not code.

The REST API is separate. Use REST for reading the disk (sessions and readiness,
and later files and resources) and this socket for everything agent-shaped.

The zod schemas in `shared/src/protocol/frames.ts` and `shared/src/extui.ts` are
the source of truth for every shape. This document says which frames exist and
what they mean; it does not restate their fields.

## Transport

- One WebSocket per browser tab, same origin, loopback only.
- No binary frames. Every frame is a JSON object with a `t` discriminator.
- Per-session ordering is FIFO. Frames for different sessions may interleave.
- The client may have several sessions attached at once; the server fans out.

## Versioning

`PROTOCOL_VERSION` is an integer in `shared/src/protocol/version.ts`.

1. Client connects and sends `hello`.
2. Server replies `welcome` or `error { code: "PROTOCOL_MISMATCH" }`.
3. On mismatch the server answers with `error { code: "PROTOCOL_MISMATCH" }`. The
   session page shows a version-mismatch notice with a Reload button and stops
   attaching; guessing at a changed frame is worse than a stale page.

Version history: 1 was the S2 transcript; 2 added `models` to the snapshot for
the model picker; 3 added `commands` to the snapshot for the `/` palette; 4
replaced pi's command vocabulary with Epsilon's own commands and zod shapes when
the engine moved in-process ([ADR-0009](adr/0009-socket-speaks-epsilon.md)); 5
made a dialog answer name the method it belongs to, dropped the `meta` frame and
`serverVersion` because nothing read them, and made the snapshot a checked shape;
6 added the thinking level and its available levels to the snapshot and the
`set_thinking_level` command.

Version the socket, not the REST paths. A stale tab or an installed PWA can
outlive a server upgrade; REST requests follow the bundle, because the deployment
serves the client and the API from one listener ([deploy.md](deploy.md)). A dev
run has two processes and two ports, which is a dev-only detail.

## Client to server

```ts
type ClientFrame =
	| { t: "hello"; protocol: number; tabId: string }
	| { t: "attach"; sessionId: string }
	| { t: "detach"; sessionId: string }
	| { t: "command"; sessionId: string; command: Command }
	| { t: "dialog"; sessionId: string; answer: DialogAnswer }
	| { t: "terminal"; terminalId: string; input: string }
	| { t: "terminal-resize"; terminalId: string; cols: number; rows: number }
	| { t: "terminal-close"; terminalId: string }
	| { t: "ping" };
```

`Command` is Epsilon's union, defined in `shared/src/protocol/frames.ts`:

| Command                                         | Engine call                                  | Result refreshed by |
| ----------------------------------------------- | -------------------------------------------- | ------------------- |
| `{ type: "prompt"; text }`                      | `session.prompt(text)`                       | events              |
| `{ type: "steer"; text }`                       | `session.steer(text)`                        | events              |
| `{ type: "abort" }`                             | `session.abort()`, pending dialogs cancelled | events              |
| `{ type: "bash"; command; excludeFromContext }` | `session.executeBash(...)`                   | snapshot            |
| `{ type: "set_model"; provider; modelId }`      | `session.setModel(model)`                    | snapshot            |
| `{ type: "set_thinking_level"; level }`         | `session.setThinkingLevel(level)`            | snapshot, event     |
| `{ type: "reload" }`                            | `session.reload()`                           | snapshot            |

A command attaches the tab to its session first. It carries no id: the answer is
`command-result` for that command name, and the engine owns ordering.

`prompt` also dispatches extension commands, prompt templates and skills, which is
how `/permission ask` and a picked palette entry work. `/reload` is the one
exception: the composer intercepts it and sends the `reload` command, because it
is Epsilon's addition, not a pi slash command.

## Server to client

```ts
type ServerFrame =
	| { t: "welcome"; protocol: number }
	| { t: "snapshot"; sessionId: string; snapshot: Snapshot }
	| { t: "event"; sessionId: string; event: JsonAgentSessionEvent }
	| { t: "dialog"; sessionId: string; request: DialogQuestion }
	| { t: "dialog-closed"; sessionId: string; id: string }
	| { t: "ui"; sessionId: string; request: ExtensionDisplay }
	| { t: "command-result"; sessionId: string; command: CommandName; ok: boolean; error?: string }
	| { t: "terminal"; terminalId: string; output: string }
	| { t: "terminal-exit"; terminalId: string; code: number | null }
	| { t: "error"; code: ProtocolErrorCode; message: string; sessionId?: string }
	| { t: "pong" };
```

Every frame that concerns a session carries its `sessionId`. There is no ambient
"current session" on the socket. There is no `meta` frame: the sidebar reads
`needsInput` from the REST session list, which already polls the live engines.

`event` carries pi's `JsonAgentSessionEvent`, the one shape that stays pi's
([ADR-0009](adr/0009-socket-speaks-epsilon.md)). It is what
`shared/src/conversation/reduce.ts` consumes, and the engine narrows live events with
the transform it carries (`docs/notes/2026-10-28-tojson-is-not-exported.md`).

The schema checks what this page dereferences, not pi's whole event: the frame
must be an object with a string `type`, and a snapshot message must carry a known
`role`. pi's payload behind that stays pi's type, and the reducer parses the
content it draws with its own schemas. A frame that fails this check is reported
once per connection, not dropped in silence.

## Snapshot

A snapshot is sent once per `attach`, and again after `bash`, `set_model`,
`set_thinking_level`, `reload` or a session rename. It is built synchronously from
the live engine, not from a request/reply:

```ts
type Snapshot = {
	state: {
		model?: { provider; id; name };
		isStreaming: boolean;
		isCompacting: boolean;
		sessionName?: string;
		// pi's current level and what this model supports. A model without
		// reasoning reports `["off"]`.
		thinkingLevel: ThinkingLevel;
		availableThinkingLevels: ThinkingLevel[];
	};
	messages: SnapshotMessage[]; // session.messages, system entries filtered out
	models: { provider; id; name }[];
	commands: { name; description?; source: "extension" | "prompt" | "skill" }[];
};
```

`commands` feeds the `/` palette and holds only what `prompt` can expand:
extension commands, prompt templates and skills. pi's interactive built-ins such
as `/model` and `/settings` are not in it, because they never reach an engine.
Resources and their paths join the snapshot with the resources page (S8). Dialogs
travel in their own frames.

`ThinkingLevel` is pi's union `off`, `minimal`, `low`, `medium`, `high`, `xhigh`,
`max`. The snapshot is authoritative; `thinking_level_changed` also arrives as an
event so a label does not wait for the next snapshot.

The client reducer must be able to **replace** its state from a snapshot at any
moment. That is what makes reconnect, tab duplication and server restart
survivable.

## Dialogs

The engine's `ExtensionUIContext` blocks a tool call until a dialog is answered.
`agent/dialogs.ts` owns the pending set.

- `select`, `confirm`, `input` and `editor` wait for an answer and travel as
  `dialog`. An answer names the method it belongs to: `{ id, method: "select" |
  "input" | "editor", value }`, `{ id, method: "confirm", confirmed }`, or
  `{ id, method: "cancel" }`. An answer whose method does not match the pending
  question is refused with `UNSUPPORTED_FRAME`, so a stale tab cannot answer a
  confirm with a select value.
- a dialog's `timeout`, when the extension passes one, answers it as cancelled.
  The pending entry is dropped and `dialog-closed` is sent.
- `abort` answers every pending dialog as cancelled before it aborts the run, so
  nothing waits forever on a run that no longer exists.
- a late-attaching client receives the unanswered dialogs immediately after its
  snapshot, so a blocking dialog is never invisible. A reload lands inside the idle
  grace, so it reattaches to the same engine and gets the dialog back.
- the first answer wins. A second tab answering the same id is stale: its answer
  is ignored, no frame is sent, and the `dialog-closed` already on its way
  removes the dialog.
- `dialog-closed` tells every attached tab which request left the pending set.
- the session list marks `needsInput` while a session has a pending dialog.
- `setStatus` and `setWidget` are keyed state: a value replaces the previous one
  for the same key, an undefined value clears it, and the server replays what is
  still set to every late-attaching tab. `notify`, `setTitle` and
  `set_editor_text` are one-off events and are not replayed.
- `set_editor_text` has no composer to write into yet, so the client shows a
  notice instead of silently discarding it.
- extension UI methods with no browser equivalent (`custom`, `setFooter`,
  `setHeader`, `onTerminalInput`, `theme`, working-indicator methods, editor and
  autocomplete overrides) produce one warning naming the methods and the terminal
  tab. Methods used at session start are collected and named in one notice.

## Ordering, coalescing, backpressure

Targets, not code yet. A phone that stops reading must not grow the server's
memory.

- `message_update` events carrying a `*_delta` and `tool_execution_update` events
  are **droppable**: a later event supersedes them.
- `*_start` and `*_end` events are never dropped. The reducer builds and closes
  blocks from them.
- `tool_execution_update` carries the tool's whole partial result, so coalesce to
  the latest per `toolCallId` on a ~150 ms timer.
- Above a high-water mark (~512 KiB queued), drop only droppable events.
- Above a hard limit (~16 MiB queued), terminate the socket. The client
  reconnects and receives a fresh snapshot.
- Send a heartbeat every ~25 s; a client that misses two reconnects.

## Reconnect

1. Reconnect with backoff.
2. Send `hello`, then `attach` for every session the tab had open.
3. Receive a snapshot per session and replace state.

Nothing is replayed from the client's side. If a client wants to survive a
reconnect without losing scroll position, that is local UI state, not protocol.

## Readiness

Not part of this contract: readiness is REST, at `GET /api/readiness`, because it
answers before any session exists. It reports whether the home holds a usable model,
the home path, and the step that fixes a home without one. The page turns that into
one notice and renders no composer
([ADR-0012](adr/0012-configure-in-the-dashboard.md)).

The dashboard does not acquire configuration over the socket: no sign-in frames, no
credential frames, no settings frames.

## Reload and restart semantics

`/reload` sends the `reload` command: the engine re-reads extensions, skills,
packages and MCP config in place, and the transcript is untouched.

There is no restart action in the page. Ten seconds after its last tab detaches, an
engine that is not running, compacting or waiting on a dialog is disposed, and the
next attach rebuilds it from scratch. A run or a pending dialog keeps it alive, so a
reload or a reopen reattaches to the same engine. Deleting a session file is refused
while an engine holds it (`SESSION_RUNNING`).

## Error frames

| Code                 | Meaning                                                          |
| -------------------- | ---------------------------------------------------------------- |
| `PROTOCOL_MISMATCH`  | Client and server speak different protocol versions. Reload.     |
| `SESSION_NOT_FOUND`  | No live engine for a dialog answer.                              |
| `AGENT_START_FAILED` | The engine could not be created; the message carries pi's error. |
| `AGENT_FAILED`       | A prompt, extension or event failed after the engine started.    |
| `EXTENSION_ERROR`    | An extension handler threw; `onError` reported it once.          |
| `HOST_NOT_ALLOWED`   | Reserved: the request's Host or Origin is not this server (S11). |
| `UNSUPPORTED_FRAME`  | Frame the server does not implement at this version.             |

Errors are never silent. A frame the server does not understand produces
`UNSUPPORTED_FRAME` and leaves the connection open. A refused command produces
`command-result { ok: false }`, which the reducer shows as a notice naming the
command.

## Non-goals

- No bidirectional multiplexing across machines. One deployment, one agent home.
- No authentication frames. Access control is a loopback publish plus the tunnel in
  front. The Host and Origin check is not authentication; it stops a page that is
  not this app from driving the API.
- No credential upload, no configuration import, no code upload over any route
  ([ADR-0012](adr/0012-configure-in-the-dashboard.md)).
- No attachments over the socket yet. Files go over REST when S6 lands; there is
  no image prompt path.
- No replay log. Snapshots replace state; history is read from pi's files.
