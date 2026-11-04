import { join } from "node:path";

import { Context, Effect, FileSystem, Layer, Option, Schema } from "effect";

import { mcpNamespaceOf } from "../../../domain/mcp/rules.ts";
import { withDefined } from "../../../domain/object.ts";
import { AgentHome } from "../../platform/agent-home.ts";
import type { AgentHomeApi } from "../../platform/agent-home.ts";
import { NotJson } from "../../platform/errors.ts";
import type { FileUnreadable, FileUnwritable, Locked } from "../../platform/errors.ts";
import { readRangeSync, statFile } from "../../platform/files.ts";
import { JsonDocument } from "../../platform/json-document.ts";
import type { JsonDocumentApi, JsonObject, JsonValue } from "../../platform/json-document.ts";
import { isJsonObject } from "../../platform/patch.ts";

/**
 * The two `mcp.json` files as documents, and the two files a connection leaves behind.
 *
 * A missing file is an empty document; a file that cannot be read or parsed is a problem
 * with a path, never a crash, because the other file still lists its servers. A write
 * refuses a document it cannot parse rather than replacing the operator's configuration.
 * The log and the credential store are read without ever touching a token: pi exposes no
 * connection state, so these are the only facts a detail pane can add.
 */

/** One file, read for the panel. A `problem` means none of its servers are listed. */
export type McpFileRead = {
	readonly autoEnableCodemode?: boolean;
	readonly servers: Readonly<Record<string, JsonValue>>;
	readonly problem?: string;
};

export type McpStoreApi = {
	/** Read the global file, or one project's; a missing file is empty. */
	readonly read: (scope: "global" | "project", folder: string) => Effect.Effect<McpFileRead>;
	/**
	 * Read, change and write one file inside its lock. `change` may refuse, and a file that
	 * cannot be parsed is refused before the change runs. The platform errors are the
	 * caller's to map, so a feature decides the sentence.
	 */
	readonly edit: <E, R>(
		scope: "global" | "project",
		folder: string,
		change: (document: JsonObject) => Effect.Effect<JsonObject, E, R>,
	) => Effect.Effect<JsonObject, E | FileUnreadable | FileUnwritable | Locked | NotJson, R>;
	/** The tail of pi's `mcp.log` for one server, newest lines last. */
	readonly logTail: (server: string) => Effect.Effect<ReadonlyArray<string>>;
	/** Whether `mcp-auth.json` holds a credential for this server. */
	readonly hasCredentials: (server: string, url: string | undefined) => Effect.Effect<boolean>;
};

export class McpStore extends Context.Service<McpStore, McpStoreApi>()("epsilon/McpStore") {}

/** The detail pane's tail: pi rotates `mcp.log` at 5 MB. */
const logBytes = 64 * 1024;

/** The most lines one server's detail carries, so a chatty server cannot fill the page. */
const maxLogLines = 40;

const problemText = (error: FileUnreadable | NotJson): string =>
	error instanceof NotJson
		? `${error.path} is not valid JSON: ${error.reason}`
		: `${error.path} could not be read: ${error.reason}`;

const projectFile = (folder: string): string => join(folder, ".pi", "mcp.json");

/** A file that exists and holds a regular file of a bounded size, or nothing to read. */
const tailOf = Effect.fn("McpStore.tailOf")(function* (path: string, server: string) {
	const info = yield* statFile(path).pipe(
		Effect.match({ onFailure: () => undefined, onSuccess: (stats) => stats }),
	);
	if (info === undefined || info.size === 0) return [];
	const length = Math.min(info.size, logBytes);
	const text = yield* readRangeSync(path, info.size - length, length).pipe(
		Effect.orElseSucceed(() => ""),
	);
	const marker = `[${server}]`;
	return text
		.split("\n")
		.map((line) => line.trimEnd())
		.filter((line) => line.includes(marker))
		.slice(-maxLogLines);
});

export const makeMcpStore = (
	home: AgentHomeApi,
	documents: JsonDocumentApi,
	fs: FileSystem.FileSystem,
): McpStoreApi => {
	const globalFile = join(home.agentDir, "mcp.json");
	const pathOf = (scope: "global" | "project", folder: string): string =>
		scope === "global" ? globalFile : projectFile(folder);

	const read: McpStoreApi["read"] = Effect.fn("McpStore.read")(function* (scope, folder) {
		const path = pathOf(scope, folder);
		const document = yield* documents.read(path).pipe(
			Effect.provideService(FileSystem.FileSystem, fs),
			Effect.match({
				onFailure: (error) => ({ failure: problemText(error) }),
				onSuccess: (value) => ({ value }),
			}),
		);
		if ("failure" in document) {
			return { problem: document.failure, servers: {} } satisfies McpFileRead;
		}
		const current = document.value;
		const problems: string[] = [];
		const servers = current["mcpServers"];
		let listed: Readonly<Record<string, JsonValue>> = {};
		if (servers !== undefined) {
			if (isJsonObject(servers)) listed = servers;
			else problems.push(`${path}: "mcpServers" must be an object, so its servers are not listed.`);
		}
		// Per key, as pi does: a value that is not a boolean is reported and ignored, and
		// the servers in that file still load.
		const auto = current["autoEnableCodemode"];
		const autoEnableCodemode = Option.getOrUndefined(
			Schema.decodeUnknownOption(Schema.Boolean)(auto),
		);
		if (auto !== undefined && autoEnableCodemode === undefined) {
			problems.push(`${path}: "autoEnableCodemode" must be true or false.`);
		}
		return withDefined(
			withDefined(
				{ servers: listed } satisfies McpFileRead,
				"autoEnableCodemode",
				autoEnableCodemode,
			),
			"problem",
			problems.length === 0 ? undefined : problems.join(" "),
		);
	});

	const edit: McpStoreApi["edit"] = Effect.fn("McpStore.edit")((scope, folder, change) =>
		documents.edit(pathOf(scope, folder), change).pipe(
			Effect.provideService(FileSystem.FileSystem, fs),
			// The home's file may hold `env` and header secrets, and a file pi created
			// earlier may be world-readable. A repository's file keeps its own mode.
			Effect.tap(() =>
				scope === "global"
					? fs.chmod(pathOf(scope, folder), 0o600).pipe(Effect.ignore)
					: Effect.void,
			),
		),
	);

	const logTail: McpStoreApi["logTail"] = Effect.fn("McpStore.logTail")(function* (server) {
		const current = yield* tailOf(join(home.agentDir, "mcp.log"), server);
		if (current.length > 0) return current;
		return yield* tailOf(join(home.agentDir, "mcp.log.1"), server);
	});

	const hasCredentials: McpStoreApi["hasCredentials"] = Effect.fn("McpStore.hasCredentials")(
		function* (server, url) {
			const path = join(home.agentDir, "mcp-auth.json");
			const info = yield* statFile(path).pipe(
				Effect.match({ onFailure: () => undefined, onSuccess: (stats) => stats }),
			);
			if (info === undefined || info.size > 1_000_000) return false;
			const document = yield* documents
				.read(path)
				.pipe(
					Effect.provideService(FileSystem.FileSystem, fs),
					Effect.match({ onFailure: () => undefined, onSuccess: (value) => value }),
				);
			if (document === undefined) return false;
			const prefix = `${mcpNamespaceOf(server)}|`;
			const legacy = url === undefined ? undefined : String(new URL(url));
			return Object.keys(document).some(
				(key) => key.startsWith(prefix) || (legacy !== undefined && key === legacy),
			);
		},
	);

	return { edit, hasCredentials, logTail, read };
};

export const McpStoreLive: Layer.Layer<
	McpStore,
	never,
	AgentHome | JsonDocument | FileSystem.FileSystem
> = Layer.effect(
	McpStore,
	Effect.gen(function* () {
		const home = yield* AgentHome;
		const documents = yield* JsonDocument;
		const fs = yield* FileSystem.FileSystem;
		return makeMcpStore(home, documents, fs);
	}),
);
