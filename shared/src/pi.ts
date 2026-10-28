/**
 * Type-only re-exports from the pinned pi package. Nothing else in `shared/`
 * may import `@earendil-works/*` (AGENTS.md, rule 1), and no runtime value from
 * pi may cross into the browser.
 *
 * pi's JSON session event is the one shape that does cross: it is what
 * `conversation/reduce.ts` consumes, and it stays pi's type so the reducer is
 * never fed a parallel copy that can drift from the engine.
 */
export type { JsonAgentSessionEvent } from "@earendil-works/pi-coding-agent";
