# 01 Archive the old docs, build the skeleton

No code changes. The repository builds and passes exactly as before.

## Do

1. Move the old docs with `git mv` (keeps history):
   - `docs/README.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/NEXT.md`,
     `docs/effect.md`, `docs/pi-sdk.md` → `archive/docs-2026-11/`.
   - Do **not** move `docs/plan/` (this plan).
2. Add `archive/docs-2026-11/README.md`, at most 10 lines: what these files were, the date,
   "nothing here is an instruction", and a link to `../../docs/README.md`.
3. Add one line to `archive/README.md` listing `docs-2026-11/`.
4. Create the empty skeleton. Each file holds only a `# Title` and one line saying which
   step fills it:

   ```
   docs/
     README.md          (filled in this step, see below)
     map.md
     rules/server.md  rules/client.md  rules/feedback.md  rules/testing.md
     pi/README.md
     decisions/README.md
     tasks/README.md
   ```

5. Write `docs/README.md` now, in full. It is an index, at most 40 lines:
   - One table: file → "read when you are about to…". Same rows as the routing table in
     step 02, plus `DESIGN.md`, `docs/pi/`, `docs/decisions/` and `docs/tasks/`.
   - The doc rules (copy these, they bind every later step):
     1. One kind per file: **map** (what exists), **rules** (what to do), **reference**
        (pi, as installed), **decision** (why, and what was rejected), **task** (work not
        done yet).
     2. Every rule has an ID (`FB-3`), a **Do**, a **Don't**, and **Enforced by**: a lint
        rule name, a test path, or `review`.
     3. Size limits: `AGENTS.md` ≤ 80 lines; a folder `AGENTS.md` ≤ 25; `rules/*` ≤ 150;
        `map.md` ≤ 150; a decision ≤ 30; a task ≤ 40.
     4. A finished task's file is deleted in the commit that finishes it. No history in
        docs; history is git.
     5. Never copy code or file lists into a doc. Name the path; the reader opens it.
     6. Code wins over docs. A doc that disagrees is fixed in the same commit.
6. Fix every link that pointed at a moved file: search the repository for
   `docs/ARCHITECTURE`, `docs/DECISIONS`, `docs/NEXT`, `docs/effect`, `docs/pi-sdk`,
   `docs/README`. Outside `archive/`, each one points at the new skeleton file that will
   hold that topic (see the table below), even though that file is still empty.

   | Old topic                           | New home                              |
   | ----------------------------------- | ------------------------------------- |
   | ARCHITECTURE: runtime, roots, flows | `docs/map.md`                         |
   | ARCHITECTURE: UI rules, feedback    | `DESIGN.md`, `docs/rules/feedback.md` |
   | ARCHITECTURE: file rules            | `docs/rules/client.md`                |
   | DECISIONS                           | `docs/decisions/`                     |
   | NEXT                                | `docs/tasks/`                         |
   | effect.md                           | `docs/rules/server.md`                |
   | pi-sdk.md                           | `docs/pi/`                            |

   Lint messages in `tools/oxlint/` that cite a doc are links too.

7. **Gate G1, ask first.** Claude's memory for this project lives in
   `~/.claude/projects/-Users-maryln-Developer-epsilon/memory/`. With the owner's yes:
   - Delete `redesign-plan-2026-11.md`, `refactor-architecture-decisions.md` and
     `skills-settings-design.md`. They contradict the repository: an OpenAPI REST client,
     "main branch only", `.sandbox/refactor/`, `docs/PARITY.md`, `shared/src/…`.
   - In the remaining files, replace every path that no longer exists, and remove their
     lines from `MEMORY.md`.

## Don't

- Don't rewrite or summarise any archived file. They move as they are.
- Don't fill the skeleton files beyond their title line; steps 02, 03 and 05 do that.

## Done when

- `git status` shows only renames, the new skeleton, link fixes and the archive README.
- A search outside `archive/` for the six old doc paths finds nothing.
- `bun run format:check` and `bun run lint` pass (lint messages may name docs).
- With G1 approved: no memory file names a path that does not exist.

## Stop and ask when

- A link's topic has no row in the table above.
