import { describe, expect, test } from "bun:test";

import { Effect, Layer, Scope, Stream } from "effect";

import { ProviderLoginRpcs } from "#protocol/config/providers";
import { ProviderRefused } from "#protocol/errors";

import { testClient } from "../../../../test/rpc.ts";
import type { AuthEvent, AuthPrompt } from "../../platform/pi.ts";
import { ProviderLoginHandlersLive } from "./login-handlers.ts";
import { makeProviderLoginService, ProviderLoginService } from "./login.ts";

/**
 * The sign-in stream over its RPC group, with a fake pi login. The fake asks a question,
 * reports progress and returns; the real pi call is the platform's, so what is tested
 * here is the record, the question handshake, cancel and the stream ending.
 */

type LoginPorts = {
	readonly provider: (
		providerId: string,
	) => Effect.Effect<{ name: string; oauth: boolean; apiKey: boolean }, ProviderRefused>;
	readonly login: (
		providerId: string,
		type: "api_key" | "oauth",
		interaction: {
			signal: AbortSignal;
			prompt: (prompt: AuthPrompt) => Effect.Effect<string, Error>;
			notify: (event: AuthEvent) => void;
		},
	) => Effect.Effect<void, ProviderRefused>;
};

const loginLayer = (ports: LoginPorts) => {
	const service = Layer.effect(
		ProviderLoginService,
		Effect.gen(function* () {
			const scope = yield* Scope.Scope;
			return makeProviderLoginService({ ...ports, scope });
		}),
	);
	return ProviderLoginHandlersLive.pipe(Layer.provideMerge(service));
};

const provider = (_providerId: string) =>
	Effect.succeed({ apiKey: true, name: "Fake", oauth: true });

// SAFETY: a text prompt needs a message; the optional fields may stay absent.
const prompt = { message: "Paste the code", type: "text" } as AuthPrompt;

describe("config.providers.login", () => {
	test("asks the page, applies the answer and ends with success", async () => {
		const ports: LoginPorts = {
			provider,
			login: (_providerId, _type, interaction) =>
				Effect.gen(function* () {
					const answer = yield* interaction
						.prompt(prompt)
						.pipe(
							Effect.mapError(
								(cause) => new ProviderRefused({ providerId: "fake", reason: cause.message }),
							),
						);
					interaction.notify({ message: `Got ${answer}`, type: "info" });
				}),
		};
		const snapshots = await Effect.runPromise(
			Effect.gen(function* () {
				const client = yield* testClient(ProviderLoginRpcs, ProviderLoginHandlersLive);
				return yield* client["config.providers.login"]({
					providerId: "fake",
					type: "api_key",
				}).pipe(
					Stream.tap((snapshot) =>
						snapshot.question === undefined
							? Effect.void
							: client["config.providers.answerLogin"]({
									providerId: "fake",
									promptId: snapshot.question.id,
									value: "123456",
								}),
					),
					Stream.runCollect,
				);
			}).pipe(Effect.scoped, Effect.provide(loginLayer(ports))),
		);

		const list = [...snapshots];
		expect(list[0]).toMatchObject({ providerId: "fake", status: "running", type: "api_key" });
		expect(list.some((snapshot) => snapshot.question !== undefined)).toBe(true);
		expect(list.at(-1)?.status).toBe("succeeded");
		expect(list.at(-1)?.error).toBeUndefined();
		expect(list.at(-1)?.notices.map((notice) => notice.message)).toContain("Got 123456");
	});

	test("cancel stops a waiting question and reports it as cancelled", async () => {
		const ports: LoginPorts = {
			provider,
			login: (_providerId, _type, interaction) =>
				interaction.prompt(prompt).pipe(
					Effect.mapError(
						(cause) => new ProviderRefused({ providerId: "fake", reason: cause.message }),
					),
					Effect.asVoid,
				),
		};
		const snapshots = await Effect.runPromise(
			Effect.gen(function* () {
				const client = yield* testClient(ProviderLoginRpcs, ProviderLoginHandlersLive);
				let cancelled = false;
				return yield* client["config.providers.login"]({
					providerId: "fake",
					type: "oauth",
				}).pipe(
					Stream.tap((snapshot) => {
						if (snapshot.question === undefined || cancelled) return Effect.void;
						cancelled = true;
						return client["config.providers.cancelLogin"]({ providerId: "fake" });
					}),
					Stream.runCollect,
				);
			}).pipe(Effect.scoped, Effect.provide(loginLayer(ports))),
		);

		const list = [...snapshots];
		expect(list.some((snapshot) => snapshot.question !== undefined)).toBe(true);
		expect(list.at(-1)).toMatchObject({ status: "cancelled" });
	});

	test("an unknown provider, and a type it does not offer, are refusals", async () => {
		const ports: LoginPorts = {
			login: () => Effect.void,
			provider: (providerId) =>
				providerId === "fake"
					? Effect.succeed({ apiKey: true, name: "Fake", oauth: false })
					: Effect.fail(new ProviderRefused({ providerId, reason: "unknown provider" })),
		};
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const client = yield* testClient(ProviderLoginRpcs, ProviderLoginHandlersLive);
				const unknown = yield* Effect.flip(
					Stream.runCollect(
						client["config.providers.login"]({ providerId: "missing", type: "api_key" }),
					),
				);
				const noOauth = yield* Effect.flip(
					Stream.runCollect(
						client["config.providers.login"]({ providerId: "fake", type: "oauth" }),
					),
				);
				return { noOauth, unknown };
			}).pipe(Effect.scoped, Effect.provide(loginLayer(ports))),
		);
		expect(result.unknown).toBeInstanceOf(ProviderRefused);
		expect(result.unknown).toMatchObject({ reason: expect.stringContaining("unknown provider") });
		expect(result.noOauth).toBeInstanceOf(ProviderRefused);
		expect(result.noOauth).toMatchObject({ reason: expect.stringContaining("account sign-in") });
	});
});
