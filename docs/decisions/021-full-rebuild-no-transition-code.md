# Full rebuild, no transition code

**Decision**

The old `client/`, `server/` and `shared/` were deleted at the start and kept only as `main`'s history. No adapters, shims, dual schema languages, old wire frames or index-key fallbacks. "No transition code" covers code, never features (amended 2026-11-04). Kept compatible on purpose, because they are not Epsilon's legacy: pi's files, and `<home>/pinned-sessions.json` (same path and shape).

**Why**

Compatibility code is permanent and hides the design it was meant to protect. The first version said the plan, not the old tree, was the reference, and let the app stay broken until the end. The plan listed architecture but no features, nobody could open the app to notice, and much of the UI was lost (the MCP settings kept 4% of their code). See "`main` is the feature specification".

**Rejected**

Transition code of any kind (see Decision).
