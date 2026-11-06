/**
 * What the panel can say about one server's connection, in pi's words where pi
 * gave any. The order matters: a server pi registered a tool for is connected
 * whatever it said earlier, and a server turned off in the file was never asked.
 * The two states only pi knows (a sign-in it needs, a failure) arrive in its
 * attention notice; the rest the panel reads itself.
 */
import type { McpLive, McpLiveServer } from "#protocol/settings/mcp";

/** One sentence about a server, and whether the operator has something to fix. */
export type McpServerState = { text: string; warning: boolean };

const countOf = (tools: number): string => (tools === 1 ? "1 tool" : `${tools} tools`);

export const mcpServerState = (input: {
	/** Whether the file the page reads says pi should connect it. */
	enabled: boolean;
	/** Every live engine's answer, or undefined while the settings read is not here yet. */
	live: McpLive | undefined;
	/** This server's row, when a live engine reported it. */
	server: McpLiveServer | undefined;
	/** The resource tools pi registered for the session, which reach a server's resources. */
	resources: readonly string[];
}): McpServerState => {
	if (!input.enabled) {
		return { text: "Turned off in this file.", warning: false };
	}
	const tools = input.server?.tools.length ?? 0;
	if (tools > 0) {
		return { text: `pi registered ${countOf(tools)} for this server.`, warning: false };
	}
	const attention = input.server?.attention;
	if (attention?.kind === "needs-sign-in") {
		return { text: "pi needs a sign-in before it can use this server.", warning: true };
	}
	if (attention?.kind === "failed") {
		return { text: `pi could not use this server: ${attention.message}`, warning: true };
	}
	if ((input.live?.sessions ?? 0) === 0) {
		return {
			text: "Open a chat to connect this server.",
			warning: false,
		};
	}
	if (input.resources.length > 0) {
		// pi registers these once for the session, so they reach resources without naming
		// which server holds them, and a resources-only server gets no tool row at all.
		return {
			text: `No tools yet. Resources come through ${input.resources.join(", ")}.`,
			warning: false,
		};
	}
	return {
		text: "No tools yet. It may still be connecting.",
		warning: false,
	};
};
