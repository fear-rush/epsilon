# ADR-0002: Epsilon owns its UI contract

- Status: Accepted
- Date: 2026-10-28

## Context

pi's extensions describe their interface in terms of pi's terminal UI. An
extension calls `ctx.ui.select`, `ctx.ui.confirm`, `ctx.ui.input`, `ctx.ui.editor`,
`ctx.ui.notify`, `ctx.ui.setStatus`, `ctx.ui.setWidget`, and for anything richer
`ctx.ui.custom` with a component factory that renders terminal lines.

Two of those groups behave very differently over a protocol:

- `select` / `confirm` / `input` / `editor` / `notify` / `setStatus` / `setWidget`
  / `setTitle` / `set_editor_text` are expressible as data, and pi's RPC mode
  already emits them as `extension_ui_request` frames with an answer frame back.
- `ctx.ui.custom` hands over executable terminal components. There is no data
  form of it, and pi's RPC protocol has no frame for it.

## Decision

1. Epsilon renders what pi's RPC protocol expresses. Its dialog set is exactly
   the nine RPC UI methods, no more.
2. Epsilon does not emulate pi's TUI and does not import `pi-tui` for rendering.
3. Epsilon does not implement a compatibility layer for CLI extension UI. The
   extension UI contract it targets is the RPC one.
4. `ctx.ui.custom` is unsupported and must degrade **visibly**: a notice in the
   transcript naming the extension, plus the terminal tab where the extension
   works normally.
5. The terminal tab is a permanent product surface, not a temporary gap filler.
   It is where TUI-only extension behaviour, login, trust, settings and resource
   installation happen.

## Consequences

- Any extension that relies on a custom TUI component is usable only in the
  terminal tab. This is the price of a browsable, linkable, mobile-friendly UI.
- The web client never renders arbitrary terminal output as an interface. ANSI
  appears only as quoted output inside a tool result.
- Unknown extension UI methods must produce a visible unsupported notice, never
  silence. Silent failure is the worst outcome: the agent appears stuck.
- The terminal tab is load-bearing. Removing it turns this decision into a
  capability regression.

## Rejected alternatives

- **Embed the session and render `pi-tui` components headlessly**, as pi-web does
  (a headless terminal stub plus an extension UI bridge). This is what makes
  pi-web's server large and couples it to pi's internal module layout. It also
  renders terminal-shaped dialogs in a browser, which is neither good web UI nor
  the real TUI.
- **A per-extension UI adapter.** The set of extensions is open-ended, so the
  adapter cost has no ceiling. pinomad's ADR-0001 rejects the same approach for
  the same reason, and its predecessor project stalled on it.

## Revisit if

- pi grows a data-shaped frame for custom UI components.
- A specific extension you depend on becomes unusable without custom UI and the
  terminal tab proves too clumsy for it.
