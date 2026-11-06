# pi reference: Files

## Session files the index reads

The session index reads pi's v3 JSONL directly, so these are the fields it depends on.
The index's conformance test pins each one to `SessionManager.listAll`; a pi upgrade that
changes one fails there first.

pi stores no project record. A session header's `cwd` is the only project-like value:
`SessionManager.list(cwd)` filters one encoded session folder, `listAll()` returns every
session flat and newest first, and the TUI's resume picker offers "current folder" and
"all", printing each all-view row's cwd without grouping. Epsilon's project grouping is a
view over that field, not a second store.

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
