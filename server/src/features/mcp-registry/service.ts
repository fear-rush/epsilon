/**
 * Reads the two public MCP registries. Nothing is stored: every call asks the
 * registry again, so what the panel shows is what the registry says now.
 */
import type { z } from "zod";

import type { RegistryDetail, RegistrySearch, RegistrySource } from "./contract";
import { detailOf, fromGithub, itemOf } from "./domain";
import { githubListSchema, officialListSchema, officialOneSchema } from "./upstream";

/** The part of `fetch` this feature uses, so a test can answer instead of the network. */
export type Fetcher = (
	url: string,
	init: { headers: Record<string, string>; signal: AbortSignal },
) => Promise<Response>;

const PAGE_SIZE = 20;
const TIMEOUT_MS = 10_000;

const OFFICIAL = "https://registry.modelcontextprotocol.io";
const GITHUB = "https://api.mcp.github.com";
/** The official registry's versioned prefixes, newest guess last. */
const OFFICIAL_PREFIXES = ["/v0", "/v0.1"];
const GITHUB_NOTE = "From GitHub's registry: environment variables may be missing.";

const LABELS: Record<RegistrySource, string> = {
	official: "The official registry",
	github: "GitHub's registry",
};

/** The registry did not answer, or answered something this version cannot read. */
export class RegistryUnavailableError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "RegistryUnavailableError";
	}
}

export class RegistryNotFoundError extends Error {
	constructor(name: string) {
		super(`The registry has no server named ${name}`);
		this.name = "RegistryNotFoundError";
	}
}

/**
 * The answer at a URL, read with the schema the caller expects, or undefined for a
 * 404. Anything else that is not a 2xx, or not that shape, is unavailable.
 */
async function getParsed<Schema extends z.ZodType>(
	fetcher: Fetcher,
	source: RegistrySource,
	url: string,
	schema: Schema,
): Promise<z.infer<Schema> | undefined> {
	const label = LABELS[source];
	let response: Response;
	try {
		response = await fetcher(url, {
			headers: { "User-Agent": "epsilon", Accept: "application/json" },
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
	} catch (cause) {
		const reason = cause instanceof Error ? cause.message : "unknown error";
		throw new RegistryUnavailableError(`${label} could not be reached: ${reason}`, { cause });
	}
	if (response.status === 404) return undefined;
	if (!response.ok) {
		throw new RegistryUnavailableError(`${label} answered ${response.status}`);
	}
	let json: unknown;
	try {
		json = await response.json();
	} catch (cause) {
		throw new RegistryUnavailableError(`${label} sent an answer that is not JSON`, { cause });
	}
	const parsed = schema.safeParse(json);
	if (parsed.success) return parsed.data;
	throw new RegistryUnavailableError(`${label} sent an answer this version cannot read`);
}

/** An official path under the first versioned prefix that knows it; undefined when none does. */
async function getOfficial<Schema extends z.ZodType>(
	fetcher: Fetcher,
	path: string,
	schema: Schema,
): Promise<z.infer<Schema> | undefined> {
	for (const prefix of OFFICIAL_PREFIXES) {
		const found = await getParsed(fetcher, "official", `${OFFICIAL}${prefix}${path}`, schema);
		if (found !== undefined) return found;
	}
	return undefined;
}

export async function searchRegistry(
	fetcher: Fetcher,
	query: { source: RegistrySource; q?: string | undefined; cursor?: string | undefined },
): Promise<RegistrySearch> {
	const text = query.q?.trim() ?? "";
	const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
	if (query.cursor !== undefined && query.cursor !== "") params.set("cursor", query.cursor);

	if (query.source === "official") {
		params.set("version", "latest");
		// The registry refuses a search under three characters; browsing is the nearest answer.
		if (text.length >= 3) params.set("search", text);
		const list = await getOfficial(fetcher, `/servers?${params}`, officialListSchema);
		if (list === undefined)
			throw new RegistryUnavailableError(`${LABELS.official} has no server list`);
		const result: RegistrySearch = {
			items: list.servers.map((entry) => itemOf("official", entry.server)),
		};
		const next = list.metadata?.nextCursor;
		if (next !== undefined && next !== "") result.nextCursor = next;
		return result;
	}

	if (text !== "") params.set("search", text);
	const list = await getParsed(
		fetcher,
		"github",
		`${GITHUB}/v0/servers?${params}`,
		githubListSchema,
	);
	if (list === undefined) throw new RegistryUnavailableError(`${LABELS.github} has no server list`);
	const result: RegistrySearch = {
		items: list.servers.map((entry) => itemOf("github", fromGithub(entry.server))),
	};
	const next = list.metadata?.next_cursor;
	if (next !== undefined && next !== "") result.nextCursor = next;
	return result;
}

async function officialDetail(fetcher: Fetcher, name: string): Promise<RegistryDetail | undefined> {
	const one = await getOfficial(
		fetcher,
		`/servers/${encodeURIComponent(name)}/versions/latest`,
		officialOneSchema,
	);
	return one === undefined ? undefined : detailOf(one.server);
}

export async function readRegistryServer(
	fetcher: Fetcher,
	source: RegistrySource,
	name: string,
): Promise<RegistryDetail> {
	// GitHub's packages lack variables and arguments; the official entry of the same name has them.
	const official = await officialDetail(fetcher, name);
	if (official !== undefined) return official;
	if (source === "official") throw new RegistryNotFoundError(name);

	const params = new URLSearchParams({ limit: String(PAGE_SIZE), search: name });
	const list = await getParsed(
		fetcher,
		"github",
		`${GITHUB}/v0/servers?${params}`,
		githubListSchema,
	);
	if (list === undefined) throw new RegistryNotFoundError(name);
	const found = list.servers.find((entry) => entry.server.name === name);
	if (found === undefined) throw new RegistryNotFoundError(name);
	return detailOf(fromGithub(found.server), GITHUB_NOTE);
}
