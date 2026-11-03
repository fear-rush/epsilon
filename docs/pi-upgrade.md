# Upgrading pi

pi is pinned exactly (`@earendil-works/pi-coding-agent`), because Epsilon reads its session
files directly and embeds its runtime. An upgrade is one commit, never a version range.

## Procedure

1. **Read pi's changelog** between the pinned version and the new one. List anything
   touching sessions, extensions, settings, MCP, auth, the SDK surface or the RPC mode.
2. **Run the catalog conformance test** (`src/backend/catalog/catalog.test.ts`). It builds
   the index from fixtures and compares every field with `SessionManager.listAll`, which is
   the oracle. A mismatch means pi changed a rule the index copies.
3. **Confirm the index rebuild.** `meta` carries `schema_version`, `pi_version` and
   `format_version`; a version change drops and rebuilds the tables. Start Epsilon on a
   copy of a real home and check the list appears.
4. **Re-verify the facts this codebase relies on**, all recorded in
   [`.sandbox/refactor/13-verified.md`](/.sandbox/refactor/13-verified.md):
   the `agent_settled` prompt deferral, the `settings.json` lock options, the
   `appendMessage` key order, the bash update snapshot bound, that pi locks no session
   file, and which readers resolve `getAgentDir()` themselves.
5. **Update [pi-sdk.md](pi-sdk.md)** in the same commit. A trap that moved is a trap a
   future reader will trust.
6. **Run the engine test** (`test/engine.test.ts`). It starts a real engine on a scratch
   home with the stub model and a fake extension, so a moved `message_end` or
   `bindExtensions` contract fails before a chat does.
7. **Run everything:** `bun run check`, `bun run test:e2e`, `bun run bench`.
8. **Refuse the upgrade** if the conformance test or an e2e flow fails for a reason you
   do not understand. Staying pinned is a supported state; a silently lossy index is not.
