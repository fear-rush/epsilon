# Browser protocol

Status: **partly implemented.** This is the contract between `server/` and
`client/`. Both sides implement it; neither invents frames.

On the wire today (S2): `hello`, `welcome`, `attach`, `detach`, `rpc`, `dialog`
and `dialog-closed`, `ui`, `ping`/`pong`, plus `snapshot`, `event`, `rpc-result`,
`meta` and `error`. Not yet: every `terminal` frame, `commands` and `stats` inside
a snapshot, the coalescing and backpressure rules, the heartbeat and the restart
action. Those belong to S3, S7 and S8 in [plan.md](plan.md).

The REST API is separate. Use REST for reading the disk (sessions, files, git,
resources, ui-state) and this socket for everything agent-shaped.

## Transport

- One WebSocket per browser tab, same origin, loopback only.
- No binary frames. Every frame is a JSON object with a `t` discriminator.
- Per-session ordering is FIFO. Frames for different sessions may interleave.
- The client may have several sessions attached at once; the server fans out.

## Versioning

`PROTOCOL_VERSION` is an integer in `shared/src/protocol/version.ts`.

1. Client connects and sends `hello`.
2. Server replies `welcome` or `error { code: "PROTOCOL_MISMATCH" }`.
3. On mismatch the client reloads the page instead of reconnecting.

Version the socket, not the REST paths. A stale tab or an installed PWA can
outlive a server upgrade; REST requests cannot, because the bundle is served by
the same server.

## Client to server

```ts
type ClientFrame =
	| { t: "hello"; protocol: number; tabId: string }
	| { t: "attach"; sessionId: string }
	| { t: "detach"; sessionId: string }
	| { t: "rpc"; sessionId: string; command: RpcCommand } // pi's union, verbatim
	| { t: "dialog"; sessionId: string; answer: ExtensionUiResponse }
	| { t: "terminal"; terminalId: string; input: string }
	| { t: "terminal-resize"; terminalId: string; cols: number; rows: number }
	| { t: "terminal-close"; terminalId: string }
	| { t: "ping" };
```

`RpcCommand` is pi's own type, re-exported type-only from `shared/src/pi.ts`. Do
not define a parallel command vocabulary.

## Server to client

```ts
type ServerFrame =
	| { t: "welcome"; protocol: number; serverVersion: string }
	| { t: "snapshot"; sessionId: string; snapshot: Snapshot }
	| { t: "event"; sessionId: string; event: JsonAgentSessionEvent }
	| { t: "dialog"; sessionId: string; request: ExtensionUiRequest }
	| { t: "dialog-closed"; sessionId: string; id: string }
	| { t: "ui"; sessionId: string; request: ExtensionDisplay }
	| { t: "rpc-result"; sessionId: string; id?: string; ok: boolean; error?: string }
	| { t: "meta"; sessionId: string; running: boolean; needsInput: boolean; title?: string }
	| { t: "terminal"; terminalId: string; output: string }
	| { t: "terminal-exit"; terminalId: string; code: number | null }
	| { t: "error"; code: ProtocolErrorCode; message: string; sessionId?: string }
	| { t: "pong" };
```

Every frame that concerns a session carries its `sessionId`. There is no ambient
"current session" on the socket.

## Snapshot

A snapshot is sent once per `attach`, and again after any client-initiated
resync. It is built from RPC reads, never from server memory:

```ts
type Snapshot = {
	state: RpcSessionState; // get_state
	messages: AgentMessage[]; // get_messages (the model-facing branch)
	commands: RpcSlashCommand[]; // get_commands
	stats?: SessionStats; // get_session_stats
	pendingDialogs: ExtensionUiRequest[]; // replayed from server memory, see below
	running: boolean;
	needsInput: boolean;
};
```

`get_entries` / `get_tree` are used only for full-history and tree views, not for
the snapshot.

The client reducer must be able to **replace** its state from a snapshot at any
moment. That is what makes reconnect, tab duplication and server restart
survivable.

## Dialogs

- The server keeps unanswered `extension_ui_request`s per session in memory,
  with their deadlines. RPC does not replay them.
- A late-attaching client receives the unanswered ones in `pendingDialogs`, so a
  dialog that blocks the agent is never invisible.
- Answers are `{ type: "extension_ui_response", … }`, one per request id.
- `abort` cancels outstanding dialogs: the server answers them as `cancelled`.
- A dialog answered by a tab that then closes must not be answered again by a
  second tab; the first answer wins and the entry leaves `pendingDialogs`.
- `dialog-closed` tells every attached tab which request left the pending set, so
  a second tab removes it without guessing from `meta`.
- `needsInput` is exactly `pendingDialogs.length > 0`.
- Only `select`, `confirm`, `input` and `editor` wait for an answer and travel as
  `dialog`. The other five display something and travel as `ui`; counting them as
  pending would leave `needsInput` stuck true from the first millisecond.
- `setStatus` and `setWidget` are keyed state: a value replaces the previous one
  for the same key, an undefined value clears it, and the server replays what is
  still set to every late-attaching tab. `notify`, `setTitle` and
  `set_editor_text` are one-off events and are not replayed.
- `set_editor_text` has no composer to write into yet, so the client shows a
  notice instead of silently discarding it.

## Ordering, coalescing, backpressure

A phone that stops reading must not grow the server's memory.

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

## Restart semantics

"Restart agent" means: kill this session's child, then spawn a new one on the
next `attach` or `rpc`. It is allowed only when the session is idle; otherwise
`rpc-result { ok: false, error: "AGENT_BUSY" }`.

It is the only way to pick up newly installed packages, skills or MCP servers,
because pi's interactive `/reload` is not an RPC command (see
[reference/pi-rpc.md](reference/pi-rpc.md)).

## Error frames

| Code                 | Meaning                                                      |
| -------------------- | ------------------------------------------------------------ |
| `PROTOCOL_MISMATCH`  | Client and server speak different protocol versions. Reload. |
| `SESSION_NOT_FOUND`  | No such session file.                                        |
| `AGENT_BUSY`         | Command rejected while a run is in flight.                   |
| `AGENT_START_FAILED` | The child failed to start; message carries pi's stderr tail. |
| `CHILD_EXITED`       | The child died mid-command.                                  |
| `UNSUPPORTED_FRAME`  | Frame the server does not implement at this version.         |

Errors are never silent. A frame the server does not understand produces
`UNSUPPORTED_FRAME` and leaves the connection open.

## Non-goals

- No bidirectional multiplexing across machines. One server, one machine.
- No authentication frames. Access control is loopback plus the tunnel in front.
- No binary attachments over the socket. Files go over REST; images arrive as
  `ImageContent` inside RPC prompts.
- No replay log. Snapshots replace state; history is read from pi's files.
