# ADR-0013: Feature modules, OpenAPI client, contract hash

- Status: Accepted
- Date: 2026-10-30
- Supersedes: the file-size caps in AGENTS.md (300-line files, 60-line route
  handlers). No ADR set a cap, so no ADR text is superseded.

## Context

The 300-line cap split single concepts across many files, and the REST contract
existed three times: zod in `shared`, hand-written client fetchers, and parsing of
every response in the browser. The documentation had grown to ten pages that
drifted from the code and misled agents.

## Decision

1. **Drop the size cap.** One concept per file; split by meaning, not by length.
2. **Feature modules with matching names across workspaces.** Server
   `features/<name>/`, client `features/settings/<name>/`, shared
   `<feature>/rules.ts` where both sides run the same rule.
3. **Server feature file roles:** `contract` (zod request and response schemas),
   `domain` (pure), `store` (pi files), `service` (use cases), `routes` (thin).
   Dependency direction: routes, service, domain, store, platform. Another feature
   is imported only through its public surface; `settings/` is the one aggregator.
4. **OpenAPI-generated client.** The server's OpenAPI document is the REST
   contract; `bun run api:generate` writes the client schema and contract files.
   `shared` keeps only the socket protocol, the reducer and shared rules.
5. **Contract hash replaces runtime response validation.** Every response carries
   `x-epsilon-contract`; the client shows one reload notice on mismatch instead of
   zod-parsing responses.
6. **Documentation cut.** Keep ADRs (history), `pi-sdk.md` with its traps (external
   facts), `ARCHITECTURE.md` (a map) and `DEPLOY.md`. Delete plans, feature lists,
   UI inventories, protocol frame lists and notes: code, types and tests state
   them, and prose copies drift. Superseded ADRs move to `adr/superseded/`.

## Consequences

Contract drift becomes a compile error or one visible notice, not a silent parse
failure. Files may be long; reviewers judge cohesion. Links inside older ADRs to
moved or deleted documents are left as written; the ADR records the tree at its date.

## Rejected alternatives

- **Keep the cap and add more files.** It fragmented concepts and was a lint target
  rather than a design rule.
- **Keep zod parsing of REST responses in the browser.** A second copy of the
  contract that cost bytes and still drifted from the server.

## Revisit if

The generated client cannot express a route (streaming, uploads), or responses need
validation against a server we do not ship alongside the client.
