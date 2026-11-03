import { dirname, join } from "node:path";

import { Clock, Context, Effect, FileSystem, Layer, Option } from "effect";

import { AgentHome } from "./agent-home.ts";
import { isJsonObject } from "./patch.ts";
import type { JsonObject, JsonValue } from "./patch.ts";

/**
 * Epsilon's own log: JSON lines in `<home>/.epsilon/logs/`, and the terminal in dev.
 *
 * One process writes files, so rotation has no race. Secrets are redacted by key before a
 * line is written, because a provider error message can carry a key and a log is easier
 * to share than a conversation.
 *
 * An engine does not write its own log file: it sends `log` over the IPC channel and the
 * supervisor writes `engine-<sessionId>.log` here (12-gaps.md G4).
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogFields = Readonly<JsonObject>;

export type LogWriter = {
	readonly write: (level: LogLevel, message: string, fields?: LogFields) => Effect.Effect<void>;
};

export type LogApi = LogWriter & {
	/** The log for one chat's engine process, written by the parent. */
	readonly engine: (sessionId: string) => LogWriter;
};

export class Log extends Context.Service<Log, LogApi>()("epsilon/Log") {}

const secretKey = /api[-_]?key|token|authorization|secret|password|credential/i;
const redacted = "[redacted]";

/** Replaces the value of any key that looks like a secret, at any depth. */
export function redact(value: JsonValue): JsonValue {
	if (Array.isArray(value)) return value.map(redact);
	if (typeof value !== "object" || value === null) return value;
	const out: JsonObject = {};
	for (const [key, entry] of Object.entries(value)) {
		out[key] = secretKey.test(key) ? redacted : redact(entry);
	}
	return out;
}

const maxLogBytes = 5 * 1024 * 1024;
const keptLogFiles = 5;
const engineLogDays = 7;

/** A session id is not a file name: keep the readable part and drop the rest. */
const safeName = (sessionId: string): string => sessionId.replaceAll(/[^A-Za-z0-9._-]/g, "_");

export const LogLive = Layer.effect(
	Log,
	Effect.gen(function* () {
		const home = yield* AgentHome;
		const fs = yield* FileSystem.FileSystem;
		const dir = join(home.epsilonDir, "logs");
		const onTerminal = process.env["NODE_ENV"] !== "production";

		const dayMs = 24 * 60 * 60 * 1000;
		const pruneEngineLogs = Effect.gen(function* () {
			const now = yield* Clock.currentTimeMillis;
			const entries = yield* fs.readDirectory(dir).pipe(Effect.orElseSucceed(() => []));
			for (const name of entries) {
				if (!name.startsWith("engine-")) continue;
				const path = join(dir, name);
				const info = yield* fs.stat(path).pipe(Effect.orElseSucceed(() => undefined));
				if (info === undefined) continue;
				const modified = Option.getOrUndefined(info.mtime)?.getTime() ?? 0;
				if (now - modified > engineLogDays * dayMs) {
					yield* fs.remove(path).pipe(Effect.ignore);
				}
			}
		});

		const writer = (path: string): LogWriter => {
			const rotate: Effect.Effect<void> = Effect.gen(function* () {
				const size = yield* fs.stat(path).pipe(
					Effect.map((info) => Number(info.size)),
					Effect.orElseSucceed(() => 0),
				);
				if (size < maxLogBytes) return;
				for (let index = keptLogFiles - 1; index >= 1; index--) {
					yield* fs.rename(`${path}.${index}`, `${path}.${index + 1}`).pipe(Effect.ignore);
				}
				yield* fs.rename(path, `${path}.1`).pipe(Effect.ignore);
			});

			const write = (
				level: LogLevel,
				message: string,
				fields: LogFields = {},
			): Effect.Effect<void> =>
				Effect.gen(function* () {
					const safe = redact(fields);
					const extra: JsonObject = isJsonObject(safe) ? safe : {};
					const line = JSON.stringify({
						...extra,
						level,
						message,
						time: new Date().toISOString(),
					});
					if (onTerminal) process.stderr.write(`${level}: ${message}\n`);
					yield* fs.makeDirectory(dirname(path), { recursive: true }).pipe(Effect.ignore);
					yield* rotate;
					yield* fs.writeFileString(path, `${line}\n`, { flag: "a" }).pipe(Effect.ignore);
				});

			return { write };
		};

		yield* pruneEngineLogs;
		const main = writer(join(dir, "epsilon.log"));
		return {
			engine: (sessionId: string) => writer(join(dir, `engine-${safeName(sessionId)}.log`)),
			write: main.write,
		};
	}),
);
