import type { SnapshotCommand } from "../protocol/frames";

/**
 * The slash commands Epsilon runs in the composer itself. pi's `/tree`, `/fork`
 * and `/clone` are terminal commands over the SDK, not extension commands, so
 * `get_commands` does not list them. The composer handles these names before a
 * prompt is sent, and the snapshot offers them beside pi's own commands.
 */
export const EPSILON_COMMANDS = [
	{
		name: "tree",
		description: "Open this chat's tree and move to another point",
		source: "epsilon",
	},
	{
		name: "fork",
		description: "Start a new chat from an earlier message",
		source: "epsilon",
	},
	{
		name: "clone",
		description: "Copy this chat into a new chat",
		source: "epsilon",
	},
	{
		name: "reload",
		description: "Reload pi's settings and resources",
		source: "epsilon",
	},
] as const satisfies readonly SnapshotCommand[];
