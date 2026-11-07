# Client rules

Where UI files go and how they compose. Tokens, colors, sizes and motion are in
`DESIGN.md`; this file has no style rules.

## Layers

### CL-1 · Five component layers

Do: put shadcn registry source in `src/app/components/ui`, copied AI Elements (agent steps, plans, tools, terminals, tests, file trees, chat primitives) in `ai-elements`, what features compose in `patterns`, markdown and highlighting in `editor`, and the rest in `features/<name>/` and `core/`.
Don't: put a feature's code in a shared layer.
Enforced by: review

### CL-2 · `patterns` imports no feature

Do: lift code to `components/patterns/`, `hooks/` or `lib/` when a second feature needs it.
Don't: import a feature from `patterns`; reach into a sibling feature.
Enforced by: epsilon/no-feature-internals (a file under `src/app/components/` importing any `@/features/*` is an error; settings' `scope-tabs` and `list-pane` live in `features/settings/shell/`)

### CL-3 · A local change to `ui/` is explained where it is made

Do: comment the change in `components/ui`; when a registry class string is rewritten, diff it against `shadcn view`.
Don't: retype a registry class string from memory (a dropped `[&>svg]:size-3.5` once blew a checkbox tick up to 24px).
Enforced by: review

### CL-4 · Compose installed components, with Base UI

Do: compose the installed shadcn components; use `render={<Button />}`; use `Message`, `Trace`, `CodeBlock`, `Marker` for what they mean.
Don't: use `asChild`; fake chat primitives with divs.
Enforced by: review

### CL-5 · A transcript step is an AI element

Do: `Reasoning` for thinking, `Plan` for calls known up front, `Task` for a live run, `Tool`/`Terminal`/`Test Results`/`Stack Trace`/`Subagent` for a call's result, `Chain of Thought` for the turn's summary; the feature supplies the data.
Don't: draw a step's shape in a feature.
Enforced by: review

### CL-6 · One rule owns the pointer

Do: let the base rule in `index.css` own the pointer; it covers buttons, links, labels and the roles Base UI draws as spans.
Don't: add `cursor-pointer`, `cursor-default` or `cursor-not-allowed` to a component, or expect a base rule to override a registry utility (`cursor-default` on a `ui/` file beats it). `cursor-text` and `cursor-help` stay: they mean typing and a definition, not a click.
Enforced by: review

### CL-7 · Styling goes through tokens

Do: read `DESIGN.md` for any color, size, radius or motion.
Don't: write raw sizes or colors in feature code.
Enforced by: epsilon/design-tokens

## Files

### CL-8 · A file is one concept read top to bottom

Do: keep private helpers and subcomponents in it.
Don't: split a concept across files to shorten one.
Enforced by: review

### CL-9 · A file earns its own place

Do: give a file its own place when it is a public surface, an I/O boundary, pure logic tested on its own, something with its own state, or code used by two modules.
Don't: add a file that only re-exports or wraps one call; add an `index.ts` barrel unless the folder is a public surface for another root.
Enforced by: review

### CL-10 · No folder for one file

Do: add a subfolder when about four siblings share a role.
Don't: make a folder for a single file.
Enforced by: review

### CL-11 · Extract on the third use

Do: on the second feature's need, lift to `src/domain/`, `platform/`, `components/patterns/`, `hooks/` or `lib/`.
Don't: reach into a sibling feature.
Enforced by: epsilon/no-feature-internals

### CL-12 · Tests sit next to their file

Do: place a test beside the file it tests; shared helpers and fixtures live only in `test/`.
Don't: keep shared fixtures outside `test/`.
Enforced by: review

### CL-13 · What changes together lives together

Do: past roughly 400-500 lines, ask whether the file is still one concept.
Don't: split by a line count; there is no hard limit.
Enforced by: review

## Request flow

### CL-14 · Reach the server through `core/runtime.ts`

Do: call a typed function from `src/app/core/runtime.ts`; render the returned value, or map the error through `errorView`.
Don't: open another connection; the boundary is `src/protocol/rpc.ts` and the page is the only HTTP route.
Enforced by: review

### CL-15 · Invalidate from pushed streams

Do: invalidate on `settings.changes` and `sessions.changes`; on a reload, read `loginState` and attach to the running provider sign-in flow.
Don't: invalidate on a timer; start a second sign-in; treat React Query as the source of truth.
Enforced by: review

## Where state lives

### CL-16 · The browser tab holds transcript, draft and scroll anchor

Do: keep those in the tab; the truth for sessions is pi's JSONL, for the list the derived SQLite index, for Epsilon settings `<home>/.epsilon/settings.json`.
Don't: keep important state only in server memory or only in the browser; a state the code cannot represent is a visible notice, never silence.
Enforced by: review

## Dialogs

### CL-17 · A dialog is `DialogFrame`

Do: `DialogFrame size="sm|md|lg"`, a body of minimum height by size (growing to `80vh`, then scrolling) unless `body="content"`; mount closed and open on the next animation frame; on close wait for the transition, then unmount.
Don't: mount a Base UI dialog already open (it has no motion).
Enforced by: review

### CL-18 · A destructive action confirms

Do: `variant="destructive"` and an `AlertDialog`.
Don't: delete without a confirm.
Enforced by: review

### CL-19 · Every chat list pages by ten

Do: show ten rows, let `Load more` add ten (named for what it loads), and show all matches when searching; sort projects by their newest chat.
Don't: render the whole list, or open a chat as a list change.
Enforced by: review

### CL-20 · A tool result is drawn in its call's card

Do: draw a result whose call is in the loaded window inside that call's card; only a result whose call is outside the window is its own row.
Don't: render a hidden row; it leaves its gap behind.
Enforced by: review

## Not covered here

Anything these rules do not name: stop and ask.
