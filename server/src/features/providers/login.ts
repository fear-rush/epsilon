/**
 * Sign-in, as pi runs it. `ModelRuntime.login()` drives the whole flow: it asks
 * questions, reports progress, and writes the credential to auth.json. A browser is
 * not on that call stack, so each provider gets one record here and the page polls
 * it. The record is the truth: a reload of the page re-reads it rather than losing
 * it, and a second start replaces it, which is how pi gets its callback port back.
 */
import { randomUUID } from "node:crypto";

import type { AgentHome } from "../../platform/agent-home";
import { toError } from "../../platform/http";
import { modelRuntime, globalSettings } from "../../platform/pi";
import type { AuthEvent, AuthPrompt, ModelRuntime } from "../../platform/pi";
import type { ProviderLoginQuestion, ProviderLoginSnapshot, ProviderLoginType } from "./contract";

/** How long a flow may stay open. An unanswered one would keep its callback port held. */
const LOGIN_LIFETIME_MS = 10 * 60_000;

/** How long a finished flow stays readable, so the page's last poll can report it. */
const FINISHED_TTL_MS = 2 * 60_000;

/** How many notices one record keeps; a long flow reports progress often. */
const NOTICE_LIMIT = 20;

type LoginStatus = ProviderLoginSnapshot["status"];

/** The question pi waits on, with the resolvers its answer settles. */
type Waiting = {
	id: string;
	settle: (value: string) => void;
	fail: (error: Error) => void;
};

type LoginRecord = {
	providerId: string;
	type: ProviderLoginType;
	status: LoginStatus;
	notices: ProviderLoginSnapshot["notices"];
	authUrl?: ProviderLoginSnapshot["authUrl"];
	deviceCode?: ProviderLoginSnapshot["deviceCode"];
	question?: ProviderLoginQuestion;
	waiting?: Waiting;
	error?: string;
	finishedAt?: number;
	abort: AbortController;
	timer: ReturnType<typeof setTimeout>;
	/** Settles when pi's login call returns or throws, whatever the reason. */
	done?: Promise<void>;
};

/**
 * One flow per provider, per agent home. Keyed that way instead of by a random id
 * so the page needs nothing of its own to find a flow it started.
 */
const logins = new Map<string, LoginRecord>();

const keyOf = (home: AgentHome, providerId: string): string => `${home.dir}\u0000${providerId}`;

const snapshotOf = (record: LoginRecord): ProviderLoginSnapshot => ({
	providerId: record.providerId,
	type: record.type,
	status: record.status,
	notices: record.notices,
	authUrl: record.authUrl,
	deviceCode: record.deviceCode,
	question: record.question,
	error: record.error,
});

const questionOf = (id: string, prompt: AuthPrompt): ProviderLoginQuestion => {
	if (prompt.type === "select") {
		return {
			id,
			message: prompt.message,
			kind: "select",
			options: prompt.options.map((option) => ({
				id: option.id,
				label: option.label,
				description: option.description,
			})),
		};
	}
	return { id, message: prompt.message, kind: prompt.type, placeholder: prompt.placeholder };
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
			const notice: ProviderLoginSnapshot["notices"][number] = { message: event.message };
			if (event.links !== undefined) notice.links = [...event.links];
			note(record, notice);
			return;
		}
		case "progress":
			note(record, { message: event.message });
			return;
		case "auth_url":
			record.authUrl = { url: event.url, instructions: event.instructions };
			return;
		case "device_code":
			record.deviceCode = {
				userCode: event.userCode,
				verificationUri: event.verificationUri,
				intervalSeconds: event.intervalSeconds,
				expiresInSeconds: event.expiresInSeconds,
			};
			return;
	}
};

/**
 * Ask the page one question and wait for it. pi withdraws a question by itself when
 * a `manual_code` races its callback server, and expects the rejection.
 */
const ask = (record: LoginRecord, prompt: AuthPrompt): Promise<string> =>
	new Promise<string>((settle, fail) => {
		const id = randomUUID();
		record.question = questionOf(id, prompt);
		record.waiting = { id, settle, fail };
		prompt.signal?.addEventListener(
			"abort",
			() => {
				if (record.waiting?.id !== id) return;
				record.waiting = undefined;
				record.question = undefined;
				fail(toError(prompt.signal?.reason, "pi withdrew the question"));
			},
			{ once: true },
		);
	});

const finish = (record: LoginRecord, status: LoginStatus, error?: string): void => {
	clearTimeout(record.timer);
	record.status = status;
	record.error = error;
	record.question = undefined;
	record.finishedAt = Date.now();
	const waiting = record.waiting;
	record.waiting = undefined;
	// The flow is over, so a question nobody can answer must not hang. pi holds a
	// handler on the login it started, so this rejection is observed.
	waiting?.fail(new Error(error ?? "The sign-in ended."));
};

/** Drop finished records nobody can still read, so the map cannot grow with the process. */
const prune = (): void => {
	const expiry = Date.now() - FINISHED_TTL_MS;
	for (const [key, record] of logins) {
		if (record.finishedAt !== undefined && record.finishedAt < expiry) logins.delete(key);
	}
};

const run = async (
	record: LoginRecord,
	runtime: ModelRuntime,
	settings: ReturnType<typeof globalSettings>,
	onSignedIn: () => void,
): Promise<void> => {
	try {
		await runtime.login(
			record.providerId,
			record.type,
			{
				signal: record.abort.signal,
				prompt: (prompt) => ask(record, prompt),
				notify: (event) => report(record, event),
			},
			// pi sends this id to the providers that name an agent (ChatGPT's sign-in)
			// and keeps it in settings.json, so every later sign-in reports the same one.
			{ getDeviceId: () => settings.getOrCreateDeviceId() },
		);
		finish(record, "succeeded");
		onSignedIn();
	} catch (error) {
		if (record.abort.signal.aborted) {
			const reason = toError(record.abort.signal.reason, "The sign-in was cancelled");
			finish(record, "cancelled", reason.message);
			return;
		}
		finish(record, "failed", toError(error, "The sign-in failed").message);
	}
};

/**
 * Begin pi's sign-in for one provider, replacing whatever flow this provider was
 * running. The answer is the flow's first state: pi reports its first question or
 * link a tick later, which is what the next poll reads.
 */
export const startProviderLogin = async (
	home: AgentHome,
	providerId: string,
	type: ProviderLoginType,
	onSignedIn: () => void,
): Promise<ProviderLoginSnapshot> => {
	prune();
	const runtime = await modelRuntime(home);
	const provider = runtime.getProvider(providerId);
	if (provider === undefined) throw new Error(`pi does not know a provider called ${providerId}`);
	const method = type === "oauth" ? provider.auth.oauth : provider.auth.apiKey;
	if (method?.login === undefined) {
		throw new Error(
			`${provider.name} offers no ${type === "oauth" ? "account" : "API key"} sign-in`,
		);
	}

	const key = keyOf(home, providerId);
	const previous = logins.get(key);
	if (previous?.status === "running") {
		previous.abort.abort(new Error("Replaced by a new sign-in."));
	}

	const abort = new AbortController();
	const timer = setTimeout(
		() => abort.abort(new Error("The sign-in timed out.")),
		LOGIN_LIFETIME_MS,
	);
	// A flow waiting on an answer must not be what keeps the process alive.
	timer.unref?.();
	const record: LoginRecord = {
		providerId,
		type,
		status: "running",
		notices: [],
		abort,
		timer,
	};
	logins.set(key, record);
	record.done = run(record, runtime, globalSettings(home), onSignedIn);
	return snapshotOf(record);
};

/** What this provider's sign-in reports now, or undefined when none is readable. */
export const readProviderLogin = (
	home: AgentHome,
	providerId: string,
): ProviderLoginSnapshot | undefined => {
	const record = logins.get(keyOf(home, providerId));
	return record === undefined ? undefined : snapshotOf(record);
};

/**
 * Answer the question pi waits on. An answer to a question that already moved on
 * changes nothing: the answer is the live state, and the page renders that.
 */
export const answerProviderLogin = (
	home: AgentHome,
	providerId: string,
	promptId: string,
	value: string,
): ProviderLoginSnapshot | undefined => {
	const record = logins.get(keyOf(home, providerId));
	if (record === undefined) return undefined;
	const waiting = record.waiting;
	if (waiting !== undefined && waiting.id === promptId) {
		record.waiting = undefined;
		record.question = undefined;
		waiting.settle(value);
	}
	return snapshotOf(record);
};

/** How long a cancel waits for the flow to settle before answering as it stands. */
const CANCEL_SETTLE_MS = 2_000;

/**
 * Cancel a flow. pi's login races its own abort signal, so the record settles a tick
 * later; answering after that lets the page swap back in one step instead of waiting
 * for its next poll. A flow that does not settle inside the wait is answered as it is,
 * and the page's poll reports the rest.
 */
export const cancelProviderLogin = async (
	home: AgentHome,
	providerId: string,
): Promise<ProviderLoginSnapshot | undefined> => {
	const record = logins.get(keyOf(home, providerId));
	if (record === undefined) return undefined;
	if (record.status === "running") {
		record.abort.abort(new Error("The sign-in was cancelled."));
		const late = new Promise<void>((resolve) => {
			const timer = setTimeout(resolve, CANCEL_SETTLE_MS);
			// A waiting request must not be what keeps the process alive.
			timer.unref?.();
		});
		await Promise.race([record.done ?? Promise.resolve(), late]);
	}
	return snapshotOf(record);
};

/**
 * Drop this provider's record. Signing out ends the last flow's story: the account
 * it reported is gone, and a kept "succeeded" would contradict the page.
 */
export const forgetProviderLogin = (home: AgentHome, providerId: string): void => {
	const record = logins.get(keyOf(home, providerId));
	if (record?.status !== "running") logins.delete(keyOf(home, providerId));
};
