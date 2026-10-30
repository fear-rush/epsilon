import { z } from "zod";

/**
 * The approval policies the bundled permission extension understands. The
 * extension, its terminal command and the browser control all read this list, so
 * a mode cannot exist on one side only. The words shown to a person stay with
 * each surface; only the values cross.
 */
export const permissionModeSchema = z.enum(["strict", "ask", "yolo"]);

export type PermissionMode = z.infer<typeof permissionModeSchema>;

export const PERMISSION_MODE_VALUES = permissionModeSchema.options;

/**
 * The keyed status the extension reports the mode through. The browser reads it
 * back with `parsePermissionStatus`, so the prefix is written once.
 */
export const PERMISSION_STATUS_KEY = "permission";

const STATUS_PREFIX = "perm:";

export const permissionStatusText = (mode: PermissionMode): string => `${STATUS_PREFIX}${mode}`;

/** The mode a keyed status carries, or undefined for another extension's status. */
export const parsePermissionStatus = (text: string): PermissionMode | undefined => {
	if (!text.startsWith(STATUS_PREFIX)) return undefined;
	const parsed = permissionModeSchema.safeParse(text.slice(STATUS_PREFIX.length));
	return parsed.success ? parsed.data : undefined;
};
