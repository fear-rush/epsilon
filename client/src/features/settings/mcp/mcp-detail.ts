import type { McpScope } from "shared";

import type { McpServerDetail } from "@/api/types";

/** A scope from the URL; anything but "project" reads as the global file. */
export const asScope = (value: string): McpScope => (value === "project" ? "project" : "global");

/**
 * The entry kinds of the MCP detail, named once so each pane takes the one it
 * can render. `kind` is the discriminator the server resolves.
 */

export type McpServerEntryDetail = Extract<McpServerDetail, { kind: "server" }>;

type McpOverrideDetail = Extract<McpServerDetail, { kind: "override" }>;

type McpInvalidDetail = Extract<McpServerDetail, { kind: "invalid" }>;

/** An override, or an invalid entry that was meant as one: the pane for both has no target form. */
export type McpOverrideSubject = McpOverrideDetail | McpInvalidDetail;

export const isOverrideSubject = (
	detail: McpServerDetail | undefined,
): detail is McpOverrideSubject =>
	detail?.kind === "override" || (detail?.kind === "invalid" && detail.overrideKeys !== undefined);
