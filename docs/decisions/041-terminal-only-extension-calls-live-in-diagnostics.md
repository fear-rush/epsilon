# Terminal-only extension calls live in Diagnostics

**Decision**

`setFooter(undefined)`, `setHeader(undefined)` and `setEditorComponent(undefined)` are clears: they restore the built-in UI and succeed without a notice. A call the browser cannot serve (a custom editor, footer or header, a component widget, raw terminal input, a terminal-only dialog) is recorded on the running engine and listed under Settings → Diagnostics → Extension UI, together with what the page uses instead. It does not become a warning in the chat.

**Why**

The chat showed one card per method every time it opened, and the same three alerts buried the conversation with a gap the reader could not fix from there. The status bar was only clearing its footer, so that warning was false. The paster's user-visible job, image paste, is already the composer's paste and paperclip. Diagnostics is where a capability gap belongs: visible, specific and away from the conversation.

**Rejected**

Pretending `mode` is `tui`, which would invite every terminal component into a page that cannot draw it. Hiding a gap that the page truly has. Keeping a custom editor factory that is never mounted, or a raw-input subscription that is never called.
