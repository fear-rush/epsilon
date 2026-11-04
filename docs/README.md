# Docs

Every file here has one kind. The kind says whether it describes the code, explains it,
or asks for a change, and so what an agent may trust it for.

| Kind          | Files                                          | True of                                                | Changes when                                                                                 |
| ------------- | ---------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| **Now**       | [ARCHITECTURE.md](ARCHITECTURE.md)             | the code on this branch, today                         | in the same commit as the code it describes                                                  |
| **Why**       | [DECISIONS.md](DECISIONS.md)                   | the choices that hold, and what was rejected           | a choice is made or reversed                                                                 |
| **Reference** | [pi-sdk.md](pi-sdk.md), [effect.md](effect.md) | pi as installed, Effect as used, the upgrade procedure | pi or Effect changes                                                                         |
| **Plan**      | [plan/](plan/README.md)                        | work not done yet                                      | an item is done (tick it) or the plan changes; the file is deleted when its work is finished |

A plan never describes the code, and ARCHITECTURE never describes a plan. When a plan
item lands, its result moves into ARCHITECTURE (how it is) and DECISIONS (why), and the
plan item is ticked.

Not docs: `.sandbox/` is scratch space, deleted by `bun run sandbox:clean`. Nothing in it
is an instruction. `.sandbox/refactor/` and `.sandbox/plan/` are retired plans kept only
as evidence (measurements, the verification spike).

## Read by task

| You are about to                               | Read first                                                |
| ---------------------------------------------- | --------------------------------------------------------- |
| do any work on this branch                     | [plan/README.md](plan/README.md)                          |
| touch anything pi                              | [pi-sdk.md](pi-sdk.md)                                    |
| write server, engine or runtime code           | [effect.md](effect.md)                                    |
| port a screen from `main`                      | [plan/03-port.md](plan/03-port.md)                        |
| show an error, warning, empty or loading state | [plan/02-feedback.md](plan/02-feedback.md)                |
| add or move a file                             | [ARCHITECTURE.md, File rules](ARCHITECTURE.md#file-rules) |
| propose an option that sounds obvious          | [DECISIONS.md](DECISIONS.md), in case it was rejected     |
| upgrade pi                                     | [pi-sdk.md, Upgrading pi](pi-sdk.md#upgrading-pi)         |

## Writing docs agents can follow

Agents follow docs literally and fill every gap with a plausible guess. Write so there is
no gap.

1. **One kind per file** (table above). Mixing "how it is" with "how it should be" is how
   an agent builds the target and calls it done, or describes the target as built.
2. **AGENTS.md is a router, not a manual.** It is loaded into every session, so it holds
   the invariants, the commands and "read X before Y". Detail lives here and is linked.
3. **Instructions are imperative and checkable.** Each task has _Do_, _Do not_, _Done
   when_ (a command, a file state or a screenshot) and _Stop and ask when_. "Make it
   consistent" is not checkable; "features do not import `@/components/ui/alert`, lint
   fails if they do" is.
4. **Say what must not change.** The plan that rebuilt this branch said what to build and
   never said what to keep, so features were dropped. Name the spec (here: `main`) and
   the closed list of allowed differences.
5. **Status lives in one place**: checkboxes in the plan file or ledger, ticked in the
   commit that does the work. No status in prose, chat or memory.
6. **No build log in a plan.** "As built" notes buried the old plan's instructions under
   500 lines of history. History goes in commit messages; lasting facts go to
   ARCHITECTURE or DECISIONS.
7. **One fact, one place.** Link instead of repeating. A copied list goes stale on the
   next commit; never copy code or file lists into a Now doc.
8. **Concrete over abstract.** Exact commands, exact paths, a right and a wrong example.
9. **Anchor what can go stale** with a date and a commit (`main` at `48226bb`,
   2026-11-04).
10. **Short files.** One plan file per phase, under about 200 lines. An agent reads the
    top of a long file and skims the rest.
