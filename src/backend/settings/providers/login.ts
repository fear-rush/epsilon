import { Clock, Context, Deferred, Effect, Layer, PubSub, Scope, Stream } from "effect";

import { ProviderRefused } from "#protocol/errors";
import type {
	ProviderLoginQuestion,
	ProviderLoginSnapshot,
	ProviderLoginType,
} from "#protocol/settings/providers";

import { withDefined } from "../../../domain/object.ts";
import type { AuthEvent, AuthPrompt } from "../../platform/pi.ts";
import { PiConfig } from "../../platform/pi.ts";

/**
 * Sign-in, as pi runs it. `ModelRuntime.login()` drives the whole flow: it asks
 * questions, reports progress, and writes the credential to `auth.json`. The browser is
 * not on that call stack, so each provider gets one record here and one stream of
 * snapshots; the page follows the stream instead of polling. A second start replaces a
 * running flow, which is how pi gets its callback port back.
 */

/** How long a flow may stay open. An unanswered one would keep its callback port held. */
const LOGIN_LIFETIME_MS = 10 * 60_000;
/** How long a finished record stays readable for a late subscriber. */
const FINISHED_TTL_MS = 2 * 60_000;
/** How many notices one record keeps; a long flow reports progress often. */
const NOTICE_LIMIT = 20;

type Waiting = {
	readonly id: string;
	readonly deferred: Deferred.Deferred<string, Error>;
};

type LoginRecord = {
	readonly providerId: string;
	readonly type: ProviderLoginType;
	readonly pubsub: PubSub.PubSub<ProviderLoginSnapshot>;
	readonly abort: AbortController;
	status: ProviderLoginSnapshot["status"];
	notices: ProviderLoginSnapshot["notices"];
	authUrl: ProviderLoginSnapshot["authUrl"];
	deviceCode: ProviderLoginSnapshot["deviceCode"];
	question: ProviderLoginQuestion | undefined;
	waiting: Waiting | undefined;
	error: string | undefined;
	finishedAt: number | undefined;
};

const refusal = (providerId: string, reason: string): ProviderRefused =>
	new ProviderRefused({ providerId, reason });

const snapshotOf = (record: LoginRecord): ProviderLoginSnapshot =>
	withDefined(
		withDefined(
			withDefined(
				withDefined(
					{
						providerId: record.providerId,
						type: record.type,
						status: record.status,
						notices: [...record.notices],
					} satisfies ProviderLoginSnapshot,
					"authUrl",
					record.authUrl,
				),
				"deviceCode",
				record.deviceCode,
			),
			"question",
			record.question,
		),
		"error",
		record.error,
	);

const questionOf = (id: string, prompt: AuthPrompt): ProviderLoginQuestion => {
	if (prompt.type === "select") {
		return {
			id,
			kind: "select",
			message: prompt.message,
			options: prompt.options.map((option) =>
				withDefined({ id: option.id, label: option.label }, "description", option.description),
			),
		};
	}
	return withDefined(
		{ id, kind: prompt.type, message: prompt.message } satisfies ProviderLoginQuestion,
		"placeholder",
		prompt.placeholder,
	);
};

/** Keep the newest notices, so a flow that reports progress often stays readable. */
const note = (record: LoginRecord, notice: ProviderLoginSnapshot["notices"][number]): void => {
	// pi narrates the loopback callback server it opened. The port is not something the
	// operator can act on, and the sign-in page is the button already on screen.
	if (notice.message.startsWith("Listening for")) return;
	record.notices = [...record.notices, notice].slice(-NOTICE_LIMIT);
};

const report = (record: LoginRecord, event: AuthEvent): void => {
	switch (event.type) {
		case "info": {
			const notice: ProviderLoginSnapshot["notices"][number] =
				event.links === undefined
					? { message: event.message }
					: { message: event.message, links: [...event.links] };
			note(record, notice);
			break;
		}
		case "progress":
			note(record, { message: event.message });
			break;
		case "auth_url":
			record.authUrl = { url: event.url, instructions: event.instructions };
			break;
		case "device_code":
			record.deviceCode = {
				userCode: event.userCode,
				verificationUri: event.verificationUri,
				intervalSeconds: event.intervalSeconds,
				expiresInSeconds: event.expiresInSeconds,
			};
			break;
	}
	PubSub.publishUnsafe(record.pubsub, snapshotOf(record));
};

/**
 * Ask the page one question and wait for it. pi withdraws a question by itself when a
 * `manual_code` races its callback server, and expects the rejection.
 */
const promptOf = (record: LoginRecord, prompt: AuthPrompt): Effect.Effect<string, Error> =>
	Effect.gen(function* () {
		const id = crypto.randomUUID();
		const deferred = yield* Deferred.make<string, Error>();
		record.question = questionOf(id, prompt);
		record.waiting = { deferred, id };
		PubSub.publishUnsafe(record.pubsub, snapshotOf(record));
		const withdraw = (): void => {
			if (record.waiting?.id !== id) return;
			record.waiting = undefined;
			record.question = undefined;
			Deferred.doneUnsafe(deferred, Effect.fail(new Error("The question was withdrawn")));
		};
		prompt.signal?.addEventListener("abort", withdraw, { once: true });
		record.abort.signal.addEventListener("abort", withdraw, { once: true });
		return yield* Deferred.await(deferred);
	});

const finish = (
	record: LoginRecord,
	status: ProviderLoginSnapshot["status"],
	error?: string,
): Effect.Effect<void> =>
	Effect.gen(function* () {
		record.status = status;
		record.error = error;
		record.question = undefined;
		record.finishedAt = yield* Clock.currentTimeMillis;
		const waiting = record.waiting;
		record.waiting = undefined;
		if (waiting !== undefined) {
			Deferred.doneUnsafe(waiting.deferred, Effect.fail(new Error(error ?? "The sign-in ended.")));
		}
		yield* PubSub.publish(record.pubsub, snapshotOf(record));
		yield* PubSub.shutdown(record.pubsub);
	});

export type ProviderLoginServiceApi = {
	/** Start a flow for `type`, or attach to the running one when `type` is null. */
	readonly start: (
		providerId: string,
		type: ProviderLoginType | null,
	) => Stream.Stream<ProviderLoginSnapshot, ProviderRefused>;
	/** The record's latest snapshot, or null when nothing was signed in. */
	readonly read: (
		providerId: string,
	) => Effect.Effect<ProviderLoginSnapshot | null, ProviderRefused>;
	readonly answer: (
		providerId: string,
		promptId: string,
		value: string,
	) => Effect.Effect<void, ProviderRefused>;
	readonly cancel: (providerId: string) => Effect.Effect<void, ProviderRefused>;
};

export class ProviderLoginService extends Context.Service<
	ProviderLoginService,
	ProviderLoginServiceApi
>()("epsilon/ProviderLoginService") {}

export const makeProviderLoginService = (deps: {
	readonly provider: (
		providerId: string,
	) => Effect.Effect<{ name: string; oauth: boolean; apiKey: boolean }, ProviderRefused>;
	readonly login: (
		providerId: string,
		type: ProviderLoginType,
		interaction: {
			signal: AbortSignal;
			prompt: (prompt: AuthPrompt) => Effect.Effect<string, Error>;
			notify: (event: AuthEvent) => void;
		},
	) => Effect.Effect<void, ProviderRefused>;
	readonly scope: Scope.Scope;
}): ProviderLoginServiceApi => {
	const records = new Map<string, LoginRecord>();

	const prune = (now: number): void => {
		for (const [providerId, record] of records) {
			if (record.finishedAt !== undefined && now - record.finishedAt > FINISHED_TTL_MS) {
				records.delete(providerId);
			}
		}
	};

	const run = (record: LoginRecord): Effect.Effect<void> =>
		deps
			.login(record.providerId, record.type, {
				signal: record.abort.signal,
				prompt: (prompt) => promptOf(record, prompt),
				notify: (event) => report(record, event),
			})
			.pipe(
				Effect.matchEffect({
					onFailure: (error) =>
						finish(record, record.abort.signal.aborted ? "cancelled" : "failed", error.reason),
					onSuccess: () => finish(record, "succeeded"),
				}),
			);

	const start: ProviderLoginServiceApi["start"] = (providerId, type) =>
		Stream.unwrap(
			Effect.gen(function* () {
				const now = yield* Clock.currentTimeMillis;
				prune(now);
				if (type === null) {
					// Attach to the running flow: a reloaded page follows it instead of
					// replacing it, which would abort the browser's own callback.
					const running = records.get(providerId);
					if (running === undefined) {
						return yield* refusal(providerId, "No sign-in is running for this provider.");
					}
					return Stream.fromPubSub(running.pubsub);
				}
				const info = yield* deps.provider(providerId);
				if (type === "oauth" && !info.oauth) {
					return yield* refusal(providerId, `${info.name} offers no account sign-in`);
				}
				if (type === "api_key" && !info.apiKey) {
					return yield* refusal(providerId, `${info.name} offers no API-key sign-in`);
				}
				const previous = records.get(providerId);
				if (previous?.status === "running") {
					previous.abort.abort(new Error("Replaced by a new sign-in."));
				}
				const pubsub = yield* PubSub.unbounded<ProviderLoginSnapshot>({ replay: 1 });
				const record: LoginRecord = {
					providerId,
					type,
					pubsub,
					abort: new AbortController(),
					status: "running",
					notices: [],
					authUrl: undefined,
					deviceCode: undefined,
					question: undefined,
					waiting: undefined,
					error: undefined,
					finishedAt: undefined,
				};
				records.set(providerId, record);
				PubSub.publishUnsafe(pubsub, snapshotOf(record));
				yield* Effect.forkIn(
					Effect.sleep(LOGIN_LIFETIME_MS).pipe(
						Effect.andThen(
							Effect.sync(() => record.abort.abort(new Error("The sign-in expired."))),
						),
					),
					deps.scope,
				);
				yield* Effect.forkIn(run(record), deps.scope);
				return Stream.fromPubSub(pubsub);
			}),
		);

	const read: ProviderLoginServiceApi["read"] = (providerId) =>
		Effect.gen(function* () {
			const now = yield* Clock.currentTimeMillis;
			prune(now);
			const record = records.get(providerId);
			return record === undefined ? null : snapshotOf(record);
		});

	const answer: ProviderLoginServiceApi["answer"] = (providerId, promptId, value) =>
		Effect.gen(function* () {
			const record = records.get(providerId);
			if (record?.status !== "running") {
				return yield* refusal(providerId, "No sign-in is running for this provider.");
			}
			const waiting = record.waiting;
			if (waiting === undefined || waiting.id !== promptId) {
				return yield* refusal(providerId, "That question is no longer waiting.");
			}
			record.waiting = undefined;
			record.question = undefined;
			PubSub.publishUnsafe(record.pubsub, snapshotOf(record));
			Deferred.doneUnsafe(waiting.deferred, Effect.succeed(value));
			return undefined;
		});

	const cancel: ProviderLoginServiceApi["cancel"] = (providerId) =>
		Effect.gen(function* () {
			const record = records.get(providerId);
			if (record?.status !== "running") {
				return yield* refusal(providerId, "No sign-in is running for this provider.");
			}
			record.abort.abort(new Error("The sign-in was cancelled."));
			return undefined;
		});

	return { answer, cancel, read, start };
};

export const ProviderLoginServiceLive: Layer.Layer<ProviderLoginService, never, PiConfig> =
	Layer.effect(
		ProviderLoginService,
		Effect.gen(function* () {
			const pi = yield* PiConfig;
			const scope = yield* Scope.Scope;
			return makeProviderLoginService({
				login: pi.providerLogin.login,
				provider: pi.providerLogin.providerLogin,
				scope,
			});
		}),
	);
