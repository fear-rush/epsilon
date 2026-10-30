/**
 * The snapshot a tab receives on attach: pi's transcript, its models and what
 * `/` can expand, read synchronously from the live engine. The transcript is
 * pi's; nothing here is stored on the server.
 *
 * `readModelsFrom` is the models this engine will actually accept. pi's synchronous
 * `getAvailableSnapshot()` is a cached view and can be smaller than the truth: on
 * a home with only `auth.json` and `settings.json` it answered 420 where the
 * auth-checked call answered 514 (openrouter 387 against 481). The picker offers this
 * list and `set_model` resolves against it, so the browser can never pick a model the
 * engine then refuses, and never misses one a terminal `pi` would offer.
 *
 * The auth-checked call resolves credentials per provider, so it is bounded: a
 * provider whose check hangs must not hold a snapshot hostage.
 */
import type { AgentSession, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { isVisibleMessage } from "shared";
import type { Snapshot, SnapshotCommand, SnapshotModel } from "shared";

const AUTH_CHECK_TIMEOUT_MS = 3_000;

type NamedModel = { provider: string; id: string; name: string };

const toSnapshot = (models: readonly NamedModel[]): SnapshotModel[] =>
	models.map((model) => ({ provider: model.provider, id: model.id, name: model.name }));

export const readModelsFrom = async (runtime: ModelRuntime): Promise<SnapshotModel[]> => {
	try {
		const available = await runtime.getAllAvailable(undefined, {
			signal: AbortSignal.timeout(AUTH_CHECK_TIMEOUT_MS),
		});
		return toSnapshot(available);
	} catch {
		// Slow or failing auth resolution falls back to pi's cache: fewer models is
		// better than an empty picker.
		return toSnapshot(runtime.getAvailableSnapshot());
	}
};

const commandsOf = (agent: AgentSession): SnapshotCommand[] => {
	const commands: SnapshotCommand[] = [];
	for (const command of agent.extensionRunner.getRegisteredCommands()) {
		commands.push({
			name: command.invocationName,
			description: command.description,
			source: "extension",
		});
	}
	for (const template of agent.promptTemplates) {
		commands.push({ name: template.name, description: template.description, source: "prompt" });
	}
	for (const skill of agent.resourceLoader.getSkills().skills) {
		commands.push({
			name: `skill:${skill.name}`,
			description: skill.description,
			source: "skill",
		});
	}
	return commands;
};

export const buildSnapshot = (agent: AgentSession, models: SnapshotModel[]): Snapshot => {
	const model = agent.model;
	return {
		state: {
			model:
				model === undefined
					? undefined
					: { provider: model.provider, id: model.id, name: model.name },
			isStreaming: agent.isStreaming,
			isCompacting: agent.isCompacting,
			sessionName: agent.sessionName,
			thinkingLevel: agent.thinkingLevel,
			availableThinkingLevels: agent.getAvailableThinkingLevels(),
		},
		messages: agent.messages.filter(isVisibleMessage),
		// The list the session carries, so the picker and `set_model` agree
		// (`readModelsFrom`). Reading pi's cache here is how they drifted apart.
		models,
		commands: commandsOf(agent),
	};
};
