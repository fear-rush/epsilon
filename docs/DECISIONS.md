# Decisions

The architecture decisions that hold today. Each has the reason and the option that was
rejected, so the rejected option is not proposed again. Code cites a decision by its
heading.

## Embedded engine

The server runs pi's engine in its own process through the SDK: one
`AgentSessionRuntime` per open chat, created with the working directory and the agent
home. Epsilon does not spawn `pi`, does not use pi's RPC mode and does not speak its
envelope.

Why: Epsilon ships its own default extensions, and the SDK is the only surface that can
load inline extensions, arbitrate names (`replaceable`), reload resources, navigate
the session tree and replace the session it holds. A runtime is what pi gives a host
that needs a replacement: `newSession`, `switchSession` and `fork` are the controls an
extension command context drives, and only the runtime's `dispose()` emits
`session_shutdown`, so a chat that closes releases its MCP transports. An idle engine
is disposed and recreated on the next attach.

Cost accepted: an engine or extension bug takes every live session down with the server
(session files survive), and all sessions share one heap. A session id can change under
a tab, because a replacement is a new session: the registry keeps every id a chat has
held, and the page follows the one it has now.

Not: an RPC child process (no inline extensions, no arbitration, no reload). A worker
thread (the engine's services and MCP clients do not cross the boundary without
rewriting a frontend). Two engines side by side (two vocabularies in one UI). A bare
`AgentSession` with no runtime around it (its `dispose()` skips `session_shutdown`, so
every extension cleanup registered on that event is skipped too). A second
MCP client from `@earendil-works/pi-mcp`, which is importable on its own: it would open
a second connection, and a second stdio process, for every server, without the MCP
extension's config resolution, exposure, OAuth or permission hooks.

## Extension shutdown

`ctx.shutdown()` ends the chat that called it, not the server. The engine is closed
(runtime teardown, so extensions see `session_shutdown` with reason `quit`), the calling
tab is told in a notice, and every other chat keeps working. The transcript stays
readable and the next message reopens the session from its file.

Why: pi hands the host a request to shut down and says nothing about its scope. In a
terminal that request ends the process, which here would take every other chat with it.

Cost accepted: the notice cannot name the extension, because pi's `shutdownHandler`
receives no extension identity. It says an extension asked.

Not: exiting the server. Ignoring the call, which is what an unbound handler does:
the extension's own cleanup would then never run.

## Built-in commands

pi's 24 built-in slash commands are the TUI's editor, not the SDK: `prompt()`
dispatches extension commands, templates and skills, and nothing else. A name pi has
is therefore Epsilon's to answer, and `shared/src/conversation/commands.ts` is the one
table both sides read. Each row names who serves it:

- `surface: "pi"`: the host calls pi's own session operation on the runtime
  (`compact`, `name`, `new`, `import`, `reload`), from the prompt path, before the text
  can reach the model.
- `surface: "epsilon"`: the browser owns the surface, because a route, a dialog, the
  clipboard or a download is the only place the command can act.

A row with a `refusal` has no web surface in this build; its sentence names the
capability and where it lives, and it is shown instead. A name the table does not hold
stays a prompt, which is how an extension command, a template and a `/skill:` entry
still reach pi. A builtin wins over an extension command of the same name, the way
pi's editor does, and the shadowed command is named in a notice rather than dropped.

Why: sending `/compact` to the model is worse than refusing it. pi's names are a closed
list in the pinned package, so one table is cheap and both sides can check it.

Not: teaching `prompt()` the names (not an SDK capability), or a second list in the
server (the two would drift, and the browser decides which surface a name has).

## Socket vocabulary

The browser socket carries Epsilon's own commands and zod shapes, defined in `shared/`.
Commands are the ones the page can send: a prompt, the queue behavior it joins a
running turn with and the images it carries, the aborts (turn, retry, compaction,
bash), bash itself, the model, thinking-level, coding-tool and thinking-visibility
switches, manual compaction, the auto-compaction and auto-retry toggles, the queue
clear, the move to an earlier message of the branch, and reload. `commandNameSchema` in
`shared/src/protocol/frames.ts` is the list. Each is answered by `command-result`
naming the command, and that frame also carries the prompts pi handed back when a
command took them (`queue`). A frame change bumps `PROTOCOL_VERSION`, and a tab built
for another version reloads.

Why: with no RPC envelope under it, pi's RPC types would be a translation layer, and a
change to pi's private types would become a change to Epsilon's public contract.
`/reload` is a socket command, never a slash command the model sees.

The `notice` frame carries what no command result can: `external-change` is the file
written by another process, `command` is a sentence a built-in command answered with
instead of acting, `extension` is something only pi's terminal UI can draw (a custom
entry with an extension's own renderer), and `settings` is a settings file pi could
not load and ignored. Only the first offers a reload.

Not: keeping pi's RPC types for compatibility (nothing speaks them). Request/response
frames for reads (the engine exposes state synchronously, so a snapshot needs no round
trip). Deep-importing pi's JSON event transform (blocked by the package `exports` map;
the engine carries a small copy and names its source).

## Run outcomes in the transcript

The transcript reports what pi reported, not a simplified view of it:

- A reply's blocks keep pi's `contentIndex` order, live and after a reload, so an
  interleaved thinking block stays between the text it was written between.
- A run is busy until `agent_settled`, not `agent_end`: pi still flushes queued bash
  and custom messages after the latter, and a tool row left at `running` when the run
  settles becomes an error with pi's reason.
- A compaction says which of its three outcomes happened, from `compaction_end`
  alone: how many tokens it replaced and what the summary billed, that it was
  cancelled, or pi's own `errorMessage`. Retries name the attempt, the limit, the
  delay and pi's reason.
- A nested tool call is drawn inside the tool that made it, from the live
  `parentToolCallId` events and, after a reload, pi's `nestedCalls` record on the
  parent's result.
- An extension's entry is drawn exactly where pi draws one: a `custom_message` with
  `display`, or a `custom` entry whose `customType` has a registered entry renderer.
  The second has no web component yet, so it gets a sentence saying so rather than a
  row that would misrepresent pi.
- A notice is anchored to how many messages the transcript held when it happened. A
  snapshot that holds less (a compaction replaced history with a summary) moves it to
  the rebuild point instead of letting it resurface later mid-conversation.
- An abort or a Clear hands pi's queue back, so text the user typed during the run is
  editable again instead of lost.

Why: a user acts on these lines. "Compaction finished" for a failed compaction, or a
cancelled turn that looks like an idle chat, is worse than no line at all.

Not: replaying pi's terminal components (they draw in a terminal and are not part of
the socket contract). A second transcript model (pi's messages and entries are the
only source).

## UI contract

Epsilon renders the extension UI methods that are data (`select`, `confirm`, `input`,
`editor`, `notify`, `setStatus`, `setWidget` as text, `setTitle`, `setEditorText`,
`pasteToEditor`, `getEditorText`, the working and thinking labels, the tool expansion,
`addAutocompleteProvider` and `theme`), through `ExtensionUIContext`. A method that needs pi's terminal UI (`custom`,
footer and header components, terminal input, the indicator's own animation frames)
answers with a visible notice naming it, once. Silence is never an answer. A dialog's timeout and the extension's abort signal are enforced by the
engine: the tab receives the time the question has left and counts down, and either
ending closes the dialog there, so nothing waits for a click that will not come.

`ctx.ui.theme` answers with a value whose colour methods return their text unchanged.
pi does not export the theme it uses itself, and an extension reads `theme` without
asking, so dropping the escapes keeps the line it was drawing while refusing the call
would lose it. `notify` keeps the severity pi sent, and a missing one reads as `info`,
so an extension error is not drawn like a status line.

The composer is the editor: it reports its draft to the engine, debounced, so
`getEditorText` answers what was typed. `setEditorText` replaces the draft and
`pasteToEditor` appends to it, applied once by the composer that is on screen.

Every keyed status is drawn in a rail above the composer, in the order the keys first
appeared, and clearing one removes its row. The permission key is the exception: the
footer's menu draws it in the browser's words.

An extension's autocomplete providers are asked over the socket, on a debounced draft,
and their items are merged into the same palette as the commands. The answer names the
draft it was for, so a late reply is dropped, and picking one replaces the prefix its
provider matched. The command list stays the browser's, which is why a provider that
delegates to the one before it inherits no commands.

Extension widgets are drawn around the box they name: `aboveEditor` above the composer,
`belowEditor` under it. The working row, the label for hidden thinking and the
session-wide tool expansion follow pi's own settings, and each is replayed to a tab
that attaches late, so a session does not look different in a second tab.

Why: terminal components have no data form, and the set of extensions is open-ended, so
an adapter has no cost ceiling. A theme in a browser has nothing to colour, so the text
is the whole answer.

Not: rendering `pi-tui` components headlessly in the browser (couples the server to pi's
internals and produces terminal-shaped dialogs). A per-extension UI adapter.

## Agent home

Epsilon owns one agent home, at pi's default path (`$HOME/.pi/agent`),
resolved once in `server/src/main.ts` and passed to every engine explicitly. An inherited `PI_*`
variable never decides it. Nothing records the choice. Sessions are grouped
by folder, as pi groups them. Development uses a sandbox home; `dev:host` is the only path to
the operator's real one.

Why: pi's home holds credentials, policy, extensions and sessions that a dev run
should not adopt silently.

Not: a dev loop on the real home. A home at `~/.epsilon/agent` (pi and
`getAgentDir()` would disagree). A config file naming the home (a second truth for a
deterministic value).

## Configure in the dashboard

Settings configures the agent: provider endpoints and their models, the default
model, MCP servers, skills and packages. Writes go through an exported pi writer where
one exists (`SettingsManager`, `DefaultPackageManager`). Otherwise the dashboard parses
the documented file with zod, merges it, keeps unknown keys, writes at mode 0600 under
one in-process queue per path, and refuses a file it cannot parse. `models.json` is
read the way pi reads it, with `//` comments and trailing commas, but a write against
such a file is refused with the line number: the merge would silently drop them. A
provider key goes to the documented `apiKey` field of `models.json` and is never sent
back to the browser.
`defaultTools` has a getter and no setter, so naming a reaching tool there is a merge:
pi's own list semantics decide the entry (a plain name replaces its defaults, `+name`
adds to them), which is why the panel writes `+codemode` into a file with no list and
removes the key instead of writing an empty one, and why it refuses in a project that
sets the list itself. Every settings write reloads the live engines. A pi-shipped provider keeps its catalog
and is edited through `modelOverrides`; importing models is Epsilon's own bounded HTTP
call, disabled where an API family has no shared list shape. The override dialog starts
from pi's effective model and writes only the fields the operator changed, because pi
merges an override field by field: a field written with pi's own value would pin it, and
a written `reasoning: false` would turn thinking off on a model that supports it. An
override never carries an API family or base URL either: pi ignores both there, so the
dialog offers neither and a stored pair stays in the file without affecting a test.
A model's advanced fields (`inputLimits`, `promptCache`, the sampling parameters,
`cost.tiers`) seed from pi's effective model, and a blank control is absent, so a save
never writes a default the operator did not choose. A model entry needs the four cost
rates pi's definition requires; an override may name any subset, and the server merges
a named rate over the stored one. A model's header values stay on
the server like a provider's: the dialog edits the keys and replaces a value only
when one is typed.

The settings page reads every key once rather than per control: pi's effective value,
the layer that supplies it (the project's `.pi/settings.json`, the home's
`settings.json`, or pi's built-in default), and whether only a terminal can apply it.
A key pi reads from the home alone never reports the project as its layer. A value pi
refuses is that key's error on screen; it never fails the page, and the panel does not
present a limit pi would not use. A file pi could not load at all is named once per
engine start and once beside the agent home, and no write is attempted while it is
unreadable, because pi would ignore that write silently.

One setting is one request: the page validates the value against that key's own
schema, then writes it through pi's matching `SettingsManager` setter or merges it
into `settings.json` under a lock that keeps every unknown key and the operator's
key order. Either way the file is flushed and the live engines reload, and a key the
panel does not model is refused. A project's value wins over the home's, so the panel
shows it read-only instead of letting a write appear to do nothing.

Signing in, with an account or with the API-key method a provider declares, is the
dashboard's too, because `ModelRuntime.login()` is a host API: the panel starts the
flow, relays the questions and links pi reports, and cancels it. A provider-scoped
`env` value such as Cloudflare's account id arrives as another prompt, so the same
relay renders it. It never writes `auth.json` itself; a credential changes only
through `login()` and `logout()`. `auth.json` holds one credential per provider and
pi uses it ahead of a key in `models.json` and ahead of the environment, so the panel
names the credential in use and offers sign-out, instead of letting a typed key look
active while an account shadows it. An ambient credential is named by pi's own label,
so an environment variable reads as `ANTHROPIC_API_KEY` rather than "an environment
variable". Deleting a provider entry removes only its
`models.json` entry; a stored credential changes through the sign-out control alone, so
removing a base-URL override from a built-in provider cannot sign the account out. A
provider pi ships needs no endpoint from the panel for that: pi supplies the endpoint,
the API family and the catalog, and the credential supplies the auth, so those fields
are an override there rather than part of adding it. A provider the operator defines
has none of them and needs all of them. An entry that configures nothing (a display
name alone) is refused at save with pi's own sentence, because pi would compose it into
an invalid provider and every auth check would then say so.

MCP sign-in runs from the dashboard, but it is pi's flow, not Epsilon's: the server
page's buttons send `/mcp login`, `/mcp logout` or `/mcp reconnect` as the line a typed
command becomes, into the live chat of that folder, because the connection belongs to
an engine. The result and the sign-in's prompts are that chat's, so the page says which
chat it went to and links there, and says so plainly when no chat is open. The browser
opens on the machine running Epsilon, which here is the operator's machine; a terminal
is still the way in when it is not. TUI-only toggles stay terminal-only. Project trust
is not one of them: it goes through pi's exported `ProjectTrustStore` (Chats and
projects), and the dashboard never writes `trust.json` by hand.

An MCP server also reports what the next session can reach and what a live engine
registered, because a configured server that no tool can call is a state the operator
must see. A server's page lists the tools a live engine registered, each with pi's own
exposure for it, and a switch that writes the `toolExposure` rule pi matches: the
server's own tool name, or a `*` pattern where pi's registered spelling cannot say that
name, since the registered spelling is the only one a host can read. When pi's answer
and the saved rule disagree the page says so instead of showing a switch that did
nothing. The page also names the server's state: off in the file, connected with the
tool count pi registered, waiting for a sign-in, failed with pi's own sentence (those
two come from the notice pi pushes, since its SDK reports no connection state), or no
tool yet, which is what silence leaves. Those are reads: the panel says sign-in stays in the terminal and how a
stored credential is detected, and it never shows the credential.

An MCP server and a skill can also be edited raw. For an MCP server that is its own
entry under `mcpServers` and nothing else; stored env values, header values and the
OAuth client secret are shown as `"<stored>"`, and a `"<stored>"` left in place keeps the
stored value on save. A save that does not parse writes nothing. A skill's raw view is
its folder: `SKILL.md` with its frontmatter, written as typed once the description
passes pi's rule, and every bundled file.

Adding an MCP server can start from a registry: the official MCP registry, and GitHub's
(`api.mcp.github.com`), which is looked up in the official one first. A registry entry has
no command, so the panel derives it from the package type (`npx -y` for npm, `uvx` for
PyPI, `docker run -i --rm` for OCI) or takes the remote's URL and headers, and asks only
for the required and secret values. Legacy SSE and package types pi cannot run are listed
as unsupported with the reason.

Why: the dashboard must be usable without a terminal, and most of the work is editing two
documented files and calling two exported classes.

Not: writing `auth.json` (pi exports neither its store nor its locking). Epsilon-side
copies of pi config registered at engine start (lost on restart, duplicates resolution).
Showing a terminal command in the UI. A screen for every pi setting. A second key store:
the panel's field writes `models.json`, and only pi's own flows write `auth.json`. Raw
editing of the whole `mcp.json` (one entry is enough, and the rest stays out of reach).
Writing an MCP tool rule under the spelling pi registered (pi matches the name the
server reports, so that rule is silently ignored for every tool whose name it
rewrote), and refusing the switch in that case (the tool keeps a switch that cannot
work, and an underscore in a tool name is the common case, not the odd one).
Glama and mcp.so as registries: Glama needs an API key, gives no install command and
requires its credit on every page; mcp.so has no public API.

## Chats and projects

A conversation is a pi session, and the interface calls every one a chat. Where it
runs decides what it sees:

- A **chat** runs in `<agent home>/chats`, one empty folder Epsilon creates. It has
  no `.pi`, so it sees the home's settings, skills, MCP servers and packages and
  nothing else. It starts with the coding tools (`bash`, `edit`, `write`) off.
- A **project** is any folder the operator opens and trusts. Its chats run there and
  add that folder's `.pi` and context files. They start with pi's default tools.

Both carry a per-session tool switch; pi records the loadout in the transcript, so
the choice survives a reopen. `read` stays on either way, because skills need it.

Nothing runs in a project folder until pi trusts it. Trust is pi's chain, not a
single saved flag: a folder with nothing pi gates is trusted with no record, then a
saved `trust.json` decision (a parent's covers its subfolders), then the home's
`defaultProjectTrust`. When that leaves the question open the page asks, and the
server refuses to build an engine or write project settings in a folder pi does not
trust. The Trust button writes the same store `/trust` writes, so a terminal and the
dashboard share decisions.

The list of projects is derived from the folders pi's session files record; nothing
stores it. A folder opened but never used exists only in the page URL until its first
message. A chat moves into a project through `SessionManager.forkFrom`, which writes
the history under the new folder, and the original file is then removed.

A chat's display name is pi's own session-name entry, written through the engine (or
`SessionManager` when no engine holds the file), so a terminal sees the same name. A
pin is Epsilon's own list preference: `pinned-sessions.json` in the agent home holds
the ids, and the list route joins them to pi's sessions. Pinned rows lead their place;
a project's chats stay inside that project.

Deleting a chat deletes its session file and drops its pin; an idle engine on it is
closed first, and only a turn in progress refuses. Removing a project deletes the
session files recorded in that folder, which is all that puts it on the list; the folder
and pi's trust record are left alone. A chat moved into a project is deleted after the
fork too: its history lives on, so a second copy would only be confusing.

Why: pi has no pin concept, and a browser-only pin would vanish on another tab or a
reload. A pi session file with an unknown pin entry would be a second truth for pi's
own data. Not: writing pins into a session transcript or keeping them in server memory.

MCP servers, skills and packages each open on a Global | Project tab, the split pi
makes between the home and a project's `.pi`. The tab decides what Add writes and
names the file; a project tab also lists the global entries it inherits, and
switching an inherited MCP server there writes an override in the project file. A
package's page switches its resources one by one; the switch is a filter in the
package entry of the file the tab names, so the package itself stays installed. A
package pi reports as outdated carries the marker on its row and its page, and
Update runs pi's own updater, whose npm or git failure text is shown as it is. A
project tab shows one row per package: a project entry that matches a global one hides
the global row and says it overrides it, while a global package the project leaves
alone shows as inherited. The match follows pi's identity, an npm name, a resolved local
path, or the source string for a git URL. The project is in the Settings URL, so a
project's menu in the sidebar links straight to it.

Why: skills, MCP servers and packages exist at two scopes in pi, and an Epsilon tied
to one startup folder could only ever show one project's scope. Opening any folder
from a browser makes a trust decision necessary: a cloned repository's
`.pi/extensions` is code.

Not: a chat with no folder (pi has no such mode). A chat in `$HOME` (its ancestors
would become project resources). Always trusting an opened folder, which was only
defensible when the folder was chosen at startup. Gating chats on trust (their folder
is Epsilon's own). A stored project list (a second truth beside pi's session files).

## Branching

pi's session file is a tree, and the session controls' Branch group offers its three
ways to branch: the session tree (`/tree`), a fork at a user message (`/fork`) and a
clone of the active branch (`/clone`). The tree lists the user messages, replies and summaries
pi can move the leaf to, including branches the transcript no longer shows, and
picking one calls `AgentSession.navigateTree`. A user message moves the leaf to its
parent and hands its text back for the box; any other entry becomes the leaf and the
chat continues after it. The next prompt starts a sibling branch, and the one it left
stays in the session file. pi refuses the move while a run or a compaction is going,
so the control is disabled with that reason.

Why: moving the leaf is a command on the live engine, and the text coming back to the
composer is what makes the new branch start from the message the operator picked
rather than a retyped copy of it. Listing the whole tree is what makes an abandoned
branch reachable again.

The picker can also ask pi to summarise the branch being left (`navigateTree`'s
`summarize`). That is a model call in the middle of the navigation, so it is a checkbox
that defaults to off, and the result is a summary message in the transcript.

pi's `/tree`, `/fork` and `/clone` are terminal commands over the SDK, not extension
commands, so `get_commands` does not carry them. Epsilon answers every name pi's editor
answers, from the table in `shared/src/conversation/commands.ts` (Built-in commands).

A fork at a message or a clone is a second session file rather than a command on this
one (Session copies).

## Outside changes

pi reads a session file once and then holds the transcript it built, so another
process writing that file (a terminal `pi` resuming or renaming the chat, an editor,
a restored backup) is invisible to a live engine. Merging those bytes into the loaded
transcript would invent an ordering that is not in the file.

A live engine therefore watches its own file. A change while nothing runs is reported
once, with a reload action; the reload disposes the engine and rebuilds it from disk.
Changes during a run are that engine's own writes and are ignored.

Why: a silently stale transcript is worse than a visible reload, and pi exposes no way
to merge an external write into a loaded session.

Not: polling the session list for it (that reports a file moved, not what it says).
Writing the reload as a second session (the file is the one the operator is looking at).

## Session copies

Forking a chat at a message and cloning it at the position it is at each produce a **new
session under a new id**, and the REST route answers that id so the page navigates to it. The
fork picker lists every user message in the session tree, not only the active branch, and the
picked text is handed to the new chat's composer: pi's `/fork` puts it back in the editor,
and Epsilon opens a new session id instead of rebinding the current one. A copy runs on a
`SessionHost` built for that request alone and closed in `finally`, from the same runtime
factory a live chat uses: pi's `fork` replaces the session a runtime holds, so a copy
cannot borrow the live engine. It is wired like a live chat (same settings manager, same
resource loader with the CLI's built-ins and Epsilon's defaults, same UI bridge, with no
tab behind it), so an extension sees the same start and shutdown pair it would in a live
engine and a copy pays one MCP connect and disconnect for it. The source session's engine
is closed first, so one writer reads the file, and a chat that is still working refuses
the copy instead of being stopped.

Why: a copy exists so two chats continue separately, and the original file is left exactly
as it was. A new id is the one thing the route, the socket attach and a sidebar row can all
agree on, and the page opens the same chat the engine will.

Not: replacing the live engine under the open tab and rebinding every subscription. It
keeps one page and one id, but the subscriptions, dialogs and display state all belong to
the session that was replaced, so the tab would rebind mid-request and a second tab
watching the same session would keep the old one. Not: `navigateTree` for a fork (it moves
the leaf inside one file, Branching). Not: `SessionManager.forkFrom` for a fork at a message
(it copies the whole file, branches included).

## Export

A chat's transcript leaves as an HTML page or a JSONL file, written by pi's own
exporter and handed to the browser's download. Both are methods on `AgentSession`, so
the server builds the session's engine for the export when nothing holds it, reads the
file back into the response and releases the engine to its idle grace. Nothing is kept
on the server: pi writes into a temporary folder that is removed after the read. The
name the file is saved under is the chat's own name, else its id.

Why: pi ships no exporter that takes a session file — its `exports` map exposes only
the package root and the RPC entry — so a path around the engine would be a second
implementation of pi's output, drifting from the page a terminal's `/export` writes.
The HTML export also reads pi's bundled template and pre-renders extension tool output
through the live extension runners, which only an open engine has. Export reads the
transcript and changes nothing, so a run in progress does not refuse it.

Not: serialising the socket's snapshot in the browser (it holds the rendered subset of
the transcript, not the file). Not: a streaming download with `Content-Disposition`
(the contract carries the bytes as a JSON field, and a second response shape for one
control buys nothing at a few hundred kilobytes).

## Attachments

A prompt carries images beside its text: at most four, each at most 2 MB of raw bytes
(2,796,204 base64 characters) and 12,000,000 base64 characters for all of them
together. `shared/src/protocol/frames.ts` states the three numbers once; the zod schema
and the composer's check both derive from them, so the two cannot drift. An image is
the base64 the browser read and its MIME type, which is pi's own `ImageContent`; the
composer takes one from the file picker, from a paste into the box or from a drop on
it, shows it with a remove action, and says under the box which cap a refused file
hit. `PROTOCOL_VERSION` 11 added the field.

Why: pi normalises prompt images itself, resizing to the `images.autoResize` setting
and the model's `inputLimits.images.resize` and turning an image it cannot use into a
hint in the run, so a resize or a format check here would disagree with what the model
received. What Epsilon must bound is the memory one socket frame can hold: four of
these images stay well under the platform's 16 MB payload.

Not: resizing, re-encoding or thumbnailing in the browser (pi does that with the
active model's limits at hand). An upload endpoint or a second file route (the frame
already carries the bytes). Images on `!cmd` or `/reload`, which are not prompts and
have nowhere to put them: the composer refuses and says so instead of dropping them.

## Skills

The skills list is pi's own answer: its resolver says which `SKILL.md` files exist and
whether a setting turns one off, its loader says which name won a collision and why a
file was refused. Each skill shows one status (automatic, manual only, off, shadowed,
invalid, untrusted) and where it came from. A save rewrites only the fields the panel
edits and keeps every other frontmatter key and comment; a file whose frontmatter does
not parse is shown, not rewritten. A save follows pi's load rules: a missing `name`
(pi uses the folder name), a `name` that differs from the folder, an empty body, and a
description holding markup all write unchanged, because pi loads them. Only the name
pattern stays stricter than pi: pi loads a bad name with a warning, and a permanent
write should not create one. A skill is addressed by its folder, so the list shows pi's
name and links by the folder. A skill an extension adds through `resources_discover` is
merged from the open engines in the scope and marked `extension`: read-only, with no
switch and no editor, because it exists only while one of those engines is open. With
none open the list is pi's file answer and the pane says it is from files.
The composer palette lists the `/skill:` rows only while pi's `enableSkillCommands` is
on. Typing one still runs it either way, because pi's expansion does not consult the
setting; the palette follows the switch, not a rule of its own.
The Skills pane lists the scope's plain `skills` entries under Skill paths, with Add and
Remove. Add stores the resolved absolute path and first drops any entry naming the same
target, a `-path` switch included, so the source loads instead of being force-excluded;
Remove drops every entry naming it, so no switch outlives its source. The other agents'
folder buttons are presets over the same array.
Fields from other agents (Claude Code's `context`, `user-invocable` and the rest) are
shown read-only with a notice that pi ignores them.
Turning one skill off is a `-<path>` entry in pi's `skills` setting; a skill folder of
another agent (`~/.claude/skills`, `~/.codex/skills`) is used only when the operator
links it, which adds the folder to the same setting.

Why: pi honors `name`, `description` and `disable-model-invocation` and nothing else,
so an editor for other agents' fields would promise behavior the agent does not have.
A scan of our own would disagree with the agent the first time pi changes its order.

Not: rebuilding pi's discovery. Editing fields pi ignores. Copying or symlinking other
agents' skills into the home.

Installing skills is one path for every source: a picked folder, an archive, or a
pasted `skills add` command is staged under the agent home, every skill in it is
checked against pi's load rules (a bad name is refused too, which pi would only warn
about), the operator reviews the report, and only then are the chosen skills moved
into `<agent home>/skills` or a project's `.agents/skills`. A pasted
command runs the `skills` CLI at a pinned version as a short-lived child process, with
telemetry off and the operator's `~` replaced by the sandbox's under `bun run dev`; it
only fetches into the stage and never places anything itself. A repository pi can read
as a package (a root `skills/` or a `pi` manifest) can instead be installed as a pi
package filtered to the chosen skills, which keeps it updating; the default stays a
copy, because a package update is not validated again.

Why: the CLI already resolves every source people paste from skills.sh (GitHub,
GitLab, private git, archives), and staging keeps one validation for all of them.
Project skills go to `.agents/skills` because other agents read the same folder.

Cost accepted: the installer is a child process and needs the network; the engine
stays in-process.

Not: letting the CLI write the final location (no validation, and `-g` would write the
real `~/.agents`). Re-implementing the CLI's fetchers. A lock file of our own.

Dev and host follow separate rules and never mix. Under `bun run dev` the sandbox's `~`
is `HOME` for the server, pi and every child, and a project must be a folder inside it;
the folder picker cannot leave it and the server refuses anything else. On a host the
real `~` is used, as a terminal would. In both, `~/.agents/skills` of the `~` in effect is
an editable global skills folder.

Why: pi loads every `AGENTS.md` up to `/` and every `.agents/skills` up to the git root
above a project, so one project on the operator's disk carried their configuration into
the sandbox, filed as project skills. Not: letting the sandbox open any folder and warning
about it.

## Templates

Prompt templates and themes have no settings page. pi reads both from its own folders,
from the `prompts` and `themes` paths in `settings.json`, and from packages. A template
already becomes a composer command, which the palette lists and `prompt()` expands, so
the dashboard gives it the only surface it needs. The paths stay in `settings.json`:
adding a folder is rare, and neither a path nor a theme has a result a settings page
could show, because a theme only changes a terminal and Epsilon draws its own interface.
Package-provided prompts and themes stay visible, and switchable, under Packages.

Why: skills, MCP servers and packages each have an authoring workflow the dashboard
improves. A prompt template is one markdown file the operator edits elsewhere, and a theme
is terminal colors. A page that edits config with no visible effect is worse than naming
the file. Not: a path editor, a theme picker, or a second list of templates beside the
composer palette.

## Default extensions

Epsilon ships its own defaults (a permission guard, an ask-question flow) as code,
registered as inline factories with `builtin: true` and `replaceable: true`, beside the
CLI's own built-ins (codemode, tool search, MCP). An operator extension with the same
command, tool or flag name wins by rule instead of colliding. MCP servers connect when
the extensions are bound.

The defaults exist in the dashboard's engine only. They are not written into the home
and are not claimed to exist in a terminal; the dashboard is therefore more guarded than
a terminal using the same agent home, and the docs say so.

The permission guard stops for `bash`, `write` and `edit` by name, and for any tool
that declares `destructiveHint` in either guarded mode. A custom extension and an MCP
server describe their own danger; keying on names alone would run a `delete_all` tool
without asking, and keying on every custom tool would turn the guard into a wall.

One default observes rather than guards: `mcp-observer` reports the servers extensions
registered, and its session merges that into the live MCP answer, so a server that
connected no tool is still named instead of silently missing. pi keeps its connection
states inside its own MCP extension, and the one channel it leaves is the notice that
names the servers needing a sign-in or failing; the panel repeats those two in pi's
words and claims nothing about the ones that stay inside, which is why a server with no
tool and no report reads as "no tool yet" rather than "broken". The observer
reads no files, connects nothing and is not a second MCP client.

Why: writing extension files into pi's home makes Epsilon a writer of pi's configuration
and lets copies drift from the repository. A registered server with no tools is a state
the files cannot show and the panel must not hide.

Not: seeding extension files into the home. Telling operators to copy files. Claiming
parity with the terminal.

## Design system

The client has one set of tokens (`client/src/styles/tokens.css`) and one layer of
patterns (`client/src/components/patterns`) that every feature composes. Tokens name
roles, not values: `h-bar`, `gap-field`, `text-title`, `max-w-dialog-md`,
`animate-enter-rise`. `cn` is configured with them (`client/src/lib/cn.ts`), because
the stock merger reads `text-title` as a colour and drops it. The `design-tokens` lint
rule is an error in `features/` and `components/patterns/`: no bracketed values, no
raw palette colours, type and spacing only from the scale.

Why: the same idea was drawn many ways (38 paddings, six dialog sizes, seven error
layouts, twelve one-off entrances), so columns did not line up, dialogs resized
between tabs and an offline server showed three different messages at once.

Not: a design per section. Bracketed values in features. A second component for an
idea a pattern already draws.

## Feature modules

Server `features/<name>/`, client `features/settings/<name>/` and shared
`<feature>/rules.ts` carry matching names. Server feature files have fixed roles:
`contract` (zod request and response schemas), `domain` (pure), `store` (pi files),
`service` (use cases), `routes` (thin), with the direction routes, service, domain,
store, platform. Another feature is imported only through its public index; `settings/`
is the one aggregator. There is no file-size cap: one concept per file, split by meaning.

Why: a length cap split single concepts across files and was a lint target, not a design
rule.

Not: keeping the cap and adding files.

## OpenAPI client

The server's OpenAPI document is the REST contract. `bun run api:generate` writes the
client schema and contract files; `shared/` keeps only the socket protocol, the reducer
and rules both sides run. Every response carries `x-epsilon-contract`, and the client
shows one reload notice on a mismatch instead of parsing responses.

Why: the contract used to exist three times (zod, hand-written fetchers, browser
parsing) and drifted.

Not: zod-parsing REST responses in the browser (a second copy that still drifted).
Revisit if a route needs streaming or uploads that the generated client cannot express.

## Documentation

Docs hold decisions, the pi reference and a map. Code, types and tests state
everything else; plans, feature lists, UI inventories and frame lists are not kept in
prose because they drift. This file states a decision as it holds now and is edited in
place when a decision changes.
