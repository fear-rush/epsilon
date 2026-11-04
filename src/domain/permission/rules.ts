import { Option, Schema } from "effect";

/**
 * The approval policies the bundled permission extension understands. The extension, its
 * `/permission` command and the composer's menu all read this list, so a mode cannot
 * exist on one side only. The words a person reads stay with each surface; only the
 * values cross.
 */

export const PermissionMode = Schema.Literals(["strict", "ask", "yolo"]);
export type PermissionMode = typeof PermissionMode.Type;

export const PERMISSION_MODE_VALUES = PermissionMode.literals;

/** The keyed status the extension reports the mode through. */
export const PERMISSION_STATUS_KEY = "permission";

const STATUS_PREFIX = "perm:";

export const permissionStatusText = (mode: PermissionMode): string => `${STATUS_PREFIX}${mode}`;

/** The mode a keyed status carries, or undefined for another extension's status. */
export const parsePermissionStatus = (text: string): PermissionMode | undefined => {
	if (!text.startsWith(STATUS_PREFIX)) return undefined;
	const parsed = Schema.decodeUnknownOption(PermissionMode)(text.slice(STATUS_PREFIX.length));
	return Option.isSome(parsed) ? parsed.value : undefined;
};

/**
 * Which tool calls stop for a person under each mode.
 *
 * `yolo` stops for none. The two guarded modes stop for any tool that declares
 * `destructiveHint`: an MCP server or a custom tool describes its own danger, and a name
 * check alone would run it without asking. pi's built-ins keep their own rules behind
 * that: `bash` always asks, `write` and `edit` only in `strict`.
 */
export const toolStops = (
	mode: PermissionMode,
	toolName: string,
	destructiveHint: boolean | undefined,
): boolean => {
	if (mode === "yolo") return false;
	if (destructiveHint === true) return true;
	if (mode === "strict") return toolName === "bash" || toolName === "write" || toolName === "edit";
	return toolName === "bash";
};
