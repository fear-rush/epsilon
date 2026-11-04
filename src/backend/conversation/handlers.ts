import { Effect, Stream } from "effect";

import { ConversationRpcs } from "#protocol/conversation/rpc";

import { AgentHome } from "../platform/agent-home.ts";
import { Engines } from "./registry.ts";

/**
 * One chat over the socket.
 *
 * Attaching returns the tab's frame stream; the lease's release runs when the stream ends,
 * so a tab that closes or is interrupted is removed from the engine rather than left
 * subscribed forever. Leaving the engine alive is deliberate: the registry closes an idle
 * one on its own schedule, and the next attach reuses it.
 */
export const ConversationHandlersLive = ConversationRpcs.toLayer(
	Effect.gen(function* () {
		const engines = yield* Engines;
		const home = yield* AgentHome;

		return {
			"conversation.attach": (input) =>
				Stream.unwrap(
					engines
						.attach({
							cwd: input.place ?? home.chatsDir,
							file: undefined,
							place: input.place,
							sessionId: input.sessionId,
							tab: input.tab,
						})
						.pipe(Effect.map((lease) => lease.frames.pipe(Stream.ensuring(lease.release)))),
				),
			"conversation.command": (input) =>
				Effect.asVoid(engines.command(input.sessionId, input.tab, input.command)),
			"conversation.query": (input) =>
				engines.query(input.sessionId, input.tab, {
					before: input.before,
					cursor: input.cursor,
					kind: input.kind,
					text: input.text,
				}),
			"conversation.detach": (input) => engines.detach(input.sessionId, input.tab),
		};
	}),
);
