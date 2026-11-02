/**
 * What the panel can say about one server's connection, in pi's words where pi
 * gave any. The order matters: a server pi registered a tool for is connected
 * whatever it said earlier, and a server turned off in the file was never asked.
 * The two states only pi knows (a sign-in it needs, a failure) arrive in its
 * attention notice; the rest the panel reads itself.
 */
import type { McpLive, McpLiveServer } from "@/api/types";

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
}): McpServerState => {
	if (!input.enabled) {
		return { text: "Turned off in this file, so pi does not connect it.", warning: false };
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
			text: "No open session reads this server. What pi last said about it is in the log under Advanced.",
			warning: false,
		};
	}
	return {
		text: "No tool from this server yet. pi names a server it could not use here, so silence means it is still connecting or offers nothing to call.",
		warning: false,
	};
};
