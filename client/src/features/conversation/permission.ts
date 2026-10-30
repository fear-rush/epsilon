import { PERMISSION_MODE_VALUES } from "shared";
import type { PermissionMode } from "shared";

export type { PermissionMode };

/**
 * The words the browser shows for each mode. The values come from `shared`, so a
 * mode cannot exist on one side only. Yolo asks for nothing, and its description
 * says so.
 */
const WORDS: Record<PermissionMode, { label: string; description: string }> = {
	strict: { label: "Strict", description: "Ask before every command and edit" },
	ask: { label: "Ask", description: "Ask before commands, writes allowed" },
	yolo: { label: "Yolo", description: "Run everything without asking" },
};

export const PERMISSION_MODES = PERMISSION_MODE_VALUES.map((value) => ({ value, ...WORDS[value] }));
