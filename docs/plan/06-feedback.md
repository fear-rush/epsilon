# 06 Feedback: one look, one strip, notices as codes

Fixes the owner's four screenshots: the red engine banner, the yellow drift banner, "This
page reconnects on its own", "This page met a problem it cannot explain". Evidence:
[findings.md → Feedback](findings.md#feedback).

Rules this step makes true: `DESIGN.md` `notice-*`, `status-strip`, `status-row`, VO-1…4;
`docs/rules/feedback.md` FB-3…FB-6.

## Do

1. **One look for every tone** in `src/app/components/ui/alert.tsx`. Every variant
   (`default`, `info`, `success`, `warning`, `destructive`) gets the `notice-{tone}` recipe
   from `DESIGN.md`: tinted border and fill, the icon in the tone colour, title and body in
   `foreground`/`muted-foreground`. Today `destructive` and `success` are plain cards with
   coloured text while `info` and `warning` are tinted. Leave a one-line comment that this
   is a local change to shadcn source.
2. **`Strip` in `src/app/core/status.tsx`** takes its tone classes from the same map as
   `Notice` (move the map to `components/patterns/status/status-tone.ts` and export it).
   Its own `TONE` map near line 140 goes.
   - Check the first connection. In this plan's audit a fresh load showed "Reconnecting to
     the server…" before the page had ever connected. Read `useAppHealth`: if the first
     attempt reports `reconnecting`, add a `connecting` state that draws nothing for the
     first 1 s and then "Connecting…". Cover it in `test/e2e/reconnect.e2e.ts`.
3. **One condition, one surface (FB-6).** A lost connection is the strip only. Where a pane
   shows `StatusView` for `ServerUnreachable`, it shows its last data or its loading state
   instead. Find the call sites by searching for `ServerUnreachable` and for `StatusView`
   with `error=`.
4. **New `src/app/components/patterns/status/status-row.tsx`**: icon or `Spinner`, text,
   optional action, `rounded.card`, `border`, `bg-background`, `pad-item`. Replace the five
   copied `rounded-xl border bg-background px-3 py-2` blocks in
   `src/app/features/conversation/run-status.tsx` with it. `Task`, `Terminal` and `Queue`
   stay inside their rows.
5. **Notices move into `RunStatus`.** Delete `ChatNotices` from
   `src/app/features/conversation/session-view.tsx` (~line 306). `RunStatus` takes the last
   three notices and draws each as a `StatusRow` in the same column as the composer
   (today `max-w-4xl`, which equals `max-w-content`; use `max-w-content` in both). Give `RunStatus` rows `animate-enter-rise`. A notice is the row's text, not a
   title.
6. **Epsilon's own notices become codes (FB-5). Gate G2: ask before bumping the protocol.**
   - In `src/protocol/conversation/frames.ts`, `NoticeFrame` becomes a union:
     `{ t: "notice", id, kind, source: "pi", text }` for pi's and extensions' words, and
     `{ t: "notice", id, kind, source: "epsilon", code, data? }` for Epsilon's own.
     `code` is a `Schema.Literals([...])` of every Epsilon notice.
   - Inventory every place Epsilon writes notice text: search `src/backend/` and
     `src/engine/` for `kind: "error"`, `kind: "warning"`, `kind: "info"` and the notice
     helpers in `src/engine/session.ts`. Known so far: `supervisor.ts` lines ~106, 168, 198,
     208; `registry.ts` ~205; `session.ts` ~1550 (drift). Each becomes a code with its
     variable parts in `data`.
   - New `src/app/components/patterns/status/notice-view.ts`: an exhaustive switch from
     code to `{ tone, text, action? }`, like `errorView`, so a new code does not type-check
     without words.
   - The words, per VO-1…4:

     | Code (suggested)    | Tone                                  | Text                      | Action      |
     | ------------------- | ------------------------------------- | ------------------------- | ----------- |
     | `engine-restarting` | info + spinner                        | Restarting the engine…    | —           |
     | `engine-crash-loop` | danger                                | This chat keeps crashing  | Diagnostics |
     | `drift`             | warning                               | Changed in another window | Reload      |
     | others              | from the inventory, written to VO-1…4 |                           |             |

   - Drift today appears twice: `RunStatus` has a row with Reload (`run-status.tsx` ~95)
     and the engine also sends a notice. Keep the row; the engine stops sending the notice
     text, and the client does not draw a `drift` notice when `state.drift` is set.
   - Bump `PROTOCOL_VERSION` in `src/protocol/rpc.ts`.
7. **`errorView` words** in `src/app/components/patterns/status/error-view.ts`:

   | Case                | Title                    | Line                          | Action                 |
   | ------------------- | ------------------------ | ----------------------------- | ---------------------- |
   | `ServerUnreachable` | Reconnecting…            | —                             | —                      |
   | `UNKNOWN`           | Something went wrong     | —                             | Try again, Diagnostics |
   | `EngineCrashLoop`   | This chat keeps crashing | —                             | Diagnostics            |
   | `PageOutOfDate`     | Epsilon was updated      | —                             | Reload                 |
   | `HandshakeRefused`  | Can't use this server    | —                             | Reload                 |
   | `EngineStopped`     | The chat stopped         | Send a message to restart it. | —                      |

   Actions are buttons passed by the caller; `ErrorView` may gain an optional
   `actions: ("retry" | "diagnostics" | "reload")[]` that `StatusView` renders. Every other
   case: check against VO-1…3 and shorten only where it breaks one.

8. **Spinner with words (FB-4).** `src/app/features/settings/mcp/mcp-registry-browser.tsx`
   shows a bare spinner while the registry loads; use `LoadingState` ("Loading servers…").
   Search `src/app/features` for other `<Spinner` outside a `Button` and fix each the same
   way, or move it into a `StatusRow`.

## Don't

- Don't change pi's or an extension's notice text; only Epsilon's own become codes.
- Don't add toasts.
- Don't change layout outside the strip, the composer column and `alert.tsx`.

## Done when

- `bun run check` passes; report the duration.
- `bun run test:e2e` specs `crash`, `reconnect`, `foreign-writer` pass, updated for the new
  words (assert the new words; do not delete assertions).
- Screenshots, light, all read by you. With playwright-cli (step 04 rules): a chat with
  `engine-restarting`, a chat with drift (one row, no duplicate), the server stopped
  (strip only, no centred "Server not reachable"), a settings save refused (`Notice` in
  its new look), Add MCP server open (labelled loading). With `bun run shoot`: an address
  nothing serves, and any route that shows the new copy.
- `docs/rules/feedback.md` FB-5 and FB-6 say `Enforced by:` the test or type that now
  covers them.

## Stop and ask when

- G2, before the protocol bump.
- A notice in the inventory has words that come from pi rather than Epsilon and you cannot
  tell which.
