# Architecture

A one-page map. Code is the reality; this page says where things go and why. For the
decisions behind it read [DECISIONS.md](DECISIONS.md); for what pi exposes read
[pi-sdk.md](pi-sdk.md).

## Bounded contexts

- **Conversation.** A live session: the embedded pi engine, its extension dialogs,
  the browser socket, and the reducer that turns pi events into a transcript.
- **Session catalog.** Listing, renaming, deleting, restoring and pinning sessions
  by reading pi's session files. It never builds an engine; deleting a session an
  engine holds is refused.
- **Agent configuration.** Providers, models, MCP servers, skills, packages and
  general settings, written to pi's documented files and exporters, plus readiness
  (does the home hold a usable model).

Server features, client features and settings sections carry the same names, so a
concept is found by name in every workspace.

## Inside a server feature

`routes -> service -> domain <- store -> platform`

- `contract.ts`: zod request and response schemas. They feed the OpenAPI document.
- `routes.ts`: parse input, call one service function, return. No logic.
- `service.ts`: use cases; composes the store and the domain.
- `domain.ts`: pure rules and shaping, no I/O.
- `store.ts`: reads and writes pi's files and exporters. Uses `platform/` for
  parsing, merging and atomic writes; unknown keys are kept and an unparseable file
  is refused, never overwritten.

Features import another feature only through its public surface. `settings/` is the
one aggregator: it composes the configuration features into a single snapshot and
owns no data of its own. `main.ts` is the only reader of `process.env`; it chooses
the agent home once and passes it in through `deps`. Folders are chosen per session:
a chat's is fixed by the home, and a project's is opened in the page and must be
trusted ([DECISIONS.md](DECISIONS.md), Chats and projects).

## Files and folders

There is no line limit. Split by meaning:

- A file is one concept read top to bottom. Private helpers and subcomponents stay
  in it. Past about 400–500 lines, ask whether it is still one concept.
- A file earns its own place when it is a public surface (`index.ts`, `contract.ts`),
  an I/O boundary (`store.ts`), pure logic tested on its own, something with its own
  state (a hook, a dialog), or code used by two or more modules. Otherwise it lives
  in its only consumer.
- Extract on the third use, not the first. Lift to `components/patterns/`, `lib/` or
  `platform/` when a second feature needs it, never by reaching into a sibling.
- What changes together lives together. No folder for one file; a subfolder needs
  about four siblings with a shared role.
- Routes only wire: the params, the loader that warms the page's reads, and one feature
  component. A loader puts those reads in the Query cache and drops their failure, because
  the pane already shows it in its own words.

## Two boundaries

- **REST** is described by the server's generated OpenAPI document. The client is
  generated from it. Every response carries `x-epsilon-contract`; on a mismatch the
  client shows one reload notice instead of parsing responses at runtime.
- **Socket** (`/api/link`) is a shared zod protocol in `shared/`. The client sends
  `hello` with `PROTOCOL_VERSION`; the server replies `welcome` or
  `error PROTOCOL_MISMATCH`, and the page shows a reload notice and stops attaching.
  The socket carries Epsilon's commands and events, never pi's RPC types
  ([DECISIONS.md](DECISIONS.md), Socket vocabulary). Bump the version when a frame
  changes. On reconnect the client re-attaches and receives a snapshot per session;
  there is no replay log.

`shared/` holds only the socket protocol, the conversation reducer and rules both
sides run. REST shapes live in server `contract.ts`.

## Where state lives

- pi's files in the agent home: transcripts, settings, credentials, models, MCP,
  packages, project trust. Project MCP, skills, packages and overrides live in
  `<project>/.pi`. The session files name their folder, which is how chats and
  projects are told apart and how the project list is derived. They live under
  `<home>/sessions/` unless `sessionDir` names another place; that setting is read
  from the home or a project's `.pi/settings.json` before trust, and a relative
  value resolves from the folder.
- Epsilon's own files in the agent home: `pinned-sessions.json`, the pinned chat
  ids. A chat's display name is pi's own session-name entry, not a second file.
- Live engines in the server's registry. An engine is a pi `AgentSessionRuntime`, so
  a replacement (`/new`, a switch, a fork) is pi's own operation and the registry and
  the page follow the session id it moved to. An engine is disposed ten seconds after
  its last detach unless it is running, compacting or waiting on a dialog, so a closed
  tab does not stop a run and a reload sees a pending dialog again.
- The browser holds view state only: scroll, drafts, open panels, the folder of a
  project chat that has no file yet, the project Settings shows, and the skill page's
  tab and raw file (all in the URL).

Nothing is stored only in the browser or only in server memory. The agent home is
not recorded anywhere; it is derived, so a file naming it would be a second truth.

## Failure modes

Every failure is visible; silence is never acceptable. An unconfigured home replaces
the page with one notice that opens Settings. A frame or file the code cannot read
produces a notice naming it. Engine start failures, extension errors and refused
commands arrive as error frames or `command-result { ok: false }`. An unsupported
capability gets a notice, never a dead control. A session whose recorded folder is
gone offers the chats folder or another project, and never moves the file. An engine
bug takes every live session down with the server; session files survive
([DECISIONS.md](DECISIONS.md), Embedded engine).

## UI rules that are not obvious from the code

- Three client layers. `styles/` holds the tokens (`tokens.css`: layout sizes,
  gaps by role, type roles, dialog sizes, motion) and the motion that is not a
  token entrance (`motion.css`). `components/ui` is shadcn. `components/patterns`
  is what features compose: `pane/` (PaneBar, PaneBand, DetailPage, MasterDetail),
  `list/`, `section/`, `status/` (StatusView, Notice, AppBanner, `errorView`),
  `dialog/` (DialogFrame), `tabs/`, `form/`. `components/editor` is CodeMirror,
  the file tree and markdown.
- Every column starts with a `PaneBar` (`h-bar`, the only rule across the columns),
  so the settings nav, a list and a detail page share one line. A `PaneBand`
  (`h-band`, no rule) below it holds tabs or search, and only when there are some; a
  column can instead start with a `pane`-gapped stack of actions and search. A detail
  page's title is in its bar.
- One inset per column: bar title, band, picker, search, group heading and a row's
  text all start on the column's gutter (`px-pane` for the nav and a list, `px-page`
  for a detail page). A hovered or selected row pads its text by half the `pane`
  gutter and bleeds the same amount outwards, so the colour has room and the text
  keeps the line; the nav item and the list row are the same chip.
- Under the bar, every piece sits one `pane` gap below the one before it, whichever
  of them are shown: a section's tabs, the project picker, its notices, the search,
  then the rows.
- A selection reveals with one `enter-rise`: a detail page's tabs, body and footer
  start together, and a chat's rows and composer rise with the same token, so every
  list in every sidebar opens its pane the same way. A pane bar's title and count
  drop in from above instead, and drop again when their text changes.
- A `CollapsibleSection` grows its height over `duration-slow` with `ease-in-out`
  (a settle curve makes a tall card jump) and, when the height settles, scrolls its
  scroll parent to the new end. Content that opened out of view must be brought back.
- Connection and version problems belong to the root `AppBanner` and nowhere else.
  A pane shows its own loading, empty and error states with `StatusView`.
- A dialog is `DialogFrame size="sm|md|lg"`: a fixed body height, so switching tabs
  or steps never resizes it; `body="content"` lets a one-step dialog hug its field.
  Its content stays mounted while closed, so the opening and closing transitions play.
  A dialog whose words come from the payload that opens it keeps the last payload
  through the exit (`useLastDefined`), so closing never flashes a fallback.

- Compose the installed shadcn components; chat primitives (`MessageScroller`,
  `Message`, `Trace`, `CodeBlock`, `Marker`) mean something, so do not fake them
  with divs. One component per concept: one way to render a tool call.
- Composition is Base UI: `render={<Button />}`, never `asChild`.
- Radius follows one ladder: `rounded-md` for rows, menu items and chips, `rounded-lg`
  for controls, menus, popovers and code blocks, `rounded-xl` for dialogs, alerts,
  panels and bordered lists, `rounded-2xl` for message bubbles only, and `rounded-full`
  only for pills, avatars and circular icon buttons.
- Colour carries state only (running, needs input, error, selected).
- Surfaces rest white. A muted fill is a state (hover, selected, code, icon tile).
- Destructive actions use `variant="destructive"` and confirm in an `AlertDialog`.
  A form submit is as wide as its label and sits at the right edge of its card; a
  control that needs the whole row stacks below the title.
- Validate a form with zod plus the rules only the form knows; show the first
  message per field under it with `FieldError`; never send a blank optional value.
- Secret values are never shown; a blank key field keeps the stored key.
- Registry defaults are source. Local changes in `client/src/components/ui`:
  `cursor-default` is removed from menu, select and command items so pointer rules
  apply; the checkbox keeps its indicator mounted and transitions scale and opacity;
  `sidebar.tsx` is trimmed to the offcanvas column, Sheet below 1280px and Cmd-B;
  `tabs.tsx` adds `TabsIndicator`, a highlight that slides to the active tab.
