# Phase 1: Structure

Rename and move only: no logic, markup or behaviour changes. One commit, so `git log
--follow` keeps every file's history. Done before porting, because each file ported
afterwards would be one more to move.

## The rule

**One concept, one name, in every root.** A Settings section is called the same thing in
the protocol, the server, the page and the URL:

```
src/protocol/settings/mcp.ts → src/backend/settings/mcp/ → src/app/features/settings/mcp/ → /settings/mcp
```

Today the same idea has several names (`config` on the server and `settings` in the
page; `engine/` the child program and `engines/` its supervisor; chat listing split
between `catalog/` and `sessions/`), and agents put new code in the wrong one.

## Moves

Use `git mv`. Paths are under `src/` unless they start with `test/`.

### Server

| From                                      | To                                               | Why                                                                                                     |
| ----------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `backend/catalog/*`                       | `backend/sessions/`                              | the session index and its operations are the sessions feature                                           |
| `backend/sessions/handlers.ts`, `pins.ts` | stay in `backend/sessions/`                      |                                                                                                         |
| `backend/engines/*`                       | `backend/conversation/`                          | the supervisor and registry run live chats; `engines` vs `engine` was one letter from the child program |
| `backend/conversation/handlers.ts`        | stays                                            |                                                                                                         |
| `backend/config/`                         | `backend/settings/`                              | matches the page, the routes and the protocol                                                           |
| `backend/settings.ts`, `settings.test.ts` | `backend/settings/epsilon.ts`, `epsilon.test.ts` | Epsilon's own settings are one Settings concept among the others                                        |
| `backend/context/`                        | `backend/settings/context/`                      | the Context page is a Settings section, like `readiness`                                                |
| `backend/diagnostics/`, `platform/`       | stay                                             |                                                                                                         |

### Protocol

| From                                   | To                                       |
| -------------------------------------- | ---------------------------------------- |
| `protocol/config/*`                    | `protocol/settings/*`                    |
| `protocol/config/settings.ts`          | `protocol/settings/epsilon.ts`           |
| `protocol/context.ts`                  | `protocol/settings/context.ts`           |
| RPC tags `config.*` and `context.read` | `settings.*` and `settings.context.read` |

### Page

| From                                                                                                                                                      | To                                            | Why                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `app/runtime.ts`, `router.tsx`, `query-client.ts`, `queries.ts`, `errors.ts`, `status.tsx`, `route-error.tsx`, `route-not-found.tsx`, `route-pending.tsx` | `app/core/`                                   | the app root keeps only entry files (`main.tsx`, `index.html`, CSS, `styles/`, `routes/`, `routeTree.gen.ts`) |
| `app/features/diagnostics/diagnostics.tsx`                                                                                                                | `app/features/settings/diagnostics.tsx`       | it is a Settings page; no folder for one file                                                                 |
| `app/features/overview/`                                                                                                                                  | delete, after confirming nothing routes to it | a stopgap landing ("the chat surface replaces this landing"); nothing imports it                              |
| `app/components/patterns/controls/enabled-switch.tsx`, `form/use-draft-form.ts`, `dialog/*`, `tabs/*`                                                     | `app/components/patterns/` root               | folders of one or two files; the root then holds 8 files                                                      |
| `app/src/`                                                                                                                                                | delete                                        | an empty stray folder                                                                                         |

### Tests

| From                                              | To                                                                                                |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `domain/conversation/fixtures/*`                  | `test/fixtures/conversation/`                                                                     |
| `backend/platform/fixtures/pi-settings-writer.ts` | `test/fixtures/`                                                                                  |
| `test/fixtures/fake-engine.ts`                    | `test/fixtures/fake-engine-child.ts` (the child process; `test/fake-engine.ts` is what spawns it) |

## Also in this commit

- [ ] `.oxlintrc.json`:
  - the backend `epsilon/no-feature-internals` block points at `src/backend/features`,
    which does not exist, so the rule checks nothing on the server. Point it at
    `src/backend` with the feature folders, and give it its own `aliasRoot`, not
    `src/app`.
  - both blocks exempt `settings/kit`, which does not exist; remove it.
  - update every moved path (`catalog/ingest.ts`, `config/mcp/entries.ts`,
    `config/providers/login.ts`, `config/skills/frontmatter.ts`, `engines/engine.ts`,
    `app/errors.ts`).
- [ ] One name for a feature's pure logic: `rules.ts`, as in `src/domain/<name>/rules.ts`.
      Rename `settings/mcp-registry/domain.ts` and `settings/skill-import/domain.ts`.
- [ ] Knip, tsconfig `include`s and the `#…` import aliases follow the moves.
- [ ] AGENTS.md "Layout" and "Add to a root", and ARCHITECTURE.md (Roots, Inside a
      server feature), describe the new tree.
- [ ] DECISIONS.md and `docs/plan/` paths that name moved files are updated.

## Done when

- [ ] `bun run check` is green and the suite still runs within 10 s.
- [ ] `git grep -nE 'backend/(catalog|engines|config|context)/|protocol/config/|"config\.'`
      finds nothing outside `docs/DECISIONS.md` history notes.
- [ ] A deliberate import of another feature's internal file fails lint on both the
      server and the page (try it, then remove it).
- [ ] `bun run dev` serves every route as before (screenshot `/`, a session, and each
      Settings section).

## Do not

- Change logic, markup or styles. A bug you notice is a new item in the right phase file.
- Split a large file here (`engine/session.ts` at 1,083 lines, `settings/mcp/service.ts`
  at 784). That needs reading, not moving; it is an item in [04-safety.md](04-safety.md).
