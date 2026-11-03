import { Effect } from "effect";

import { ImportFailed } from "#protocol/errors";

import { writeStreamCapped } from "../../platform/files.ts";

/**
 * A source fetched over the web, to a file, with the cap applied while it arrives.
 *
 * A page that pasted a URL expects one download, not a whole repository clone. The body is
 * counted as it streams (F8k): a server that sends no `content-length` cannot make Epsilon
 * hold more than the cap in memory or on disk.
 */

export type DownloadOptions = {
	readonly url: string;
	readonly path: string;
	readonly maxBytes: number;
	readonly timeoutMs: number;
	/** The message a refusal names; the source the person pasted. */
	readonly source?: string;
};

const refused = (options: DownloadOptions, reason: string): ImportFailed =>
	new ImportFailed(options.source === undefined ? { reason } : { reason, source: options.source });

const tooLarge = (options: DownloadOptions): ImportFailed =>
	refused(options, `The download is larger than ${Math.round(options.maxBytes / 1024)} KiB.`);

/** The body to stream, or the refusal that explains why there is none. */
const bodyOf = (
	options: DownloadOptions,
	response: Response,
): Effect.Effect<ReadableStream<Uint8Array>, ImportFailed> => {
	if (!response.ok) return Effect.fail(refused(options, `The server answered ${response.status}.`));
	const declared = Number(response.headers.get("content-length") ?? "0");
	if (declared > options.maxBytes) return Effect.fail(tooLarge(options));
	if (response.body === null) return Effect.fail(refused(options, "The server sent no body."));
	return Effect.succeed(response.body);
};

export const download = (options: DownloadOptions): Effect.Effect<void, ImportFailed> =>
	Effect.gen(function* () {
		const response = yield* Effect.tryPromise({
			try: () =>
				fetch(options.url, {
					redirect: "follow",
					signal: AbortSignal.timeout(options.timeoutMs),
				}),
			catch: (cause) =>
				refused(
					options,
					`The download failed (${cause instanceof Error ? cause.message : String(cause)}).`,
				),
		});
		const body = yield* bodyOf(options, response);
		yield* writeStreamCapped(options.path, body, options.maxBytes).pipe(
			Effect.catchTags({
				FileTooLarge: () => Effect.fail(tooLarge(options)),
				FileUnwritable: (error) => Effect.fail(refused(options, error.reason)),
			}),
		);
	});
