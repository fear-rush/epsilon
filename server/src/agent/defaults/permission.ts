/**
 * Epsilon's permission guard, shipped as an inline extension so a deployment gets
 * a policy without installing a file (docs/adr/0008-embed-pi-engine-with-opinions.md,
 * decision 3). Ported from the operator extension of the same name: the modes, the
 * flag, the command and the session entry are unchanged, so an operator whose own
 * copy wins keeps the behaviour they already have.
 *
 * The mode names are the browser's vocabulary too: `client/src/lib/permission.ts`
 * lists the labels and `client/src/components/composer/permission-menu.tsx` reads
 * the keyed status and switches with `/permission <mode>`. A change here needs a
 * change there.
 */
import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
	ToolCallEvent,
} from "@earendil-works/pi-coding-agent";
import { z } from "zod";

const modeSchema = z.enum(["strict", "ask", "yolo"]);

type PermissionMode = z.infer<typeof modeSchema>;

const MODES = modeSchema.options;

/** `ask` is the shipped default: commands wait for a human, edits do not. */
const DEFAULT_MODE: PermissionMode = "ask";

const MODE_DESC: Record<PermissionMode, string> = {
	strict: "Ask before every bash command and every write/edit",
	ask: "Ask before bash commands; writes auto-approved",
	yolo: "Auto-approve everything; never prompts",
};

/** The keyed status the browser reads, and the custom entry the mode survives in. */
const STATUS_KEY = "permission";
const ENTRY_TYPE = "permission-state";

/** Read back what an earlier turn wrote; anything else leaves the default alone. */
const entrySchema = z.object({
	type: z.literal("custom"),
	customType: z.literal(ENTRY_TYPE),
	data: z.object({ mode: modeSchema }),
});

/** The one argument worth showing, whatever tool the call belongs to. */
const detailSchema = z.object({ command: z.string().optional(), path: z.string().optional() });

/** Which tools stop for a human under each mode. `yolo` stops for none. */
const asksBefore = (mode: PermissionMode, toolName: string): boolean => {
	if (mode === "strict") return toolName === "bash" || toolName === "write" || toolName === "edit";
	if (mode === "ask") return toolName === "bash";
	return false;
};

/** What the dialog shows: the command for a shell call, the path for a write. */
const callDetail = (event: ToolCallEvent): string => {
	const shown = detailSchema.safeParse(event.input);
	if (!shown.success) return event.toolName;
	return shown.data.command ?? shown.data.path ?? event.toolName;
};

/**
 * The factory, not a factory call: `DefaultResourceLoader` runs it once per engine,
 * so every session keeps its own mode. Module-level state would share one mode
 * across every live session in this process.
 */
export const permissionExtension = (pi: ExtensionAPI): void => {
	let mode: PermissionMode = DEFAULT_MODE;

	const report = (ctx: ExtensionContext | ExtensionCommandContext, next: PermissionMode): void => {
		mode = next;
		// The browser strips this prefix and renders its own labels; the prefix is what
		// tells one keyed status apart from another extension's.
		ctx.ui.setStatus(STATUS_KEY, `perm:${next}`);
		pi.events.emit("permission:mode", { mode: next });
	};

	const change = (next: PermissionMode, ctx: ExtensionCommandContext): void => {
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
				const requested = modeSchema.safeParse(asked);
				if (!requested.success) {
					ctx.ui.notify(`Unknown mode "${asked}". Use: ${MODES.join(", ")}`, "error");
					return;
				}
				change(requested.data, ctx);
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

	pi.on("session_start", async (_event, ctx) => {
		const fromFlag = modeSchema.safeParse(pi.getFlag("permission"));
		if (fromFlag.success) {
			// A flag beats what the session recorded, as it does in the terminal.
			mode = fromFlag.data;
		} else if (ctx.isProjectTrusted()) {
			const stored = ctx.sessionManager
				.getEntries()
				.filter((entry) => entry.type === "custom" && entry.customType === ENTRY_TYPE)
				.at(-1);
			const parsed = entrySchema.safeParse(stored);
			if (parsed.success) mode = parsed.data.data.mode;
		}
		report(ctx, mode);
	});

	// The mode is session state, so it is written where the session reads it back.
	pi.on("turn_start", async () => {
		pi.appendEntry(ENTRY_TYPE, { mode });
	});

	pi.on("tool_call", async (event, ctx) => {
		if (!asksBefore(mode, event.toolName)) return undefined;
		const detail = callDetail(event);
		if (!ctx.hasUI) {
			// Nothing can answer. Blocking is the only honest answer in a guarded mode.
			return { block: true, reason: `Blocked (${mode} needs a UI to confirm): ${detail}` };
		}
		const allowed = await ctx.ui.confirm(`Allow ${event.toolName}?`, detail);
		return allowed ? undefined : { block: true, reason: `Blocked by user: ${detail}` };
	});
};
