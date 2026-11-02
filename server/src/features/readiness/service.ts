/**
 * Can Epsilon run a turn? Asked of a model runtime built from the same home
 * and the same two files the engine uses (`agent-session-services.js`), so the answer
 * cannot drift from what a session would see. It reads pi's files and writes none;
 * a sign-in, from the panel or a terminal, changes the next answer.
 *
 * The question is pi's own (`dist/cli/auth-check.js`): a composition error is
 * invalid, a provider with auth is ready, and a provider without it is not. The
 * engine also needs a model behind that auth, so a provider with none is skipped.
 */

import type { AgentHome } from "../../platform/agent-home";
import { toError } from "../../platform/http";
import { modelRuntime } from "../../platform/pi";
import type { ModelRuntime } from "../../platform/pi";
import { readProvidersFile } from "../providers";
import type { Readiness } from "./contract";

/**
 * The entry pi could not compose: present in models.json, absent from the runtime.
 * A parse error leaves no entry, so pi's sentence is the only name there is.
 */
const brokenProviderOf = async (
	home: AgentHome,
	runtime: ModelRuntime,
): Promise<string | undefined> => {
	const entries = await readProvidersFile(home);
	const composed = new Set(runtime.getProviders().map((provider) => provider.id));
	return Object.keys(entries).find((id) => !composed.has(id));
};

const refusal = async (
	home: AgentHome,
	runtime: ModelRuntime,
	{ detail, fix, provider }: { detail: string; fix: string; provider?: string },
): Promise<Readiness> => ({
	ready: false,
	status: "invalid",
	provider: provider ?? (await brokenProviderOf(home, runtime)),
	detail,
	fix,
	home: home.dir,
});

export const readReadiness = async (home: AgentHome): Promise<Readiness> => {
	const runtime = await modelRuntime(home);
	const error = runtime.getError();
	if (error !== undefined) {
		return refusal(home, runtime, {
			detail: error,
			fix: "Fix the entry in models.json, then reload.",
		});
	}

	const configured = runtime
		.getProviders()
		.filter((provider) => runtime.getProviderAuthStatus(provider.id).configured);
	for (const provider of configured) {
		try {
			const auth = await runtime.checkAuth(provider.id);
			// Auth without a model is a provider, not a turn.
			if (auth !== undefined && runtime.getModels(provider.id).length > 0) return { ready: true };
		} catch (thrown) {
			return refusal(home, runtime, {
				provider: provider.id,
				detail: `${provider.name}: ${toError(thrown, "pi could not check this provider").message}`,
				fix: "Fix this provider in Settings.",
			});
		}
	}

	const hasProvider = configured.length > 0;
	return {
		ready: false,
		status: "not_ready",
		detail: hasProvider
			? "A configured provider has no model to run."
			: "No provider is configured.",
		fix: hasProvider
			? "Add a model to it in Settings."
			: "Add one in Settings and choose a default model.",
		home: home.dir,
	};
};
