import { Context, Effect, Layer, Option, Schedule } from "effect";
import type { Schema } from "effect";
import { HttpClient, HttpClientResponse } from "effect/http";

import type {
	McpRegistryDetail,
	McpRegistrySearch,
	McpRegistrySource,
} from "#protocol/config/mcp-registry";
import { RegistryNotFound, RegistryUnavailable } from "#protocol/errors";

import { withDefined } from "../../../domain/object.ts";
import { detailOf, fromGithub, itemOf } from "./domain.ts";
import { GithubList, OfficialList, OfficialOne } from "./upstream.ts";

/**
 * Reads the two public MCP registries. Nothing is stored: every call asks the registry
 * again, so the panel shows what the registry says now.
 *
 * A transport failure is retried twice; a 404 is an answer, not a failure, because the
 * official registry's versioned prefixes and the GitHub fallback both use it to say
 * "not here".
 */

const OFFICIAL = "https://registry.modelcontextprotocol.io";
const GITHUB = "https://api.mcp.github.com";
/** The official registry's versioned prefixes, newest guess last. */
const OFFICIAL_PREFIXES = ["/v0", "/v0.1"];
const GITHUB_NOTE = "From GitHub's registry: environment variables may be missing.";
const PAGE_SIZE = 20;

const LABELS: Record<McpRegistrySource, string> = {
	official: "The official registry",
	github: "GitHub's registry",
};

const retrySchedule = Schedule.exponential("200 millis").pipe(
	Schedule.jittered,
	Schedule.upTo({ times: 2 }),
);

const describe = (cause: unknown): string =>
	cause instanceof Error ? cause.message : String(cause);

const trimBase = (base: string): string => base.replace(/\/+$/, "");

/** The query one search reads. The wire's optional fields are absent when unset. */
export type McpRegistrySearchInput = {
	readonly source: McpRegistrySource;
	readonly q?: string | undefined;
	readonly cursor?: string | undefined;
};

export type McpRegistryServiceApi = {
	readonly search: (
		input: McpRegistrySearchInput,
	) => Effect.Effect<McpRegistrySearch, RegistryUnavailable>;
	readonly read: (
		source: McpRegistrySource,
		name: string,
	) => Effect.Effect<McpRegistryDetail, RegistryUnavailable | RegistryNotFound>;
};

export class McpRegistryService extends Context.Service<
	McpRegistryService,
	McpRegistryServiceApi
>()("epsilon/McpRegistryService") {}

export const makeMcpRegistryService = (deps: {
	readonly client: HttpClient.HttpClient;
	readonly officialBase?: string;
	readonly githubBase?: string;
}): McpRegistryServiceApi => {
	const officialBase = trimBase(deps.officialBase ?? OFFICIAL);
	const githubBase = trimBase(deps.githubBase ?? GITHUB);

	/**
	 * The answer at a URL, read with the schema the caller expects, or `none` for a 404.
	 * Only the request is retried: a 404 and an unreadable body are answers.
	 */
	const getParsed = <A>(
		source: McpRegistrySource,
		url: string,
		schema: Schema.Codec<A, unknown>,
	): Effect.Effect<Option.Option<A>, RegistryUnavailable> =>
		Effect.gen(function* () {
			const label = LABELS[source];
			const response = yield* deps.client
				.get(url, { acceptJson: true, headers: { "User-Agent": "epsilon" } })
				.pipe(
					Effect.timeout("10 seconds"),
					Effect.retry(retrySchedule),
					Effect.mapError(
						(error) =>
							new RegistryUnavailable({
								reason: `${label} could not be reached: ${describe(error)}`,
							}),
					),
				);
			if (response.status === 404) return Option.none<A>();
			if (response.status < 200 || response.status >= 300) {
				return yield* new RegistryUnavailable({
					reason: `${label} answered ${response.status}`,
				});
			}
			const decoded = yield* Effect.timeoutOrElse(
				HttpClientResponse.schemaBodyJson(schema)(response).pipe(
					Effect.mapError(
						() =>
							new RegistryUnavailable({
								reason: `${label} sent an answer this version cannot read`,
							}),
					),
				),
				{
					duration: "10 seconds",
					orElse: () =>
						Effect.fail(
							new RegistryUnavailable({
								reason: `${label} did not send a complete answer in 10 s`,
							}),
						),
				},
			);
			return Option.some(decoded);
		});

	/** An official path under the first versioned prefix that knows it. */
	const getOfficial = <A>(
		path: string,
		schema: Schema.Codec<A, unknown>,
	): Effect.Effect<Option.Option<A>, RegistryUnavailable> =>
		Effect.gen(function* () {
			for (const prefix of OFFICIAL_PREFIXES) {
				const found = yield* getParsed("official", `${officialBase}${prefix}${path}`, schema);
				if (Option.isSome(found)) return found;
			}
			return Option.none<A>();
		});

	const search: McpRegistryServiceApi["search"] = Effect.fn("McpRegistry.search")(
		function* (input) {
			const text = input.q?.trim() ?? "";
			const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
			if (input.cursor !== undefined && input.cursor !== "") params.set("cursor", input.cursor);

			if (input.source === "official") {
				params.set("version", "latest");
				// The registry refuses a search under three characters; browsing is the nearest answer.
				if (text.length >= 3) params.set("search", text);
				const list = yield* getOfficial(`/servers?${params.toString()}`, OfficialList);
				if (Option.isNone(list)) {
					return yield* new RegistryUnavailable({
						reason: `${LABELS.official} has no server list`,
					});
				}
				const next = list.value.metadata?.nextCursor ?? undefined;
				return withDefined(
					{
						items: list.value.servers.map((entry) => itemOf("official", entry.server)),
					} satisfies McpRegistrySearch,
					"nextCursor",
					next === "" ? undefined : next,
				);
			}

			if (text !== "") params.set("search", text);
			const list = yield* getParsed(
				"github",
				`${githubBase}/v0/servers?${params.toString()}`,
				GithubList,
			);
			if (Option.isNone(list)) {
				return yield* new RegistryUnavailable({
					reason: `${LABELS.github} has no server list`,
				});
			}
			const next = list.value.metadata?.next_cursor ?? undefined;
			return withDefined(
				{
					items: list.value.servers.map((entry) => itemOf("github", fromGithub(entry.server))),
				} satisfies McpRegistrySearch,
				"nextCursor",
				next === "" ? undefined : next,
			);
		},
	);

	const officialDetail = (
		name: string,
	): Effect.Effect<Option.Option<McpRegistryDetail>, RegistryUnavailable> =>
		getOfficial(`/servers/${encodeURIComponent(name)}/versions/latest`, OfficialOne).pipe(
			Effect.map(Option.map((one) => detailOf(one.server))),
		);

	const read: McpRegistryServiceApi["read"] = Effect.fn("McpRegistry.read")(
		function* (source, name) {
			// GitHub's packages lack variables and arguments; the official entry of the same name
			// has them, so it is tried first for either source.
			const official = yield* officialDetail(name);
			if (Option.isSome(official)) return official.value;
			if (source === "official") return yield* new RegistryNotFound({ server: name });

			const params = new URLSearchParams({ limit: String(PAGE_SIZE), search: name });
			const list = yield* getParsed(
				"github",
				`${githubBase}/v0/servers?${params.toString()}`,
				GithubList,
			);
			if (Option.isNone(list)) return yield* new RegistryNotFound({ server: name });
			const found = list.value.servers.find((entry) => entry.server.name === name);
			if (found === undefined) return yield* new RegistryNotFound({ server: name });
			return detailOf(fromGithub(found.server), GITHUB_NOTE);
		},
	);

	return { read, search };
};

export const McpRegistryServiceLive: Layer.Layer<McpRegistryService, never, HttpClient.HttpClient> =
	Layer.effect(
		McpRegistryService,
		Effect.map(HttpClient.HttpClient, (client) => makeMcpRegistryService({ client })),
	);
