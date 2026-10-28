/**
 * The snapshot a tab receives on attach: pi's transcript, its models and what
 * `/` can expand, read synchronously from the live engine. The transcript is
 * pi's; nothing here is stored on the server.
 */
import type { AgentSession } from "@earendil-works/pi-coding-agent";
import { isVisibleMessage } from "shared";
import type { Snapshot, SnapshotCommand, SnapshotModel } from "shared";

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
		},
		messages: agent.messages.filter(isVisibleMessage),
		// The list the session carries, so the picker and `set_model` agree
		// (`models.ts`). Reading pi's cache here is how they drifted apart.
		models,
		commands: commandsOf(agent),
	};
};
