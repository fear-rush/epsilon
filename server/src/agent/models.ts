/**
 * The models this engine will actually accept. pi's synchronous
 * `getAvailableSnapshot()` is a cached view and can be smaller than the truth: on a
 * home with only `auth.json` and `settings.json` it answered 420 where the
 * auth-checked call answered 514 (openrouter 387 against 481). The picker offers this
 * list and `set_model` resolves against it, so the browser can never pick a model the
 * engine then refuses, and never misses one a terminal `pi` would offer.
 *
 * The auth-checked call resolves credentials per provider, so it is bounded: a
 * provider whose check hangs must not hold a snapshot hostage.
 */
import type { AgentSession } from "@earendil-works/pi-coding-agent";
import type { SnapshotModel } from "shared";

const AUTH_CHECK_TIMEOUT_MS = 3_000;

type NamedModel = { provider: string; id: string; name: string };

const toSnapshot = (models: readonly NamedModel[]): SnapshotModel[] =>
	models.map((model) => ({ provider: model.provider, id: model.id, name: model.name }));

export const readModels = async (agent: AgentSession): Promise<SnapshotModel[]> => {
	try {
		const available = await agent.modelRuntime.getAllAvailable(undefined, {
			signal: AbortSignal.timeout(AUTH_CHECK_TIMEOUT_MS),
		});
		return toSnapshot(available);
	} catch {
		// Slow or failing auth resolution falls back to pi's cache: fewer models is
		// better than an empty picker.
		return toSnapshot(agent.modelRuntime.getAvailableSnapshot());
	}
};
