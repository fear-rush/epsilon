# Plan

Status: **S1 to S5, S12, S13 and S17 are done and verified in a browser. S14 is
active. S6 to S11, S15 and S16 are open.** This file answers: what the product does
for its user, which slice is being built, and whether it is done. Keep "Active slice"
honest; that is the only part that must never drift.

The checks for every slice are in [plan/slices.md](plan/slices.md). Facts that were
verified by hand are in [plan/facts.md](plan/facts.md). Scope and the not-building
list are in [features.md](features.md). Architecture is in
[architecture.md](architecture.md).

## Jobs

The product exists for these, in this order. If a feature does not serve one, it
waits.

1. **Continue.** I start a task at my desk, walk away, open the same session on my
   phone, and steer it.
2. **Inspect.** I see what the agent did (commands, edits, diffs, images,
   notices) without scrolling a terminal.
3. **Oversee.** I get notified when it needs an answer, and I can answer from
   wherever I am.
4. **Verify.** I look at what it built and read the diff before I accept it.
5. **Set it up.** I run it on a machine that has never had `pi` configured, and I
   add a provider from the browser on my phone, in Settings.
6. **Configure, rarely.** When I add a provider, an MCP server, a skill or a
   package, I do it once, in Settings, without opening a terminal.
7. **Never blocked.** I never open my laptop only to check whether a run finished.

Job 5 is new and it changed the product's shape. Until it existed, the dashboard
could only run where the operator's terminal already was
([ADR-0005](adr/0005-deployment-owns-agent-home.md)). Two things follow that
constrain every other job:

- The deployment owns its agent home, so the dashboard and the terminal inside the
  deployment share sessions, and the host's terminal no longer does.
- The dashboard configures pi through its SDK and its documented files. Only trust,
  OAuth login and MCP sign-in stay in a terminal inside the deployment
  ([ADR-0012](adr/0012-configure-in-the-dashboard.md)).

## How a slice works

A slice is one user-visible outcome taken end to end: data source → socket or REST
→ reducer → UI. It ends when you can perform its checks yourself in a browser. No
slice lasts more than about two days; if it does, cut it, and the cut line is
almost always "read-only version first".

One slice at a time. A slice is finished when its checks pass **and** the
[universal done list](#universal-done-list) passes. Then commit and mark it done.

The only horizontal work allowed is folded into S1: you cannot demo anything
without an engine and a socket.

## Slices

| #   | Outcome you can see                                             | Status |
| --- | --------------------------------------------------------------- | ------ |
| S1  | Type a prompt, watch a real answer stream in                    | done   |
| S2  | Read a terminal-created session on a phone, tool calls and all  | done   |
| S3  | Browse sessions, resume one, close the tab, come back           | done   |
| S4  | Run a full turn (steer, abort, change model) without a terminal | done   |
| S5  | Answer a permission prompt from the browser                     | done   |
| S6  | Open a file, its diff, and insert its path into the composer    | todo   |
| S7  | Use `pi` itself in a terminal tab                               | todo   |
| S8  | See which skills, packages and MCP servers are loaded           | todo   |
| S9  | Preview what the agent built, from the phone                    | todo   |
| S10 | Get pinged when a run needs an answer                           | todo   |
| S11 | Reach the dashboard from a phone on a machine without `pi`      | todo   |
| S12 | Run every turn from an engine in the server, with no child      | done   |
| S13 | Open a fresh home and get a guard, an ask tool and a notice     | done   |
| S14 | Reach the web and delegate on a fresh deployment                | todo   |
| S15 | See what the context is spending, in the browser                | todo   |
| S16 | Paste an image into the composer                                | todo   |
| S17 | Configure providers, MCP, skills and packages in Settings       | done   |

S11 serves job 5. It gates nothing on this laptop, where the dashboard already runs
against the host's own `pi`, and it comes before any deployment on a second machine.

S14 to S16 follow [ADR-0011](adr/0011-third-party-tools-as-dependencies.md): a package
that provides tools may ship as a dependency, and a package whose value is a terminal
surface is rebuilt in the browser instead. S14 is the first because a fresh machine
with web search and subagents is most of what "works really well elsewhere" means.
S15 and S16 are the two terminals-only features that a browser can do better, and
neither depends on S14. S16 is the V2 milestone in [features.md](features.md), so it
builds after V1 is done, not before.

S12 ran before S5 because every later slice reads the engine's events, and because
the defaults Epsilon ships are inline extensions, which a child-process engine
cannot arbitrate ([ADR-0008](adr/0008-embed-pi-engine-with-opinions.md)). Both are
verified in a browser now.

## Active slice

**S14: Reach the web and delegate on a fresh deployment.**
S17 closed before it, so a fresh home can be configured from the browser first. S14
follows [ADR-0011](adr/0011-third-party-tools-as-dependencies.md): a package that
provides tools ships as a dependency, and a package whose value is a terminal surface
is rebuilt in the browser instead.

**S17 is closed and verified in a browser.** Configuration lives in the dashboard:
providers and their models in `models.json`, the default model through
`SettingsManager`, MCP servers in `mcp.json`, user skills as `SKILL.md` files, and
packages through `DefaultPackageManager`
([ADR-0012](adr/0012-configure-in-the-dashboard.md)). The not-ready notice links to
the settings page instead of naming a terminal command.

The provider page is a two-pane editor. The left column lists configured providers
with their model count; a provider pi ships says `pi default`, and a custom provider
does not repeat its id under its name. The right column is one form with its footer
pinned to the bottom. A name derives a unique id (`-2` on a collision) and a
duplicate name is refused; the id is fixed after the first save. The API picker
names the path each family appends, the base URL field names the request URL and
warns when the base repeats that path, and the model count sits in the group title.
A provider's model list is fetched on request; `supported_endpoints` gives a
`/messages`-only model the Anthropic API and base, a `/responses`-only model that
API, and an exact id and API inherit pi's reasoning metadata. Deleting a provider
also logs out a key stored in `auth.json`. Forms validate with zod and report the
first message per field; a blank optional value is never written.

Reasoning is configured per model: the model dialog writes `thinkingLevelMap` and
the reasoning keys of `compat`, with provider-wide defaults in the provider form.
The composer offers the current model's supported levels at runtime. The provider
and model test buttons can try a draft at a chosen level through pi's own client;
the result names the sent field and the reasoning tokens or thinking characters the
provider returned. A connection that cannot be reached turns the whole providers
route into one sentence, not a list with an empty editor.

Over HTTP against a scratch home, S17 also verifies: a provider write flips
readiness, a default model lands in `settings.json`, MCP and skill files are written,
every delete restores the empty shape, an imported model list can carry per-model
API/base and pi catalog metadata, a provider/model test reports its level and usage,
and a failed turn renders its `errorMessage`.
The slice also removes pi's RPC vocabulary from the engine: `mode` is `"json"`, a
prompt's source is `"interactive"`, and no RPC command table remains.

**S13 is closed and verified in a browser**, with Playwright against a scratch home:
the permission control read `Strict` after `/permission strict`, a `bash` turn raised
`Allow bash? echo browser-probe` and refusing it left the card `failed`, `discuss`
opened a dialog with both presets plus `Type something.` and the answer came back as
`User selected: 2. Yolo`, and an empty home replaced every page with the notice and no
composer. The defaults stay engine-only: the terminal gets them in S7
([ADR-0010](adr/0010-defaults-are-engine-only.md)).

**S12, S5 and S4 are closed and verified in a browser.** The engine runs in the
server ([ADR-0008](adr/0008-embed-pi-engine-with-opinions.md)), the socket speaks
Epsilon's own commands ([ADR-0009](adr/0009-socket-speaks-epsilon.md)), and no
`pi` child process exists during a turn. A permission prompt appears in the page,
a second tab cannot answer it twice, a reload replays it, and `ctx.ui.custom`
reports the terminal tab. A tab that closes mid-run keeps the engine until the run
settles; ten seconds after the last tab detaches with nothing running, the session
is disposed and the next attach rebuilds it. The live-session cap named in ADR-0008
is still unbuilt, and that is the one engine cost left open.

## Universal done list

Every slice, in this order:

- [ ] Every check above passes, by hand, in a browser
- [ ] `bun run type-check`, `bun run lint`, `bun run dead-code`, `bun run build`
- [ ] No file over 300 lines, no route handler over 60
- [ ] No `@earendil-works/*` leak outside the two allowed modules
- [ ] Scaffolding from the previous slice is deleted, not commented out
- [ ] No capability claimed that pi does not expose, in its SDK, its documented
      files or its CLI. All three are recorded in
      [reference/pi-sdk.md](reference/pi-sdk.md)
- [ ] This file updated: slice marked done, next slice named; the check marked in
      [plan/slices.md](plan/slices.md)
- [ ] An ADR added only if a decision changed; a note in `docs/notes/` if a trap bit
- [ ] Committed with a conventional message naming the outcome

## Risks

| Risk                             | Why it matters                                                                                                                                      | Mitigation                                                                                                                                                |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The normalizer is the hard part  | Deltas, tool updates, retries and compaction must fold into one pure reducer; this is where pi-web accumulated thousands of lines                   | Fixtures from real traces; replay is the only test that catches ordering bugs                                                                             |
| pi's surface changes             | An upgrade can drop a library export, rename an event field, or move the JSON transform                                                             | Exact pin; re-verify with the greps in `reference/pi-sdk.md` before upgrading                                                                             |
| No policy in a fresh home        | pi core does not ask before a tool call, and a terminal `pi` in the deployment has no guard either, because the defaults are engine-only (ADR-0010) | Epsilon ships the guard as code (S13, built), the not-ready notice covers a home with no model, and S7 gives the terminal tab the same guard through `-e` |
| Bun + pi beyond startup          | One tool-using turn with a permission dialog passes under Bun 1.4.4                                                                                 | None needed; re-check after a pi upgrade                                                                                                                  |
| Preview proxy WebSockets         | HMR dies silently without upgrade passthrough                                                                                                       | Static preview first in S9; the proxy is its own step if it fights                                                                                        |
| Extension `custom` UI            | An extension needing it is unusable in the web UI                                                                                                   | Visible notice, not silence; terminal tab                                                                                                                 |
| Two writers on one session       | pi appends to the JSONL with no lock, so two hosts on the same session interleave entries                                                           | Resume sequentially; nothing guards the concurrent case yet                                                                                               |
| An engine per attached session   | A tab left open, or a run continuing after the tab closes, keeps an engine and its heap                                                             | A run or dialog keeps it alive; otherwise it disposes ten seconds after the last detach; a cap is still unbuilt                                           |
| Native packages are per platform | A home built on one platform does not run its packages on another                                                                                   | Install inside the deployment; `deploy.md` says so                                                                                                        |
| A published port                 | There is no authentication in the app, by design                                                                                                    | Publish on loopback and reach it through a tunnel; Host check in S11                                                                                      |
| The engine is in-process         | An extension or engine bug can take the whole server down, and every live session shares one heap                                                   | Idle disposal after ten seconds is built; a live-session cap is not; the session files survive a crash                                                    |
| Scope creep into settings        | The project this replaces accumulated 20k+ lines of settings UI, and the panel now has a write surface                                              | Five sections with one form each; only what blocks a turn; a new settings feature needs a documented pi writer or file (ADR-0012)                         |

## Definition of done for V1

- A session started in the terminal inside the deployment can be continued from a
  phone, and both show the same messages.
- Every tool call in a real session is readable: command, output, diff, image.
- An extension prompt can be answered from the web UI.
- A run survives the tab closing, and the phone can reattach.
- A machine that has never had `pi` configured becomes usable after one provider in
  Settings, and the dashboard says so when it has not.
- A file can be opened, previewed and diffed without leaving the browser.
- Nothing in the UI claims a capability that pi does not expose, and every write
  goes through pi's SDK or a documented file (ADR-0012).
