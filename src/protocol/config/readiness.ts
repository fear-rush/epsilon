import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

/**
 * Can Epsilon run a turn at all? The server asks pi's own model runtime, so the answer
 * cannot disagree with what a session would see, and the page shows one notice instead of
 * a composer that looks broken.
 *
 * `not_ready` is an empty or credential-less home. `invalid` is a configuration pi could
 * not compose, and the detail is pi's own reason.
 */
export const Readiness = Schema.Union([
	Schema.Struct({ ready: Schema.Literal(true) }),
	Schema.Struct({
		ready: Schema.Literal(false),
		status: Schema.Literals(["not_ready", "invalid"]),
		/** The provider pi's answer is about, when one can be named. */
		provider: Schema.optional(Schema.String),
		/** What the engine found missing, in plain words. */
		detail: Schema.String,
		/** The step that fixes it, with the command to run in a shell. */
		fix: Schema.String,
	}),
]);
export type Readiness = typeof Readiness.Type;

export const ReadinessRpcs = RpcGroup.make(
	Rpc.make("config.readiness.read", {
		success: Readiness,
	}),
);
