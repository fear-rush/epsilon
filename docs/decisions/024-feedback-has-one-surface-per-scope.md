# Feedback has one surface per scope

**Decision**

An app-wide problem goes to the status line, a crashed route to a route error inside the shell, a pane's state to `StatusView`, a section's message to `Notice`, a control's result to `InlineStatus`, a field's to `FieldError`, a turn's to the transcript. One tone vocabulary, one error translator (`errorView`), no toasts. The rules are in docs/rules/feedback.md.

**Why**

`main` had three tone vocabularies, raw alerts, full-page route errors and ad hoc red text, so the same failure looked different on each page.

**Rejected**

Toasts. A message that disappears is a failure nobody saw.
