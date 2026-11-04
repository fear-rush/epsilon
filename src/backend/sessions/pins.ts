import { join } from "node:path";

import { Context, Effect, Exit, Layer, Option, Schema } from "effect";

import { FileUnwritable } from "#protocol/errors";

import { AgentHome } from "../platform/agent-home.ts";
import { JsonDocument } from "../platform/json-document.ts";

/**
 * Epsilon's own session state, beside pi's files: the pinned chat ids.
 *
 * pi has no pin concept, so one small private file holds them and the list joins it to
 * pi's sessions. A broken file is an empty set plus a sentence, never a failed list; a
 * write refuses rather than overwriting what it could not parse, and unknown keys survive.
 */
const PinsFile = Schema.Struct({ sessions: Schema.Array(Schema.String) });

export type PinsApi = {
	readonly read: Effect.Effect<{
		readonly ids: ReadonlySet<string>;
		readonly problem: string | undefined;
	}>;
	readonly set: (sessionId: string, pinned: boolean) => Effect.Effect<void, FileUnwritable>;
};

export class Pins extends Context.Service<Pins, PinsApi>()("epsilon/sessions/Pins") {}

export const PinsLive: Layer.Layer<Pins, never, AgentHome | JsonDocument> = Layer.effect(
	Pins,
	Effect.gen(function* () {
		const home = yield* AgentHome;
		const json = yield* JsonDocument;
		const path = join(home.agentDir, "pinned-sessions.json");

		const read: PinsApi["read"] = Effect.gen(function* () {
			const outcome = yield* Effect.exit(json.read(path));
			if (Exit.isFailure(outcome)) {
				return { ids: new Set<string>(), problem: `Pinned chats could not be read from ${path}.` };
			}
			const decoded = Schema.decodeUnknownOption(PinsFile)(outcome.value);
			if (Option.isNone(decoded)) {
				return {
					ids: new Set<string>(),
					problem: `Pinned chats in ${path} are not the shape Epsilon writes; the list shows none.`,
				};
			}
			return { ids: new Set(decoded.value.sessions), problem: undefined };
		});

		const set: PinsApi["set"] = (sessionId, pinned) =>
			json
				.edit(path, (current) =>
					Effect.sync(() => {
						const decoded = Schema.decodeUnknownOption(PinsFile)(current);
						const sessions = new Set(Option.isSome(decoded) ? decoded.value.sessions : []);
						if (pinned) sessions.add(sessionId);
						else sessions.delete(sessionId);
						return { ...current, sessions: [...sessions] };
					}),
				)
				.pipe(
					Effect.asVoid,
					Effect.mapError(
						(cause) =>
							new FileUnwritable({
								path,
								reason:
									cause._tag === "FileUnwritable" ? cause.reason : `the file is ${cause._tag}`,
							}),
					),
				);

		return { read, set };
	}),
);
