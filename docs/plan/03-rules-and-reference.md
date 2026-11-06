# 03 Rules, map, decisions, pi, tasks

Fill the skeleton from the archived docs. Facts are **moved, not recalled**: every
sentence you write is traceable to an archived file, the code, or this plan. When you
cannot trace it, leave it out.

Sources are in `archive/docs-2026-11/`.

## Rule format (all `docs/rules/*`)

```markdown
### FB-3 · A recovery in progress is never red

Do: tone `info` with a spinner ("Restarting the engine…").
Don't: tone `danger` for something the app is already fixing.
Enforced by: review
```

ID prefixes: `SV` server, `CL` client, `FB` feedback, `TS` testing. IDs are never reused;
a deleted rule leaves a gap. **Enforced by** names a lint rule (`epsilon/design-tokens`), a
test path, `tsc`, or `review`. Every file ends with
`## Not covered here` → "stop and ask".

## Do

1. **`docs/rules/server.md`** (≤ 150 lines), from `effect.md`, plus the "Add to a root"
   text step 02 parked there.
   - Each `effect.md` bullet becomes one `SV-n` rule. The Do/Don't table becomes the rules'
     Do/Don't lines. Keep the API names exactly (they were checked against `effect` 4.1.x).
   - Enforced by: invariant 8 is `epsilon/effect-only-io`; sleeps are
     `epsilon/no-real-sleep`; cross-feature imports are `epsilon/no-feature-internals`.
     Find the rest in `.oxlintrc.json`, or write `review`.
   - Delete the `## To reshape` heading when done.
2. **`docs/rules/client.md`** (≤ 150 lines), from ARCHITECTURE's "File rules", "Where state
   lives" (client rows), "Request flow", and the parked "Add to a root" client part.
   - Component layers: `ui/` (shadcn source; a local change is commented where it is
     made), `ai-elements/`, `patterns/` (what features compose; **imports no feature**),
     `editor/`, `features/<name>/`, `core/`.
   - File rules as `CL-n`, unchanged in meaning.
   - Styling: one line pointing at `DESIGN.md`; no style rules in this file.
3. **`docs/rules/feedback.md`** (≤ 150 lines), from ARCHITECTURE's "Feedback surfaces" and
   the decision "A refusal's words come from the translator".
   - The surface table (scope → component → example) as `FB-1`.
   - The tone vocabulary, the translator (`errorView`), "no toasts", "features never render
     `error.message`" as rules.
   - Add, as written here: **FB-3** (above). **FB-4**: a waiting section shows
     `LoadingState` with a label; a spinner never appears without words. **FB-5**: an
     Epsilon notice travels as a code and gets its words on the client (step 06 makes this
     true; mark it `Enforced by: review` until then). **FB-6**: one condition, one
     surface; a lost connection is the status strip only.
   - Words are not here; they are `DESIGN.md` → `## Voice`. Link it.
4. **`docs/rules/testing.md`** (≤ 150 lines), from the parked AGENTS.md text: deadlines,
   `limit.ts`, killing processes, `EPSILON_AGENT_HOME`, check-by-change, budgets. As
   `TS-n` rules. Delete the `## To reshape` heading.
5. **`docs/map.md`** (≤ 150 lines), from ARCHITECTURE's runtime shape, roots, inside a
   server feature, request flow, live chat flow, where state lives. Keep the ASCII diagram
   and the tables; turn paragraphs into numbered steps or table rows. No rules in this
   file; a sentence with "must", "never" or "always" belongs in `rules/`.
6. **`docs/decisions/`**: one file per `##` heading of `DECISIONS.md` (about 40).
   - Name: `NNN-kebab-title.md`, numbered in the archived file's order.
   - Body, ≤ 30 lines: `# Title`, `**Decision**` (one paragraph), `**Why**`,
     `**Rejected**` (the old "Not:" lines). Drop narrative and dates unless a date anchors
     a measurement.
   - A decision about how something **looks** (row actions on hover, the rail's gutter,
     a run of steps is one row) is not a decision file. Put one line in
     `docs/plan/README.md` → "Noticed while working": `<title> → DESIGN.md components
     (step 05)`.
   - `docs/decisions/README.md`: one line per file, `NNN · title · one-sentence decision`.
     This is the index agents read; keep it under 60 lines.
7. **`docs/pi/`**: split `pi-sdk.md` by its `##` headings. Move text **verbatim**; only
   headings and links change.

   | File           | From `pi-sdk.md` sections                                     |
   | -------------- | ------------------------------------------------------------- |
   | `embedding.md` | intro, Embedding                                              |
   | `events.md`    | Events                                                        |
   | `writers.md`   | Writers: what the SDK can and cannot save                     |
   | `resources.md` | Skills, Context files and the system prompt, API family paths |
   | `files.md`     | Session files the index reads, Files in the agent home        |
   | `trust.md`     | Project trust                                                 |
   | `cli.md`       | The CLI, for what an embedding host does not do               |
   | `traps.md`     | Traps                                                         |
   | `upgrading.md` | Upgrading pi                                                  |

   `docs/pi/README.md`: one line per file and the rule "If it is not in these files, pi
   does not expose it (invariant 4)." The verbatim check: the total word count of
   `docs/pi/*.md` minus the README is within 2% of `pi-sdk.md`'s.

8. **`docs/tasks/`**: one file per open item of the archived `NEXT.md`, plus the template.
   - `README.md`: the template and the rule "a task file is deleted in the commit that
     finishes it".

     ```markdown
     # <what is wrong or missing, as a sentence>

     Do: …
     Don't: …
     Done when: <a command, a file state or a screenshot>
     Stop and ask when: …
     ```

   - Open items today: the first-paint bundle budget (392.8 KiB against 315; the owner
     picks between deferring the palette and model menu, or resetting the budget), the
     owner's day on `dev:host`, the deferred feedback screenshots, the merge to `main`, a
     failed step's line saying `failed` twice. Facts only from `NEXT.md`, without its
     history paragraphs.

## Don't

- Don't add a rule, fact or decision that is not in the archive, the code or this plan.
- Don't keep the archived wording where it narrates ("Built at five commits…"); keep the
  fact.

## Done when

- Every file is within its size limit (`wc -l`).
- Every `rules/*` rule has an ID, Do, Don't and Enforced by.
- The pi word-count check passes.
- A search of `docs/` (not `archive/`, not `docs/plan/`) finds no link to a file that does
  not exist.
- `bun run format:check` passes.

## Stop and ask when

- Two archived docs disagree on a fact.
- A rule cannot fit Do/Don't without losing meaning.
