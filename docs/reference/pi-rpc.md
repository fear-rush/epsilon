# pi's RPC surface

Reference for what `pi --mode rpc` can and cannot do. Everything here was read
from pi's shipped types and code, not from documentation prose.

**Re-verify after every pi upgrade.** The sources of truth. Paths are relative to
the pinned package, `server/node_modules/@earendil-works/pi-coding-agent`, which
is the copy epsilon spawns. `pi` on `PATH` may be a different version, so grep
the pinned package, not the installed CLI.

| Fact                        | File                                                                     |
| --------------------------- | ------------------------------------------------------------------------ |
| Command and response shapes | `dist/modes/rpc/rpc-types.d.ts`                                          |
| Which commands exist        | `dist/modes/rpc/rpc-mode.js` (the `handleCommand` switch)                |
| Wire events                 | `dist/modes/json-event.d.ts`, `pi-agent-core`'s `dist/types.d.ts`        |
| Typed client                | `dist/modes/rpc/rpc-client.d.ts`                                         |
| Interactive-only commands   | `dist/modes/interactive/interactive-mode.js` (the editor submit handler) |

Verified against 1.4.0.

Quick re-verification, from `server/`:

```sh
P=node_modules/@earendil-works/pi-coding-agent
grep -o 'case "[a-z_]*":' $P/dist/modes/rpc/rpc-mode.js | sort -u
node -e "const s=require('fs').readFileSync('$P/dist/modes/rpc/rpc-types.d.ts','utf8');console.log([...new Set([...s.matchAll(/method:\\s*\"([a-zA-Z_]+)\"/g)].map(m=>m[1]))].sort().join(' '))"
```

## Commands (33, from the RPC switch)

| Area                 | Commands                                                                                                                          |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Prompting            | `prompt`, `steer`, `follow_up`, `abort`, `clear_queue`                                                                            |
| Sessions             | `new_session`, `switch_session`, `fork`, `clone`, `get_fork_messages`, `set_session_name`                                         |
| Reading state        | `get_state`, `get_messages`, `get_entries`, `get_tree`, `get_last_assistant_text`, `get_session_stats`, `get_commands`            |
| Models and reasoning | `set_model`, `cycle_model`, `get_available_models`, `set_thinking_level`, `cycle_thinking_level`, `get_available_thinking_levels` |
| Queue behaviour      | `set_steering_mode`, `set_follow_up_mode`                                                                                         |
| Compaction and retry | `compact`, `set_auto_compaction`, `set_auto_retry`, `abort_retry`                                                                 |
| Shell                | `bash`, `abort_bash`                                                                                                              |
| Export               | `export_html`                                                                                                                     |

`prompt` returns a disposition (`handled` means no run started, so do not wait
for an end event). `steer` and `follow_up` return a queue disposition. Every
command takes an optional `id`; responses echo it, which is how you correlate.

The envelope is flat, not a `method` field: a command is `{ id?, type: "get_state" }`
and a reply is `{ id?, type: "response", command, success, data? }`.

## Extension UI methods (9)

`select`, `confirm`, `input`, `editor`, `notify`, `setStatus`, `setWidget`,
`setTitle`, `set_editor_text`.

Requests arrive as `{ type: "extension_ui_request", id, method, ... }`. Answers
go back as `{ type: "extension_ui_response", id, value }`,
`{ id, confirmed }`, or `{ id, cancelled: true }`. `select`, `confirm` and `input`
carry an optional `timeout`.

Both directions are their own unions, outside the command and event types:
incoming is `RpcExtensionUIRequest`, outgoing is `RpcExtensionUIResponse`.
`RpcCommand` does not contain an `extension_ui_response` member, and
`JsonAgentSessionEvent` does not contain an `extension_ui_request` member.

The channel is live before the first prompt: a child sends `setStatus` and
`setWidget` within milliseconds of start, and sends them again on teardown. A
tool call then blocks until something answers its `confirm`, with no error and no
timeout of pi's own. See
[../notes/2026-10-28-rpc-permission-block.md](../notes/2026-10-28-rpc-permission-block.md).

There is **no `custom` method**. See ADR-0002.

## Events

Three unions share stdout, and pi does not combine them into one type:
`JsonAgentSessionEvent`, `RpcResponse` (the answer to a command, correlated by
`id`) and `RpcExtensionUIRequest`. A reader of the child must expect all three.

`JsonAgentSessionEvent` is deliberately not the same as the in-process event:
`toJsonEvent()` strips cumulative assistant snapshots. `message_start` gives the
initial message, deltas build on it, and `message_end` gives the authoritative
message. Do not assume `message_update` carries a full message.

Events observed in pi's own handler:

Run lifecycle: `agent_start`, `turn_start`, `turn_end`, `agent_end`, `agent_settled`

Messages: `message_start`, `message_update`, `message_end`, `entry_appended`

Tools: `tool_execution_start`, `tool_execution_update`, `tool_execution_end`

Compaction and retries: `compaction_start`, `compaction_end`, `auto_retry_start`,
`auto_retry_end`, `summarization_retry_scheduled`,
`summarization_retry_attempt_start`, `summarization_retry_finished`

Session and queue: `queue_update`, `session_info_changed`,
`thinking_level_changed`, `bash_execution_update`

Plus `extension_ui_request` from RPC mode and `session_shutdown` on teardown.
Note that `extension_ui_request` is not a member of the event union; see above.
Confirmed on a real trace: `shared/src/conversation/fixtures/bash-turn.jsonl`.

`bash_execution_update` exists in the union but pi's own UI ignores it.

## Slash commands through `prompt`

`AgentSession.prompt()` expands `/…` through the extension runner and through
prompt templates. So a `/name` sent as a prompt reaches extension commands,
prompt templates and skills. `get_commands` reports that set with
`source: "extension" | "prompt" | "skill"`.

CLI **built-ins** are different: pi's interactive mode intercepts them before
any session call, so they never reach RPC.

| Interactive-only                                                                                        | RPC equivalent                                                                     |
| ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `/model`                                                                                                | `set_model`, `get_available_models`                                                |
| `/thinking`                                                                                             | `set_thinking_level`, `get_available_thinking_levels`                              |
| `/export`                                                                                               | `export_html`                                                                      |
| `/copy`                                                                                                 | `get_last_assistant_text`                                                          |
| `/name`                                                                                                 | `set_session_name`                                                                 |
| `/session`                                                                                              | `get_session_stats`                                                                |
| `/fork`                                                                                                 | `fork`                                                                             |
| `/clone`                                                                                                | `clone`                                                                            |
| `/new`                                                                                                  | `new_session`                                                                      |
| `/resume`                                                                                               | `switch_session`                                                                   |
| `/compact`                                                                                              | `compact`                                                                          |
| `!cmd` / `!!cmd`                                                                                        | `bash` (`excludeFromContext`)                                                      |
| `/reload`                                                                                               | **none.** Restart the child.                                                       |
| `/tree`                                                                                                 | **none.** `AgentSession.navigateTree` has no RPC command; `get_tree` is read-only. |
| `/trust`                                                                                                | **none.** Terminal tab.                                                            |
| `/login`, `/logout`                                                                                     | **none.** Terminal tab.                                                            |
| `/settings`, `/scoped-models`, `/import`, `/share`, `/bug`, `/changelog`, `/hotkeys`, `/debug`, `/quit` | **none.** Terminal tab.                                                            |

## Skills, MCP, packages

- Skills load from `~/.pi/agent/skills` and `<cwd>/.pi/skills`, plus skills inside
  installed packages. They appear in `get_commands`.
- Packages are declared in `~/.pi/agent/settings.json` (or `.pi/settings.json`
  with `pi install --local`) and are installed with `pi install npm:@scope/pkg`,
  `pi install git:host/repo`, `pi install ./path`. Project declarations load only
  after project trust.
- MCP servers come from the global `mcp.json` and a project's `.pi/mcp.json`,
  also gated by project trust.
- All three are read at child start. After installing anything, restart the child
  (idle-gated). There is no RPC reload.
