# UI

Status: **current for built surfaces, design for planned ones.** This page covers
the visual vocabulary, the layout and the interaction rules. Implemented surfaces
and their checks are in [plan.md](plan.md). A row marked **planned** names a design
with no code behind it yet; its slice is in [plan.md](plan.md). Numbers marked
"starting value" are decisions to adopt now and tune against a real screen, not
laws.

## Principles

1. **Semantic components, not decorated divs.** shadcn's chat primitives already
   mean something: a thread is `MessageScroller`, a turn is `Message`, activity is
   `Trace`, output is `CodeBlock`, a note is `Marker`. Never fake one with
   Tailwind on a div.
2. **One component per concept.** Two ways to render a tool call is how a UI stops
   feeling like one product.
3. **The transcript is the product.** Chrome stays quiet: no gradients, no cards
   around cards, no colour that does not carry meaning.
4. **Colour carries state only.** Running, needs-input, error, selected. Everything
   else is foreground and muted foreground.
5. **Unsupported means visible.** A capability that pi does not expose gets a
   notice, never a dead control. The same rule covers a deployment that is not
   ready: no credential, no model and an untrusted project are shown on the page,
   never as an empty transcript
   ([ADR-0012](adr/0012-configure-in-the-dashboard.md)).

## Component inventory

Installed: `message`, `message-scroller`, `bubble`, `trace`, `code-block`,
`empty`, `input-group`, `collapsible`, `select`, `tooltip`, `alert`, `button`,
`input`, `textarea`, `sidebar`, `sheet`, `badge`, `skeleton`, `dropdown-menu`,
`context-menu`, `dialog`, `alert-dialog`, `marker`, `field`, `label`, `separator`,
`checkbox`, `command`, `popover`, `spinner`.

Add when the slice that needs it lands, all verified present in the registry:

```sh
bunx --bun shadcn@latest add drawer hover-card progress item attachment \
  resizable tabs sonner switch avatar table radio-group kbd
```

`sidebar.tsx` is trimmed to the parts epsilon uses (offcanvas column, Sheet below
1280px, ⌘B) to stay under the file-size cap. Add the rail, submenus or collapsed
tooltips back from the registry when a screen needs them.

Do not add: `scroll-area` (forbidden for threads by the chat rules), `toast` (use
`sonner`), `form` (a react-hook-form wrapper; the settings forms use `field`),
`slider`, `toggle`, `toggle-group`, `input-otp`, `menubar`, `navigation-menu`,
`pagination`, `breadcrumb`, `calendar`, `carousel`, `chart`, `combobox`,
`native-select`, `direction`, `button-group`, `aspect-ratio`.

Composition is **base**, not radix: `render={<Button />}`, never `asChild`. A
trigger must stay a real button; wrap the `TraceLine`, never replace the trigger
with it.

## Concept to component

| Concept                            | Component                                                                                                                                              | Notes                                                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Thread                             | `MessageScrollerProvider` → `MessageScroller` → `Viewport` → `Content` → `Item`                                                                        | `autoScroll`; `scrollAnchor` on the user turn; `MessageScrollerButton` last                                     |
| User turn                          | `Message align="end"` + `Bubble variant="muted"`                                                                                                       | Bubble only here                                                                                                |
| Assistant turn                     | `Message align="start"` + `MessageContent`                                                                                                             | Markdown body, no bubble                                                                                        |
| Thinking                           | muted paragraph above the answer                                                                                                                       | No duration and no collapse yet; a collapsible `Trace` is planned                                               |
| Tool, running                      | `TraceLine status="running"`                                                                                                                           | Bare line while there is nothing to open                                                                        |
| Tool, finished                     | `TraceCollapsible` → trigger wraps the line → `TraceCollapsibleContent` → `CodeBlock size="sm" wrap max-h-64`                                          | Never `<pre>`                                                                                                   |
| Diff                               | `CodeBlock` + `CodeBlockLine variant="added"/"removed"`                                                                                                | The `+` and `−` marks come from the component, not from copy                                                    |
| Unknown / MCP tool                 | Same as a tool, generic field rows                                                                                                                     | Name, args, output, status. Never blank                                                                         |
| Notice, compaction, branch summary | `Marker variant="separator"`                                                                                                                           | Not a trace row                                                                                                 |
| Approval or blocked tool           | `AlertDialog` while it blocks the run                                                                                                                  | Inline `Item` + `ItemActions` when a prompt does not block: **planned**, the component is not installed         |
| Extension select                   | `Dialog` with one `Button` per option                                                                                                                  | Options wrap, so a long one cannot overflow the dialog; a leading glyph from pi is dropped                      |
| Extension confirm                  | `AlertDialog`                                                                                                                                          | Two buttons, Yes and No; no destructive variant                                                                 |
| Extension input / editor           | `Dialog` + `Input`; monospace `Textarea`                                                                                                               |                                                                                                                 |
| Extension status / widget          | The permission status drives the composer menu; widget rows sit above the composer                                                                     | Other keyed statuses are held in state but not rendered yet                                                     |
| Session list                       | `Sidebar` + one `SidebarGroup` for this project                                                                                                        | No run indicator; needs-input keeps `Badge variant="warning"`                                                   |
| Session actions                    | `ContextMenu` and `DropdownMenu` on `…`; on mobile the row is already inside a `Sheet`                                                                 |                                                                                                                 |
| Deployment card                    | Footer button with avatar, name and a `DropdownMenu` above it                                                                                          | Bottom-left, on every page. The menu names the deployment and links to each settings section                    |
| Settings page                      | Full page: own left nav with Back to app and Search, section on the right                                                                              | Replaces the session sidebar; not a dialog. One URL per section                                                 |
| Settings rows                      | Row in a divided card: title, muted description, right-aligned actions                                                                                 | Secret values are never shown; a blank key keeps the stored one; destructive actions confirm in `AlertDialog`   |
| Settings list row                  | `Link` with the name, the id and the count ("74 models") under it                                                                                      | A credential-only provider still lists, so deleting one has to log it out                                       |
| Settings fields                    | `FieldGroup` → `Field` → `FieldLabel` + control + `FieldDescription`                                                                                   | `Select` for option sets, never a native `<select>`; `InputGroup` when a button sits inside the field           |
| Search everything                  | `Command` in `Dialog`, ⌘K                                                                                                                              | **planned**: sessions, files, slash commands, actions                                                           |
| Slash palette                      | `Command` in `Popover` anchored to the composer                                                                                                        | Server-driven from the snapshot's `commands`; as wide as the composer, three columns: name, description, source |
| Model                              | `DropdownMenu` + `DropdownMenuRadioGroup`, one group per provider                                                                                      | Hundreds of models: current provider first, names sorted inside each group                                      |
| Default model, in settings         | `Command` in a `Popover` on a full-width `Button` trigger, one `CommandGroup` per provider                                                             | Searchable by provider, name and id; the popup is as wide as the row, not the button                            |
| Permission                         | `DropdownMenu` radio group: Strict, Ask, Yolo                                                                                                          | The extension's `/permission <mode>` owns it; the UI shows its own labels                                       |
| Reasoning                          | `DropdownMenu` + `DropdownMenuRadioGroup`                                                                                                              | **planned**                                                                                                     |
| Context usage                      | `HoverCard` + `Progress`                                                                                                                               | **planned (S15)**                                                                                               |
| Attachments                        | `Attachment` + `AttachmentGroup` in `InputGroup`                                                                                                       | **planned (S16)**: `state` wired to real progress                                                               |
| Composer                           | `InputGroup` + `InputGroupTextarea`; white surface, `border-foreground/25`; `block-end` addon holds model, thinking level, permission, stop and submit | Arrow-up submit; Enter sends, Shift+Enter adds a line, Esc stops                                                |
| File tree                          | nested `Collapsible` per folder, `Button` per file                                                                                                     | **planned (S6)**; a single read file in a turn stays a `TraceLine`                                              |
| Preview                            | `Resizable` + `Tabs` (Preview / Source / Diff) + sandboxed iframe                                                                                      | **planned (S9)**                                                                                                |
| Terminal                           | `Tabs` + xterm, `Button` row for touch keys                                                                                                            | **planned (S7)**                                                                                                |
| Empty state                        | `Empty`                                                                                                                                                | Title and one sentence; suggestion buttons are planned                                                          |
| Errors                             | `Alert variant="destructive"`, transcript notice                                                                                                       | No toast system is installed                                                                                    |
| Provider test result               | `Alert` above the settings footer                                                                                                                      | `success` on a pass, `destructive` on a failure; a pass does not quote the keyless probe                        |
| Keyboard hints                     | `kbd`                                                                                                                                                  | **planned**; no `kbd` component is installed                                                                    |
| Loading                            | `spinner`                                                                                                                                              | For attach and file load, not for streaming                                                                     |
| Not ready                          | centre, `Alert`                                                                                                                                        | Names the missing step and the home, and offers **Open Settings**; the composer is not rendered                 |
| Render error                       | centre, `Alert variant="destructive"` + **Try again**                                                                                                  | The route error component; never the router's default screen                                                    |

## Layout

**Desktop, ≥1280px.** Three columns. `Sidebar` 18rem (collapsible to 0), transcript
`max-w-3xl` centred, right panel `Resizable` 360–720px (files, preview, terminal).

Built now: the sidebar, the transcript, and the settings page. The right panel
arrives with the first surface that fills it (files, S6); an empty column would be
scaffolding.

**Tablet, 768–1279px.** Sidebar is a `Sheet` (below the 1280px column breakpoint);
the right panel becomes a tab strip over the transcript.

**Mobile, <768px.** One column. Sidebar is a left `Sheet`; the right panel is a
full-screen `Sheet`; composer pinned to the bottom with `InputGroup`; terminal adds
a touch key row (Esc, Tab, arrows, Ctrl+C).

**Header.** The session title, and no actions until their surfaces exist: files
(S6), preview (S9), terminal (S7), resources (S8), palette. No status chips: a
session that is loading, disconnected, blocked or not ready says so in the middle of
the page, not in the header. Model, thinking level and permission are composer
controls.

**Sidebar footer.** The deployment card sits at the bottom of the sidebar, the way a
chat app puts its account menu there. It opens a menu above itself, and Settings
opens a full page with its own navigation.

## Visual states

| State                            | Where it shows        | Treatment                                                                                     |
| -------------------------------- | --------------------- | --------------------------------------------------------------------------------------------- |
| Idle                             | nowhere               | No header indicator; the transcript says what happened                                        |
| Running                          | last tool `TraceLine` | the line carries the running status; the streaming text keeps its caret                       |
| Loading a session                | centre                | `Spinner` + "Loading the session…"                                                            |
| Disconnected                     | centre                | destructive `Alert`, "Reconnecting…"                                                          |
| Blocked (version mismatch)       | centre                | destructive `Alert` with **Reload**                                                           |
| Permission                       | composer footer       | `DropdownMenu` trigger: shield, current label; no glyphs from pi                              |
| Thinking level                   | composer footer       | `DropdownMenu` trigger with the current level; hidden when the model offers only Off          |
| Needs input                      | dialog, session row   | The blocking dialog is the prompt; the row keeps a `Badge variant="warning"`                  |
| Streaming                        | last assistant turn   | text appends; no spinner, no layout shift                                                     |
| Compacting, retrying             | transcript notice     | one `Marker` row where it happened                                                            |
| Error                            | transcript            | `Alert variant="destructive"`, never a silent stop                                            |
| Engine failed                    | transcript notice     | `AGENT_FAILED` as a destructive notice; no reattach control yet                               |
| Not ready                        | centre on every page  | one `Alert` naming the missing step and the home, with Open Settings; no composer is rendered |
| Unsupported UI (`ctx.ui.custom`) | transcript notice     | names the extension, points at the terminal tab                                               |
| Empty session                    | centre                | `Empty` with a title and one sentence                                                         |

## Density and typography

Two sizes, no ad-hoc values:

- `text-sm` for primary content: messages, session titles, buttons, menu items.
- `text-xs` for secondary detail: durations, counts, paths, model names, menu
  labels, widget rows, composer controls.

Notes:

- Assistant markdown is `typeset typeset-chat`: the typeset system styles headings,
  lists, tables and quotes, and `typeset-chat` keeps the transcript's own size.
- `CodeBlock size="sm"` is `text-xs`; the default size is `text-sm`.
- No `text-[11px]`, `text-[13px]` or other arbitrary values. Pick one of the two.
- No middots in our copy. pi's model names arrive with `·` and render as received.
- The composer is a white surface with a `border-foreground/25` border; its footer
  controls are `text-xs`, the submit arrow is the primary round button.
- Surfaces rest white: the page, the sidebar, cards, dialogs and every form control.
  A muted fill is a state, never a resting surface, so an input is `bg-background`
  with the `input` border rather than a grey block that reads as disabled. Muted
  belongs to hover, selected, code blocks and icon tiles.
- Icons 16px in rows, 14px in buttons, one set (lucide).
- Row rhythm: 8px inside a trace, 16px between traces, 32px between turns.
- Borders only on containers that need them: header, sidebar edge, right panel edge,
  code blocks. Not on every row.

## Buttons and badges

- One accent per surface. `default` (`--primary`, near-black) is the single commit
  action of a form or dialog: Save, Add selected, Submit. A button that opens
  another surface is `outline`. A button that leaves one is `ghost`, always,
  including `AlertDialogCancel`.
- Destructive has two shapes: a labelled `destructive` button in a footer that
  confirms in `AlertDialog`, and a trash icon (`destructive`, `icon-sm`, with an
  `aria-label`) in a list row. Never a red text chip inside a row.
- A row action is one icon button: pencil to edit or override, trash to remove,
  undo to clear a draft value. The `aria-label` carries the verb and the target.
- State is not an action. A state badge carries no border (`secondary`), because a
  border and a pill shape together read as a control. "Stored", "Override",
  "Configured" and a package scope are badges, not buttons.
- Sizes: `icon-sm` for icon actions in rows and toolbars, `icon-xs` only inside an
  `InputGroup`, `xs` for a labelled row action, `default` in a footer. An overlay's
  close button is `ghost` `icon-sm` in the corner, with no fill.

## Interaction

**Overlay motion.** Every popup animates with Base UI's `data-starting-style` and
`data-ending-style`, never `data-open`/`data-closed`: the ending attribute is the
one present while the popup is still mounted, so the close transition actually
runs. Dialogs, popovers, menus, selects and tooltips transition opacity and scale
for 150ms, ease-out opening and ease-in closing; the sheet keeps its directional
slide. The toasts and command palette inherit the same attributes from `Dialog` and
`Popover`.

**Pointer.** Clickable controls carry `cursor-pointer`: the button base, menu and
command items, the select trigger and the checkbox. shadcn's `cursor-default` on
menu and command items is replaced for that reason. A disabled control does not.

**Keyboard.** Built: ⌘B toggles the sidebar, Enter sends, Shift+Enter adds a line,
Esc stops the run or closes the top overlay. Planned with their surfaces: ⌘K
palette (S8), ⌘J right panel (S6), ⌘⇧F files (S6), ↑ prompt recall.

**Escape order.** Top overlay first: dialog → sheet → popover → palette. Only when
nothing is open does Esc reach the run.

**Menus.** A session row's actions exist in a `ContextMenu` and a `DropdownMenu`;
mobile uses a bottom `Sheet`. Destructive items confirm in `AlertDialog`. Popups size
to their content (`w-auto`, `max-w-(--available-width)`, `min-w-(--anchor-width)`),
not to the trigger, so a long model name is never clipped.

**Enabled states must match capability.** No "Reload" button: `/reload` typed in
the composer runs the reload command. No in-session branch switcher
(`navigateTree` is not on the socket). Settings covers what blocks a turn, not every
pi setting: no theme picker, no trust prompt, no OAuth login form. Those say which
terminal command does the job. See `docs/reference/pi-sdk.md`.

## Settings page

A full page with its own navigation, not a dialog. The left column carries Back to
app, a search field, then two groups: **Deployment** (General, Providers) and
**Resources** (MCP servers, Skills, Packages). Search filters the sections. Below
1280px the navigation becomes a horizontal row under a title bar, so a phone can
reach every section.

Each section is a page title, then grouped cards. A row carries a title, a muted
description and right-aligned actions; forms sit in a card below the list. A section
does not restate what the rows already say. The column is `max-w-5xl`: a narrower one leaves half the page empty.

A form's submit is sized to its label and sits at the right edge of its card, so it
never reads as a long bar across the form. Checkboxes are the shadcn `Checkbox`
inside a `Field orientation="horizontal"`, never a bare `<input type="checkbox">`.

**Form validation.** The shared zod schemas stay the contract, and the form adds
only what it knows: a custom provider needs a name, a base URL and an API family, a URL is
absolute, a token count and a cost are numbers. A failing control gets
`aria-invalid`, its `Field` gets `data-invalid`, and the message sits under the
control in `FieldError`; the first message per field wins. Save stays clickable so a
blank required field can say so, and a blank optional field is left out of the
payload instead of being stored empty.

The settings navigation is the same width as the session sidebar (`SIDEBAR_WIDTH`),
so the column edge does not jump when moving between the app and Settings.

- **General.** Readiness with a Ready or Not configured badge, the agent home, and
  the searchable default model picker, which spans the card so its popup lines up
  with the section instead of hanging off a button on the right.
- **Providers.** A two-pane editor, described below.
- **MCP servers.** Servers from `mcp.json`, with transport, target and enabled
  state. Adding a name that exists replaces it.
- **Skills.** User skills under the agent home, with name, description and
  instructions. Editing reads the file through a REST route; removing deletes only
  that directory.
- **Packages.** Declared packages and an install field that accepts what
  `pi install` accepts.

A write reloads the live engines, so a session that already exists sees the new
provider, MCP server or skill. A failed write is a sentence in the form, never a
silent no-op.

### Provider editor

The page is split. The left column lists only providers that are configured (a
`models.json` entry or a credential), with the model count ("74 models") on the
right. Under the name only a provider pi ships says `pi default`; a custom
provider shows just its name, because its id is usually the same word. The search
field filters that list. **Add provider** at the bottom
opens a picker: a provider pi ships (searchable, configured ones marked) or a custom
one. This is what keeps forty "no credential" rows off the page.

Delete removes the `models.json` entry and, when the key was a stored one, the
credential in the agent home's `auth.json` as well, because the row would otherwise
come back from the credential alone. It is the destructive button in the footer, and
it confirms in `AlertDialog`.

The right column is one provider:

- **Provider**: one field, the display name. The id is derived from it and never
  shown: `CommandCode` becomes `commandcode`, a taken id gets `-2`, and the id is
  fixed after the first save. Names must be unique. A name already carried by a
  configured or pi-shipped provider is refused under the field, because the list
  would otherwise show two rows with the same label.
- **Connection**: the API family, the base URL and the API key. A stored key is
  never sent back. The field's placeholder says a key is saved, and the eye reveals
  only a key typed in this session; a new key replaces the stored one. Under the base URL one
  muted line names the request URL pi composes from it. When the base already ends
  in a path the family appends (`…/provider/v1` for Anthropic Messages, whose client
  adds `/v1/messages`), that line is replaced by a warning and the shorter base to
  use, because pi will follow the base it is given. The warning never rewrites it.
  **Reasoning defaults** is a collapsible that animates its height, and carries the
  provider-wide compatibility fields; a model inherits them unless it sets its own.
- **Custom Headers**: rows, not a `KEY=VALUE` textarea. A stored value is never shown; a
  blank value on a stored row keeps it. A new row needs a name and a value, and
  the form refuses an incomplete row. Adding a row grows it open and removing one
  collapses it, both over 200ms rather than appearing or vanishing.
- **Models**: the group title carries the count ("Models pi ships (29)", "Models
  (74)"). For a provider pi ships, the catalog is read-only and each row offers
  **Override** (`modelOverrides`: name, context, max tokens, cost, input). **Add
  model** or **Fetch models from provider** switches to a custom catalog and asks
  first, because
  saving then replaces pi's catalog. A custom provider edits its `models` list
  directly. Every model can override `api` and `baseUrl` under "Cost and
  compatibility", and a reasoning model gets a **Reasoning effort** section:
  pi's seven levels, each offered or not, with the provider value it sends. A
  blank value keeps pi's default, an unchecked level writes `null`, and a value
  writes that string. Below the levels the compatibility fields choose how the
  level travels: thinking format, effort support, token budget field, reasoning
  content and adaptive thinking for the effective API. A model value overrides the
  provider's reasoning defaults.
- **Fetch models from provider** reads `{base}/models` for the OpenAI families and
  `{base}/v1/models` for Anthropic, server-side with the typed key or the stored
  credential. Google has no shared list shape here, so the button is disabled and
  the form says to add models by hand. The dialog names the URL it reads, and a
  failed fetch names it again with the status. When the list carries
  `supported_endpoints`, a model that only accepts `/messages` is saved with the
  Anthropic API and the base above its `/v1`; a `/responses`-only model gets that
  API. A gateway can therefore mix Claude and OpenAI-shaped models in one provider.
  For an exact id and API that pi also ships, the import copies pi's `reasoning`,
  `thinkingLevelMap` and the Anthropic `forceAdaptiveThinking` switch, so an
  imported Claude already knows how its thinking works.
- **Test** opens a searchable model picker with a level select: No reasoning is
  the connection test, and any pi level sends that level and reports the
  reasoning tokens or thinking characters the provider returned. It probes once
  with no auth header and, when a key is typed or stored, once with that key. The
  result names the model, the level, the credential, the reply, the evidence and
  the round trip, and says whether the endpoint also answers without a key. A
  filled key that fails is an error even when the keyless probe works. A key with
  spaces or line breaks is refused before a request. Nothing is written, and an
  edit clears the result. This costs a few output tokens, unlike Fetch models.
- **Test model** in the add or edit dialog tries that one model before it joins the
  draft, with the same route, values and level select. The level is disabled until
  Reasoning model is on. It reports the same way, and an edit clears it.

The right column is a column, not a page: the form scrolls and the footer stays
pinned to the bottom of the column, so it never floats halfway up a short form.
For a provider that has never been saved the order is **Test**, **Cancel**,
**Save**. Cancel is destructive and asks for confirmation; confirming discards the
draft and returns to the provider list. An existing provider keeps **Test**,
**Delete**, **Save**.

Selection is a route: `/settings/providers/$providerId`, and
`/settings/providers/new` for a custom draft. On a phone the list and the editor are
separate screens; a Back to providers button returns to the list. There is no
enable/disable toggle because pi has no per-provider field for it. When the server
is unreachable while a provider is open, the error appears once, centred in the
editor as a destructive `Alert` with a styled **Back to providers** button; the
left list only says it is waiting, so the same sentence is not shown twice.

## Not-ready notice

When the agent home is unconfigured, every page shows one `Alert` naming the home
and the missing step, plus **Open Settings**. It is deliberately small: no wizard, no
welcome carousel. The settings page behind the link is the whole setup path.

## Open UI questions

Not built, and not decided:

- Whether assistant turns need a header line at all, or the name is noise.
- Whether the right panel should be per-session or per-project.
- Whether the composer's queue chips live above the textarea or inside it.
- Whether diffs in the transcript default to collapsed beyond a size threshold.
