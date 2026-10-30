/**
 * The two `mcp.json` files as documents. A missing file is an empty document, a
 * file that is not a regular file of a bounded size is reported by path, and a
 * parse error never quotes the file (it may hold a literal secret). The entry
 * shape itself is in `domain.ts`.
 *
 * The agent home's file is always 0600; a project file keeps the mode the
 * repository gave it, and is created 0644.
 */
import { basename } from "node:path";
import type { McpScope } from "shared";
import { z } from "zod";

import type { AgentHome } from "../../platform/agent-home";
import { projectMcpFile } from "../../platform/agent-home";
import { jsonDocument } from "../../platform/json-document";
import type { JsonDocument, ProblemCause, Wording } from "../../platform/json-document";

/** The JSON a file holds, decoded at the read boundary and kept as it was. */
const mcpFileSchema = z.looseObject({
	autoEnableCodemode: z.boolean().optional(),
	mcpServers: z.record(z.string(), z.json()).optional(),
});

export type McpFile = z.infer<typeof mcpFileSchema>;

const consequences: Record<ProblemCause, string> = {
	"not-file": "is not a regular file",
	"too-large": "is larger than 1 MB",
	unreadable: "could not be read",
	"not-json": "is not valid JSON",
	"wrong-shape": 'is not an object with an "mcpServers" object',
};

/** A problem means no server of that file is listed; the other file still lists. */
const wording: Wording = {
	problem: (cause, path) => `${path} ${consequences[cause]}, so its servers are not listed.`,
	// A write must never replace a file it cannot read, or it would drop the operator's config.
	refusal: (path, problem) => `${basename(path)} cannot be written: ${problem}`,
};

/** The file one scope writes, which is also the file pi loads for it. */
export const mcpDocument = (
	scope: McpScope,
	home: AgentHome,
	projectDir: string,
): JsonDocument<McpFile> =>
	jsonDocument(scope === "global" ? home.mcpFile : projectMcpFile(projectDir), {
		schema: mcpFileSchema,
		empty: () => ({ mcpServers: {} }),
		policy: scope === "global" ? "private" : "project",
		wording,
	});
