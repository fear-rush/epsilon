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
5. **Unsupported means visible.** A capability that pi does not expose over RPC
   gets a notice, never a dead control.

## Component inventory

Already installed: `message`, `message-scroller`, `bubble`, `trace`, `code-block`,
`questionnaire`, `empty`, `input-group`, `collapsible`, `select`, `tooltip`,
`alert`, `button`, `input`, `textarea`.

Add, all verified present in the `@shadcn` registry:

```sh
bunx --bun shadcn@latest add sidebar command dropdown-menu context-menu dialog \
  alert-dialog sheet drawer hover-card progress item marker attachment resizable \
  tabs sonner switch badge avatar skeleton separator table radio-group popover kbd spinner
```

Do not add: `scroll-area` (forbidden for threads by the chat rules), `toast` (use
`sonner`), `form`/`field`/`label` (no settings forms), `slider`, `toggle`,
`toggle-group`, `input-otp`, `menubar`, `navigation-menu`, `pagination`,
`breadcrumb`, `calendar`, `carousel`, `chart`, `checkbox`, `combobox`,
`native-select`, `direction`, `button-group`, `aspect-ratio`.

Composition is **base**, not radix: `render={<Button />}`, never `asChild`. A
trigger must stay a real button; wrap the `TraceLine`, never replace the trigger
with it.

## Concept to component

| Concept                            | Component                                                                                                     | Notes                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Thread                             | `MessageScrollerProvider` → `MessageScroller` → `Viewport` → `Content` → `Item`                               | `autoScroll`; `scrollAnchor` on the user turn; `MessageScrollerButton` last |
| User turn                          | `Message align="end"` + `Bubble variant="muted"`                                                              | Bubble only here                                                            |
| Assistant turn                     | `Message align="start"` + `MessageContent`                                                                    | Markdown body, no bubble                                                    |
| Thinking                           | `Trace` → `TraceLine` with duration in `TraceDescription`                                                     | `shimmer` on the title while running; collapses on finish                   |
| Tool, running                      | `TraceLine status="running"`                                                                                  | Bare line while there is nothing to open                                    |
| Tool, finished                     | `TraceCollapsible` → trigger wraps the line → `TraceCollapsibleContent` → `CodeBlock size="sm" wrap max-h-64` | Never `<pre>`                                                               |
| Diff                               | `CodeBlock` + `CodeBlockLine variant="added"/"removed"`                                                       | One column under 720px, two above                                           |
| Unknown / MCP tool                 | Same as a tool, generic field rows                                                                            | Name, args, output, status. Never blank                                     |
| Notice, compaction, branch summary | `Marker variant="separator"`                                                                                  | Not a trace row                                                             |
| Approval or blocked tool           | `Item` + `ItemActions` inline; `AlertDialog` if it blocks the run                                             | Prompt, not activity                                                        |
| Extension select                   | `Dialog` + `Command`, or `Questionnaire` for several questions                                                | `QuestionnaireProgress` when multi-step                                     |
| Extension confirm                  | `AlertDialog`                                                                                                 | Destructive variant when pi marks it                                        |
| Extension input / editor           | `Dialog` + `Input`; `Sheet` + monospace `Textarea`                                                            |                                                                             |
| Extension status / widget          | `Badge` in the header; widget rows above the composer                                                         | Widget is text, not UI                                                      |
| Session list                       | `Sidebar` + `SidebarGroup` per project                                                                        | Running: pulsing `skeleton` dot; needs-input: `Badge`                       |
| Session actions                    | `ContextMenu` (desktop), mirrored `DropdownMenu` on `…`, `Sheet` menu on mobile                               |                                                                             |
| Search everything                  | `Command` in `Dialog`, ⌘K                                                                                     | Sessions, files, slash commands, actions                                    |
| Slash palette, `@` files           | `Command` in `Popover` anchored to the composer                                                               | Server-driven from `get_commands`                                           |
| Model, reasoning                   | two `DropdownMenu` + `DropdownMenuRadioGroup`                                                                 |                                                                             |
| Context usage                      | `HoverCard` + `Progress`                                                                                      |                                                                             |
| Attachments                        | `Attachment` + `AttachmentGroup` in `InputGroup`                                                              | `state` wired to real progress                                              |
| Composer                           | `InputGroup` + `InputGroupTextarea`, addons at `block-start` and `block-end`                                  |                                                                             |
| File tree                          | nested `Collapsible` per folder, `Button` per file                                                            | A single read file in a turn stays a `TraceLine`                            |
| Preview                            | `Resizable` + `Tabs` (Preview / Source / Diff) + sandboxed iframe                                             |                                                                             |
| Terminal                           | `Tabs` + xterm, `Button` row for touch keys                                                                   |                                                                             |
| Empty state                        | `Empty` + suggestion `Button`s                                                                                |                                                                             |
| Toasts, errors                     | `sonner`, `Alert variant="destructive"`                                                                       |                                                                             |
| Keyboard hints                     | `kbd`                                                                                                         | In menus and the palette footer                                             |
| Loading                            | `spinner`                                                                                                     | For attach and file load, not for streaming                                 |

## Layout

**Desktop, ≥1280px.** Three columns. `Sidebar` 260px (collapsible to 0), transcript
`max-w-3xl` centred, right panel `Resizable` 360–720px (files, preview, terminal).

**Tablet, 768–1279px.** Sidebar collapses to an icon rail or a `Sheet`; the right
panel becomes a tab strip over the transcript.

**Mobile, <768px.** One column. Sidebar is a left `Sheet`; the right panel is a
full-screen `Sheet`; composer pinned to the bottom with `InputGroup`; terminal adds
a touch key row (Esc, Tab, arrows, Ctrl+C).

**Header.** Session title inline-editable, run state chip, then actions: files,
preview, terminal, resources, palette. Nothing else. No breadcrumbs, no tabs besides
the ones above.

## Visual states

| State                            | Where it shows                                  | Treatment                                                             |
| -------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------- |
| Idle                             | header chip                                     | muted dot, "idle"                                                     |
| Running                          | header chip + last `TraceLine status="running"` | pulsing dot, `shimmer` text                                           |
| Needs input                      | header chip, session row                        | `Badge` with accent colour; this is the state that must catch the eye |
| Streaming                        | last assistant turn                             | text appends; no spinner, no layout shift                             |
| Compacting                       | header chip                                     | "Compacting…" with a stop control                                     |
| Retrying                         | header chip                                     | attempt count from `auto_retry_*` events                              |
| Error                            | last turn + toast                               | `Alert variant="destructive"`, never a silent stop                    |
| Child exited                     | transcript notice                               | states that the turn was lost, offers reattach                        |
| Disconnected                     | top banner                                      | reconnect in progress, no modal                                       |
| Unsupported UI (`ctx.ui.custom`) | transcript notice                               | names the extension, points at the terminal tab                       |
| Empty session                    | centre                                          | `Empty` with three suggestions                                        |
| No project                       | sidebar                                         | `Empty` with a project picker                                         |

## Density and typography

Starting values:

- Body markdown `text-sm`, `leading-relaxed`, `max-w-3xl`.
- Tool output and diffs `text-[13px]` mono, `max-h-64` with internal scroll.
- Secondary detail (durations, counts, paths) `text-xs text-muted-foreground`.
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
uses a bottom `Sheet`. Destructive items confirm in `AlertDialog`.

**Enabled states must match capability.** No "Reload" control (not an RPC command);
no in-session branch switcher (not an RPC command); no settings form for resources.
See `docs/reference/pi-rpc.md`.

## Open questions from S2

Deciding these needs a real transcript, not a document:

- Whether assistant turns need a header line at all, or the name is noise.
- Whether the right panel should be per-session or per-project.
- Whether the composer's queue chips live above the textarea or inside it.
- Whether diffs in the transcript default to collapsed beyond a size threshold.
