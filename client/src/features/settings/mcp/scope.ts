import type { McpScope } from "shared";

/** A scope from the URL; anything but "project" reads as the global file. */
export const asScope = (value: string): McpScope => (value === "project" ? "project" : "global");
