import type { AgentSession } from "@earendil-works/pi-coding-agent";

/**
 * pi's coding tools, as the composer's Tools menu groups them. Reading and search stay on
 * either way, because a skill is loaded by reading its file. A chat starts without the
 * coding tools and a project with them; pi records the choice in the transcript, so the
 * switch needs no file of its own.
 */
const CODING = new Set(["bash", "powershell", "edit", "write"]);
const DEFAULTS = ["bash", "edit", "write"];

export const hasCodingTools = (agent: AgentSession): boolean =>
	agent.getActiveToolNames().some((name) => CODING.has(name));

export const setCodingTools = (agent: AgentSession, enabled: boolean): void => {
	const kept = agent.getActiveToolNames().filter((name) => !CODING.has(name));
	agent.setActiveToolsByName(enabled ? [...kept, ...DEFAULTS] : kept);
};
