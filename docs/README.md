# Docs

An index. Read the file your task needs, not all of them.

| Read                                   | when you are about to…                         |
| -------------------------------------- | ---------------------------------------------- |
| [map.md](map.md)                       | learn what exists: runtime, roots, flows       |
| [rules/server.md](rules/server.md)     | write server, engine or runtime code           |
| [rules/client.md](rules/client.md)     | add or move a file, or write UI code           |
| [rules/feedback.md](rules/feedback.md) | show an error, warning, empty or loading state |
| [rules/testing.md](rules/testing.md)   | write or run a test                            |
| [../DESIGN.md](../DESIGN.md)           | choose a color, size, radius or other token    |
| [pi/](pi/README.md)                    | touch anything pi                              |
| [decisions/](decisions/README.md)      | propose an option that sounds obvious          |
| [tasks/](tasks/README.md)              | find out what is left to do                    |

## Doc rules

1. One kind per file: **map** (what exists), **rules** (what to do), **reference** (pi, as
   installed), **decision** (why, and what was rejected), **task** (work not done yet).
2. Every rule has an ID (`FB-3`), a **Do**, a **Don't**, and **Enforced by**: a lint rule
   name, a test path, or `review`.
3. Size limits: `AGENTS.md` <= 80 lines; a folder `AGENTS.md` <= 25; `rules/*` <= 150;
   `map.md` <= 150; a decision <= 30; a task <= 40.
4. A finished task's file is deleted in the commit that finishes it. No history in docs;
   history is git.
5. Never copy code or file lists into a doc. Name the path; the reader opens it.
6. Code wins over docs. A doc that disagrees is fixed in the same commit.
