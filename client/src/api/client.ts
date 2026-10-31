/**
 * The one REST client, typed by the OpenAPI document the server generates. A
 * response is not parsed again in the browser: the server stamps each answer with
 * the id of its contract, and an id this build was not generated from becomes a
 * `StaleContractError`, which the app shows as one reload notice.
 */
import createClient from "openapi-fetch";
import type { Middleware } from "openapi-fetch";

import { CONTRACT_ID } from "./contract.gen";
import type { paths } from "./schema.gen";

export const OFFLINE = "The server is not reachable.";

const CONTRACT_HEADER = "x-epsilon-contract";

/** This page was built against another contract than the server now speaks. */
export class StaleContractError extends Error {
	constructor() {
		super("This page is older than the server.");
		this.name = "StaleContractError";
	}
}

/**
 * A refusal that carries the sentence the route documented, and the status it answered
 * with. A caller that has its own answer for one status, such as "this resource is
 * gone", reads it here instead of matching on the sentence.
 */
export class RefusalError extends Error {
	readonly status: number;

	constructor(message: string, status: number) {
		super(message);
		this.name = "RefusalError";
		this.status = status;
	}
}

/** What failed, per route, for a refusal that carries no sentence of its own. */
const FAILURES = new Map([
	["GET /api/sessions", "The session list did not load"],
	["DELETE /api/sessions/{id}", "Delete failed"],
	["DELETE /api/projects/sessions", "The project was not removed"],
	["POST /api/sessions/{id}/move", "The chat was not moved"],
	["GET /api/projects/status", "The folder did not load"],
	["POST /api/projects/trust", "The folder was not trusted"],
	["GET /api/projects/folders", "The folder list did not load"],
	["GET /api/settings", "Settings did not load"],
	["GET /api/readiness", "Readiness did not load"],
	["GET /api/settings/providers/{id}", "The provider did not load"],
	["POST /api/settings/providers/models", "The models did not load"],
	["POST /api/settings/providers", "The provider was not saved"],
	["POST /api/settings/providers/test", "The provider did not answer"],
	["DELETE /api/settings/providers/{id}", "The provider was not removed"],
	["PUT /api/settings/default-model", "The default model was not saved"],
	["POST /api/settings/mcp", "The MCP server was not saved"],
	["GET /api/settings/mcp/registry/search", "The registry did not answer"],
	["GET /api/settings/mcp/registry/server", "The registry server did not load"],
	["GET /api/settings/mcp/{scope}/{name}", "The MCP server did not load"],
	["DELETE /api/settings/mcp/{scope}/{name}", "The MCP server was not removed"],
	["GET /api/settings/mcp/{scope}/{name}/raw", "The MCP entry did not load"],
	["PUT /api/settings/mcp/{scope}/{name}/raw", "The MCP entry was not saved"],
	["POST /api/settings/mcp/enabled", "The MCP server was not switched"],
	["POST /api/settings/mcp/in-project", "The project setting was not saved"],
	["GET /api/settings/skills/{root}/{name}", "The skill did not load"],
	["GET /api/settings/skills/listed", "The skill did not load"],
	["PUT /api/settings/skills/{root}/{name}", "The skill was not saved"],
	["DELETE /api/settings/skills/{root}/{name}", "The skill was not removed"],
	["POST /api/settings/skills/enabled", "The skill was not switched"],
	["GET /api/settings/skills/{root}/{name}/files", "The skill's files did not load"],
	["GET /api/settings/skills/{root}/{name}/file", "The file did not load"],
	["PUT /api/settings/skills/{root}/{name}/file", "The file was not saved"],
	["GET /api/settings/skills/{root}/{name}/raw", "SKILL.md did not load"],
	["PUT /api/settings/skills/{root}/{name}/raw", "SKILL.md was not saved"],
	["GET /api/settings/skills/listed-files", "The skill's files did not load"],
	["GET /api/settings/skills/listed-file", "The file did not load"],
	["DELETE /api/settings/skills/{root}/{name}/file", "The file was not removed"],
	["POST /api/settings/skills/folders/link", "The folder was not linked"],
	["POST /api/settings/skills/folders/unlink", "The folder was not unlinked"],
	["POST /api/settings/skills/import/upload", "The upload was not read"],
	["POST /api/settings/skills/import/source", "The source was not fetched"],
	["POST /api/settings/skills/import/{stageId}/commit", "The skills were not installed"],
	["DELETE /api/settings/skills/import/{stageId}", "The import was not discarded"],
	["POST /api/settings/packages", "The package was not installed"],
	["DELETE /api/settings/packages", "The package was not removed"],
]);

const refusalMessage = async (response: Response): Promise<string | undefined> => {
	const body: { message?: string } | null = await response.json().catch(() => null);
	return body?.message || undefined;
};

const contractGuard: Middleware = {
	onError: () => new Error(OFFLINE),
	onResponse: async ({ request, response, schemaPath }) => {
		const stamped = response.headers.get(CONTRACT_HEADER);
		if (stamped !== null && stamped !== CONTRACT_ID) throw new StaleContractError();
		if (response.ok) return undefined;
		const failure = FAILURES.get(`${request.method} ${schemaPath}`) ?? "The request failed";
		throw new RefusalError(
			(await refusalMessage(response)) ?? `${failure} (${response.status}).`,
			response.status,
		);
	},
};

export const api = createClient<paths>({ baseUrl: location.origin });
api.use(contractGuard);
