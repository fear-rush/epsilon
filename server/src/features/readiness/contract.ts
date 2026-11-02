import { z } from "@hono/zod-openapi";

/**
 * Whether Epsilon can run a turn at all. The server asks the engine's own
 * model runtime, so the answer cannot disagree with what a session would see, and
 * the browser shows one notice instead of a composer that looks broken.
 *
 * `not_ready` is an empty or credential-less home. `invalid` is a configuration
 * pi could not compose, and the detail is pi's own reason.
 */
export const readinessSchema = z
	.discriminatedUnion("ready", [
		z.object({ ready: z.literal(true) }),
		z.object({
			ready: z.literal(false),
			status: z.enum(["not_ready", "invalid"]),
			/** The provider pi's answer is about, when one can be named. */
			provider: z.string().optional(),
			/** What the engine found missing, in plain words. */
			detail: z.string(),
			/** The step that fixes it, with the command to run in a shell. */
			fix: z.string(),
			/** The home the engine reads, so the notice can name it. */
			home: z.string(),
		}),
	])
	.openapi("Readiness");

export type Readiness = z.infer<typeof readinessSchema>;
