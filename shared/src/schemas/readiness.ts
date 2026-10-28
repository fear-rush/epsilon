import { z } from "zod";

/**
 * Whether this deployment can run a turn at all. The server asks the engine's own
 * model runtime, so the answer cannot disagree with what a session would see, and
 * the browser shows one notice instead of a composer that looks broken
 * (docs/ui.md, "Not ready").
 */
export const readinessSchema = z.discriminatedUnion("ready", [
	z.object({ ready: z.literal(true) }),
	z.object({
		ready: z.literal(false),
		/** What the engine found missing, in plain words. */
		detail: z.string(),
		/** The step that fixes it, with the command to run in a shell. */
		fix: z.string(),
		/** The home the engine reads, so the notice can name it. */
		home: z.string(),
	}),
]);

export type Readiness = z.infer<typeof readinessSchema>;
