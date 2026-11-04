import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
	ToolCallEvent,
} from "@earendil-works/pi-coding-agent";
import { Option, Schema } from "effect";

import {
	PERMISSION_MODE_VALUES,
	PERMISSION_STATUS_KEY,
	PermissionMode,
	permissionStatusText,
	toolStops,
} from "../domain/permission/rules.ts";
import type { PermissionMode as PermissionModeValue } from "../domain/permission/rules.ts";

/**
 * Epsilon's permission guard, shipped as an inline extension so Epsilon has a policy
 * without installing a file. Main's extension, unchanged in behaviour: the modes, the
 * flag, the `/permission` command and the session entry are the same, so an operator's own
 * copy that wins keeps what they already use.
 *
 * The mode names are the composer's vocabulary too: `composer/permission-menu.tsx` reads
 * the keyed status this sets and switches with `/permission <mode>`.
 */

const MODES = PERMISSION_MODE_VALUES;

/** `ask` is the shipped default: commands wait for a human, edits do not. */
const DEFAULT_MODE: PermissionModeValue = "ask";

const MODE_DESC: Record<PermissionModeValue, string> = {
	strict: "Ask before every bash command, every write/edit and every destructive tool",
	ask: "Ask before bash commands and destructive tools; other writes auto-approved",
	yolo: "Auto-approve everything; never prompts",
};

/** The custom entry the mode survives in; the status key comes from the domain rules. */
const ENTRY_TYPE = "permission-state";

/** Read back what an earlier turn wrote; anything else leaves the default alone. */
const Entry = Schema.Struct({
	customType: Schema.Literals([ENTRY_TYPE]),
	data: Schema.Struct({ mode: PermissionMode }),
	type: Schema.Literals(["custom"]),
});

/** The one argument worth showing, whatever tool the call belongs to. */
const Detail = Schema.Struct({
	command: Schema.optional(Schema.String),
	path: Schema.optional(Schema.String),
});

/** The hints pi has for one tool, which are the tool's own claim about it. */
const annotationsOf = (pi: ExtensionAPI, toolName: string) =>
	pi.getAllTools().find((tool) => tool.name === toolName)?.annotations;

/** What the dialog shows: the command for a shell call, the path for a write. */
const callDetail = (event: ToolCallEvent): string => {
	const shown = Schema.decodeOption(Detail)(event.input);
	return (
		(Option.isSome(shown) ? (shown.value.command ?? shown.value.path) : undefined) ?? event.toolName
	);
};

/**
 * The factory, not a factory call: pi runs it once per engine, so every session keeps its
 * own mode. Module-level state would share one mode across every live session.
 */
export const permissionExtension = (pi: ExtensionAPI): void => {
	let mode: PermissionModeValue = DEFAULT_MODE;

	const report = (
		ctx: ExtensionContext | ExtensionCommandContext,
		next: PermissionModeValue,
	): void => {
		mode = next;
		// The browser strips this prefix and renders its own labels; the prefix is what
		// tells one keyed status apart from another extension's.
		ctx.ui.setStatus(PERMISSION_STATUS_KEY, permissionStatusText(next));
		pi.events.emit("permission:mode", { mode: next });
	};

	const change = (next: PermissionModeValue, ctx: ExtensionCommandContext): void => {
		report(ctx, next);
		ctx.ui.notify(`Permission mode: ${next}`, "info");
	};

	pi.registerFlag("permission", {
		description: `Approval policy: ${MODES.join(" | ")}`,
		type: "string",
	});

	pi.registerCommand("permission", {
		description: `Set the approval policy (${MODES.join(" | ")})`,
		handler: async (args, ctx) => {
			const asked = args.trim().toLowerCase();
			if (asked !== "") {
				const requested = Schema.decodeUnknownOption(PermissionMode)(asked);
				if (Option.isNone(requested)) {
					ctx.ui.notify(`Unknown mode "${asked}". Use: ${MODES.join(", ")}`, "error");
					return;
				}
				change(requested.value, ctx);
				return;
			}
			// No argument: ask for one. The browser answers `select`, so this is the same
			// popup a terminal shows, and cancelling leaves the mode alone.
			const choice = await ctx.ui.select(
				`Approval policy (current: ${mode})`,
				MODES.map((candidate) => `${candidate} — ${MODE_DESC[candidate]}`),
			);
			if (choice === undefined) return;
			const picked = MODES.find((candidate) => choice.includes(candidate));
			if (picked !== undefined) change(picked, ctx);
		},
	});

	pi.on("session_start", (_event, ctx) => {
		const fromFlag = Schema.decodeUnknownOption(PermissionMode)(pi.getFlag("permission"));
		if (Option.isSome(fromFlag)) {
			// A flag beats what the session recorded, as it does in the terminal.
			mode = fromFlag.value;
		} else if (ctx.isProjectTrusted()) {
			const stored = ctx.sessionManager
				.getEntries()
				.findLast((entry) => entry.type === "custom" && entry.customType === ENTRY_TYPE);
			const parsed = Schema.decodeUnknownOption(Entry)(stored);
			if (Option.isSome(parsed)) mode = parsed.value.data.mode;
		}
		report(ctx, mode);
	});

	// The mode is session state, so it is written where the session reads it back.
	pi.on("turn_start", () => {
		pi.appendEntry(ENTRY_TYPE, { mode });
	});

	pi.on("tool_call", async (event, ctx) => {
		if (mode === "yolo") return undefined;
		const declared = annotationsOf(pi, event.toolName);
		if (!toolStops(mode, event.toolName, declared?.destructiveHint)) return undefined;
		const detail = callDetail(event);
		if (!ctx.hasUI) {
			// Nothing can answer. Blocking is the only honest answer in a guarded mode.
			return { block: true, reason: `Blocked (${mode} needs a UI to confirm): ${detail}` };
		}
		const allowed = await ctx.ui.confirm(`Allow ${event.toolName}?`, detail);
		return allowed ? undefined : { block: true, reason: `Blocked by user: ${detail}` };
	});
};
