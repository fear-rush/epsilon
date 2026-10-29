# UI

Status: **design.** Covers the visual vocabulary, the layout, and the interaction
rules. Implemented surfaces and their checks are in [plan.md](plan.md). Numbers
marked "starting value" are decisions to adopt now and tune against a real screen,
not laws.

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
   ([ADR-0006](adr/0006-setup-in-the-deployment-terminal.md)).

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

| Concept                            | Component                                                                                                                              | Notes                                                                                                           |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Thread                             | `MessageScrollerProvider` → `MessageScroller` → `Viewport` → `Content` → `Item`                                                        | `autoScroll`; `scrollAnchor` on the user turn; `MessageScrollerButton` last                                     |
| User turn                          | `Message align="end"` + `Bubble variant="muted"`                                                                                       | Bubble only here                                                                                                |
| Assistant turn                     | `Message align="start"` + `MessageContent`                                                                                             | Markdown body, no bubble                                                                                        |
| Thinking                           | `Trace` → `TraceLine` with duration in `TraceDescription`                                                                              | `shimmer` on the title while running; collapses on finish                                                       |
| Tool, running                      | `TraceLine status="running"`                                                                                                           | Bare line while there is nothing to open                                                                        |
| Tool, finished                     | `TraceCollapsible` → trigger wraps the line → `TraceCollapsibleContent` → `CodeBlock size="sm" wrap max-h-64`                          | Never `<pre>`                                                                                                   |
| Diff                               | `CodeBlock` + `CodeBlockLine variant="added"/"removed"`                                                                                | One column under 720px, two above                                                                               |
| Unknown / MCP tool                 | Same as a tool, generic field rows                                                                                                     | Name, args, output, status. Never blank                                                                         |
| Notice, compaction, branch summary | `Marker variant="separator"`                                                                                                           | Not a trace row                                                                                                 |
| Approval or blocked tool           | `AlertDialog` while it blocks the run                                                                                                  | Inline `Item` + `ItemActions` when a prompt does not block                                                      |
| Extension select                   | `Dialog` with one `Button` per option                                                                                                  | Options wrap, so a long one cannot overflow the dialog; a leading glyph from pi is dropped                      |
| Extension confirm                  | `AlertDialog`                                                                                                                          | Destructive variant when pi marks it                                                                            |
| Extension input / editor           | `Dialog` + `Input`; monospace `Textarea`                                                                                               |                                                                                                                 |
| Extension status / widget          | `Badge` in the header; widget rows above the composer                                                                                  | Widget is text, not UI                                                                                          |
| Session list                       | `Sidebar` + `SidebarGroup` per project                                                                                                 | No run indicator; needs-input keeps `Badge variant="warning"`                                                   |
| Session actions                    | `ContextMenu` and `DropdownMenu` on `…`; on mobile the row is already inside a `Sheet`                                                 |                                                                                                                 |
| Deployment card                    | Footer button with avatar, name and a `DropdownMenu` above it                                                                          | Bottom-left, on every page. The menu names the deployment and links to each settings section                    |
| Settings page                      | Full page: own left nav with Back to app and Search, section on the right                                                              | Replaces the session sidebar; not a dialog. One URL per section                                                 |
| Settings rows                      | Row in a divided card: title, muted description, right-aligned actions                                                                 | Secret values are never shown; a blank key keeps the stored one; destructive actions confirm in `AlertDialog`   |
| Settings list row                  | `Link` with the name, the id and the count ("74 models") under it                                                                      | A credential-only provider still lists, so deleting one has to log it out                                       |
| Settings fields                    | `FieldGroup` → `Field` → `FieldLabel` + control + `FieldDescription`                                                                   | `Select` for option sets, never a native `<select>`; `InputGroup` when a button sits inside the field           |
| Search everything                  | `Command` in `Dialog`, ⌘K                                                                                                              | Sessions, files, slash commands, actions                                                                        |
| Slash palette, `@` files           | `Command` in `Popover` anchored to the composer                                                                                        | Server-driven from the snapshot's `commands`; as wide as the composer, three columns: name, description, source |
| Model                              | `DropdownMenu` + `DropdownMenuRadioGroup`, one group per provider                                                                      | 510 models: current provider first, names sorted inside each group                                              |
| Default model, in settings         | `Command` in a `Popover` on a full-width `Button` trigger, one `CommandGroup` per provider                                             | Searchable by provider, name and id; the popup is as wide as the row, not the button                            |
| Permission                         | `DropdownMenu` radio group: Strict, Ask, Yolo                                                                                          | The extension's `/permission <mode>` owns it; the UI shows its own labels                                       |
| Reasoning                          | `DropdownMenu` + `DropdownMenuRadioGroup`                                                                                              | Not built yet                                                                                                   |
| Context usage                      | `HoverCard` + `Progress`                                                                                                               |                                                                                                                 |
| Attachments                        | `Attachment` + `AttachmentGroup` in `InputGroup`                                                                                       | `state` wired to real progress                                                                                  |
| Composer                           | `InputGroup` + `InputGroupTextarea`; white surface, `border-foreground/25`; `block-end` addon holds model, permission, stop and submit | Arrow-up submit; Enter sends, Shift+Enter adds a line, Esc stops                                                |
| File tree                          | nested `Collapsible` per folder, `Button` per file                                                                                     | A single read file in a turn stays a `TraceLine`                                                                |
| Preview                            | `Resizable` + `Tabs` (Preview / Source / Diff) + sandboxed iframe                                                                      |                                                                                                                 |
| Terminal                           | `Tabs` + xterm, `Button` row for touch keys                                                                                            |                                                                                                                 |
| Empty state                        | `Empty` + suggestion `Button`s                                                                                                         |                                                                                                                 |
| Toasts, errors                     | `sonner`, `Alert variant="destructive"`                                                                                                |                                                                                                                 |
| Keyboard hints                     | `kbd`                                                                                                                                  | In menus and the palette footer                                                                                 |
| Loading                            | `spinner`                                                                                                                              | For attach and file load, not for streaming                                                                     |
| Not ready                          | centre, `Alert`                                                                                                                        | Names the missing step and the home, and offers **Open Settings**; the composer is not rendered                 |

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

**Header.** Session title inline-editable, then actions: files, preview, terminal,
resources, palette. No status chips: a session that is loading, disconnected or not
ready says so in the middle of the page, not in the header. Model and permission are
composer controls.

**Sidebar footer.** The deployment card sits at the bottom of the sidebar, the way a
chat app puts its account menu there. It opens a menu above itself, and Settings
opens a full page with its own navigation.

## Visual states

| State                            | Where it shows                    | Treatment                                                                                     |
| -------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------- |
| Idle                             | nowhere                           | No header indicator; the transcript says what happened                                        |
| Running                          | last `TraceLine status="running"` | pulsing line, `shimmer` title only while it runs                                              |
| Loading a session                | centre                            | `Spinner` + "Loading the session…"                                                            |
| Disconnected                     | centre                            | destructive `Alert`, "Reconnecting…"                                                          |
| Permission                       | composer footer                   | `DropdownMenu` trigger: shield, current label; no glyphs from pi                              |
| Needs input                      | dialog, session row               | The blocking dialog is the prompt; the row keeps a `Badge variant="warning"`                  |
| Streaming                        | last assistant turn               | text appends; no spinner, no layout shift                                                     |
| Compacting                       | header chip                       | "Compacting…" with a stop control                                                             |
| Retrying                         | header chip                       | attempt count from `auto_retry_*` events                                                      |
| Error                            | last turn + toast                 | `Alert variant="destructive"`, never a silent stop                                            |
| Engine failed                    | transcript notice                 | states that the turn was lost, offers reattach                                                |
| Not ready                        | centre on every page              | one `Alert` naming the missing step and the home, with Open Settings; no composer is rendered |
| Disconnected                     | top banner                        | reconnect in progress, no modal                                                               |
| Unsupported UI (`ctx.ui.custom`) | transcript notice                 | names the extension, points at the terminal tab                                               |
| Empty session                    | centre                            | `Empty` with three suggestions                                                                |
| No project                       | sidebar                           | `Empty` with a project picker                                                                 |

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

## Interaction

**Keyboard.** ⌘K palette · ⌘B sidebar · ⌘J right panel · ⌘⇧F files · ⌘Enter send
(configurable) · Esc stops the run, else closes the top overlay · ↑ recalls the last
prompt on an empty composer.

**Escape order.** Top overlay first: dialog → sheet → popover → palette. Only when
nothing is open does Esc reach the run.

**Menus.** Every row action exists in a `ContextMenu` and a `DropdownMenu`; mobile
uses a bottom `Sheet`. Destructive items confirm in `AlertDialog`. Popups size to
their content (`w-auto`, `max-w-(--available-width)`, `min-w-(--anchor-width)`), not
to the trigger, so a long model name is never clipped.

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
only what it knows: a custom provider needs a base URL and an API family, a URL is
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
`models.json` entry or a credential), with the id and the model count ("74 models")
under the name; the search field filters that list. **Add provider** at the bottom
opens a picker: a provider pi ships (searchable, configured ones marked) or a custom
one. This is what keeps forty "no credential" rows off the page.

Delete removes the `models.json` entry and, when the key was a stored one, the
credential in the agent home's `auth.json` as well, because the row would otherwise
come back from the credential alone. It is the destructive button in the footer, and
it confirms in `AlertDialog`.

The right column is one provider:

- **Provider**: id, display name, base URL.
- **Connection**: the API family and the API key. A stored key is never sent back;
  the field shows a Stored badge instead.
- **Headers**: rows, not a `KEY=VALUE` textarea. A stored value is never shown; a
  blank value keeps it.
- **Models**: the group title carries the count ("Models pi ships (29)", "Models
  (74)"). For a provider pi ships, the catalog is read-only and each row offers
  **Override** (`modelOverrides`: name, context, max tokens, cost, input). **Add
  model** or **Fetch models from provider** switches to a custom catalog and asks
  first, because
  saving then replaces pi's catalog. A custom provider edits its `models` list
  directly. Every model can override `api` and `baseUrl` under "Cost and
  compatibility".
- **Fetch models from provider** reads `{base}/models` for the OpenAI families and
  `{base}/v1/models` for Anthropic, server-side with the typed key or the stored
  credential. Google has no shared list shape here, so the button is disabled and
  the form says to add models by hand.

The right column is a column, not a page: the form scrolls and the footer with
**Delete** and **Save** stays pinned to the bottom of the column, so it never floats
halfway up a short form.

Selection is a route: `/settings/providers/$providerId`, and
`/settings/providers/new` for a custom draft. On a phone the list and the editor are
separate screens; a Back to providers link returns to the list. There is no
enable/disable toggle because pi has no per-provider field for it.

## Not-ready notice

When the agent home is unconfigured, every page shows one `Alert` naming the home
and the missing step, plus **Open Settings**. It is deliberately small: no wizard, no
welcome carousel. The settings page behind the link is the whole setup path.

## Open questions from S2

Deciding these needs a real transcript, not a document:

- Whether assistant turns need a header line at all, or the name is noise.
- Whether the right panel should be per-session or per-project.
- Whether the composer's queue chips live above the textarea or inside it.
- Whether diffs in the transcript default to collapsed beyond a size threshold.
