# Documentation

Read these documents in order. Each document answers one question.

| Order | Document                                   | Question it answers                                   |
| ----- | ------------------------------------------ | ----------------------------------------------------- |
| 1     | [plan.md](plan.md)                         | What does the product do, and which slice is active?  |
| 2     | [architecture.md](architecture.md)         | Which modules exist, and what does each module own?   |
| 3     | [protocol.md](protocol.md)                 | Which frames travel over the browser socket?          |
| 4     | [ui.md](ui.md)                             | Which component renders which concept?                |
| 5     | [features.md](features.md)                 | Is a feature in scope, and how is it built?           |
| 6     | [deploy.md](deploy.md)                     | How does this run on a machine that has never had pi? |
| 7     | [reference/pi-sdk.md](reference/pi-sdk.md) | What does pi expose: its SDK, files and CLI?          |
| 8     | [adr/](adr/README.md)                      | Why are the engine, the home and the UI contract so?  |
| 9     | [notes/](notes/README.md)                  | Which traps did we hit, and how did we remove them?   |

Two supporting pages hang off the plan: [plan/slices.md](plan/slices.md) holds the
checks for every slice, and [plan/facts.md](plan/facts.md) holds the facts that were
verified by hand. Read them when working a slice, not before reading the plan.

The root [README.md](../README.md) covers install, commands and tooling.
[AGENTS.md](../AGENTS.md) holds the rules for code and for these documents. Read
that file before you change code.

## Keep a document true

- Change the code and the document in the same commit.
- Name the file or the command. Do not copy code, types or route lists into a document.
- Mark a surface that does not exist as **planned**, and name its slice. Never name a
  module, route or frame as if it were current when it is not.
- Generate a fact with a tool when a tool can generate it.
- Keep one status line in each document. Do not repeat scope in a second document.
- Add a note to [notes/](notes/README.md) after a trap costs you time.
- Delete a fact when it becomes false. Do not append a correction under it.
- Write an ADR when a decision changes. Write a new record. Do not edit an accepted record.
- Split a document that no longer fits in one reading.
