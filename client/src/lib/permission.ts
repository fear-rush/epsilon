/** The three policies pi's permission extension understands. */
export const PERMISSION_MODES = [
	{ value: "strict", label: "Strict", description: "Ask before every command and edit" },
	{ value: "ask", label: "Ask", description: "Ask before commands, writes allowed" },
	{ value: "yolo", label: "Yolo", description: "Only ask for dangerous commands" },
] as const;

export type PermissionMode = (typeof PERMISSION_MODES)[number]["value"];
