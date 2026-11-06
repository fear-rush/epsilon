# Feedback rules

What the user sees when something is wrong, missing or waiting. Words are not here; they
are `DESIGN.md` → `## Voice`.

### FB-1 · Choose the surface by scope

Do: pick the surface whose scope matches what the message is about.
Don't: invent a surface in a feature.
Enforced by: epsilon/feedback-surfaces

| Scope                             | Surface                                                                                                                                      | Examples                                                                          |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| The whole app                     | the status line: `AppStatus` in `src/app/core/status.tsx`, fed by `useReportStatus`                                                          | server unreachable, page out of date, no model ready, a chat that cannot continue |
| A route crashed or does not exist | `RouteError`, `RouteNotFound` on `StatusView`, inside the shell (`errorComponent`, `notFoundComponent` on the `_app` and `settings` layouts) | a render throws, an address nothing serves                                        |
| A pane's own read                 | `StatusView`: loading, empty, failed, not found                                                                                              | the provider list failed to read, no skills yet                                   |
| A terminal-only extension call    | Settings → Diagnostics → Extension UI                                                                                                        | a custom editor, footer or widget the browser cannot mount                        |
| A section, form or card           | `Notice` at the top of what it is about                                                                                                      | save refused, pi could not parse `settings.json`, a project overrides this server |
| Beside one control                | `InlineStatus`                                                                                                                               | Saved, Checking…, connection test failed                                          |
| One field                         | shadcn `FieldError` under the field                                                                                                          | "Use a whole number."                                                             |
| A chat turn                       | the transcript's error entry and `RunStatus`                                                                                                 | the model refused, retrying in 4 s, compaction failed                             |
| Before a destructive action       | `confirm-dialogs` (`AlertDialog`), `variant="destructive"`                                                                                   | delete a chat, remove a provider                                                  |

### FB-2 · One tone vocabulary

Do: use `Tone = "neutral" | "info" | "success" | "warning" | "danger"` from
`src/app/components/patterns/status/status-tone.ts` in `StatusView`, `Notice`, `InlineStatus` and the status line.
Don't: define another tone set.
Enforced by: tsc

### FB-3 · A recovery in progress is never red

Do: tone `info` with a spinner ("Restarting the engine…").
Don't: tone `danger` for something the app is already fixing.
Enforced by: review

### FB-4 · A spinner always has words

Do: show `LoadingState` with a label in a waiting pane or section; a spinner elsewhere sits beside words (a pending `Button`, a status row).
Don't: show a spinner without words.
Enforced by: review

### FB-5 · An Epsilon notice travels as a code

Do: send a code and give it words on the client (not true until step 06; `review` until then).
Don't: send finished sentences from the server for a notice Epsilon raises.
Enforced by: review

### FB-6 · One condition, one surface

Do: show a lost connection on the status strip only.
Don't: also show it in a notice, a pane or a toast.
Enforced by: review

### FB-7 · Errors get their words from the translator

Do: `errorView(error)` in `src/app/components/patterns/status/error-view.ts` returns `{ tone, title, line, icon }` and switches exhaustively on the protocol's tagged errors (union derived from `src/protocol/errors.ts`); `StatusView` and `Notice` take `error={…}`, and an explicit title may name the action more precisely. A failure the page names itself is a tagged error in `src/app/core/errors.ts`.
Don't: render `error.message` in a feature; fill `message` on the protocol's errors (it is empty by design, and the words would live in two places).
Enforced by: tsc

pi's data messages (a test result, a login question, a parse problem) are not thrown errors and stay text.

### FB-8 · No toasts

Do: let success be the changed UI; where the change is not visible, show `InlineStatus` "Saved".
Don't: show a message that disappears (invariant 10: silence is a bug).
Enforced by: review

### FB-9 · Titles say what did not happen

Do: "Couldn't save the provider", "Couldn't read MCP servers", "Session not found"; the line gives the reason in pi's words when there is one, then what to do.
Don't: "Error", "Failed:", stack traces, error tags or JSON in the UI (they go to the log and Diagnostics).
Enforced by: review

### FB-10 · Colour only through the surfaces

Do: report through the status components.
Don't: in `src/app/features/` or `src/app/routes/`, import `@/components/ui/alert` or write `text-destructive`, `text-warning`, `text-success`, `text-info` or their `bg-`/`border-` forms.
Enforced by: epsilon/feedback-surfaces

## Not covered here

A condition no surface above fits: stop and ask.
