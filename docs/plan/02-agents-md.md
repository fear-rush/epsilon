# 02 AGENTS.md: root and per folder

The root file loads in every session, so it holds only what every task needs. Folder files
load when an agent works in that folder, so rules reach only the code they govern.

## Do

1. Rewrite `AGENTS.md`, at most 80 lines, in exactly these sections:

   | Section              | Content                                                                                                                                                                                                                                                                                                                                                                 |
   | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `# epsilon`          | Three lines: what it is (web dashboard for the pi agent; one Bun process, one socket, one engine per live chat; Epsilon owns the agent home).                                                                                                                                                                                                                           |
   | `## Map`             | The six roots, one line each (from today's "Layout" section), and "details: `docs/map.md`".                                                                                                                                                                                                                                                                             |
   | `## Invariants`      | Today's twelve invariants, kept in meaning, each one or two lines. Replace doc links with the new homes from step 01. Add: **13. The repository wins over memory, chat and archive. If they disagree, follow the repository and fix the other.**                                                                                                                        |
   | `## Commands`        | Today's command table, unchanged except removing commands that do not exist in `package.json`.                                                                                                                                                                                                                                                                          |
   | `## Before you edit` | The routing table: "about to… → read first". Rows: anything pi → `docs/pi/`; server/engine code → `docs/rules/server.md`; client code → `DESIGN.md` + `docs/rules/client.md`; an error/empty/loading state → `docs/rules/feedback.md`; a choice that sounds obvious → `docs/decisions/`; what to work on → `docs/tasks/`; checks and budgets → `docs/rules/testing.md`. |
   | `## How to work`     | At most 10 bullets: one task at a time; done needs the evidence the task names; same commit for code, tests, docs and the task's deletion; never `oxlint-disable`/`@ts-expect-error`/`as unknown as`/`.skip` to get green; report commands, results, durations, what was skipped. The rule levels (Invariant / Role / Default) in three lines.                          |
   | `## Stop and ask`    | Today's four triggers, plus: a rule seems to block a feature (propose a new role or a `// ui:` default deviation instead of working around it).                                                                                                                                                                                                                         |

   Move everything else out:
   - Deadlines, `scripts/limit.ts`, killing processes, `EPSILON_AGENT_HOME` for manual
     runs, "Check by change" → `docs/rules/testing.md` (step 03 writes it; for now, move
     the text there verbatim under a `## To reshape` heading).
   - "Add to a root" → `docs/rules/server.md` and `docs/rules/client.md` (same: verbatim
     under `## To reshape`).
   - "Start here" → gone; `docs/tasks/` replaces it.

2. Add folder files. Each `AGENTS.md` is at most 25 lines; each `CLAUDE.md` is the single
   line `@AGENTS.md`, so Claude Code loads it when working in that folder.

   | Folder          | AGENTS.md says                                                                                                                                                                   |
   | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `src/app/`      | Read `DESIGN.md`, `docs/rules/client.md`, `docs/rules/feedback.md`. The four component layers in one line each. "A UI change ends with a screenshot you read (`bun run shoot`)." |
   | `src/backend/`  | Read `docs/rules/server.md`. Invariants 1, 5, 8, 9, 11 restated in one line each, with their numbers.                                                                            |
   | `src/engine/`   | Read `docs/rules/server.md` and `docs/pi/`. Invariants 1, 4, 8 restated.                                                                                                         |
   | `src/protocol/` | Schema only; no `node:*`, React or services; a new error needs words in the client translator (FB rule).                                                                         |
   | `test/`         | Read `docs/rules/testing.md`. Budgets in one line.                                                                                                                               |

3. Verify Claude Code's loading of a folder `CLAUDE.md`: open a new session, read a file in
   `src/app/`, and confirm the folder file appears in context. Record the result in one
   line under `## How to work` (`Folder rules load when you open a file in that folder.`).
   If it does not load, say so in the report and keep the routing table as the fallback.

## Don't

- Don't add rules that are not already in today's `AGENTS.md` or this plan.
- Don't link to `docs/plan/` from `AGENTS.md`; the plan is temporary. Link `docs/tasks/`.

## Done when

- `wc -l AGENTS.md` ≤ 80; every folder `AGENTS.md` ≤ 25.
- Every path and `bun run` command named in these files exists (check by hand now; step 04
  automates it).
- `bun run format:check` passes.

## Stop and ask when

- An invariant cannot be kept in two lines without changing its meaning.
