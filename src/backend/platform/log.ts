import { dirname, join } from "node:path";

import { Context, Effect, FileSystem, Layer } from "effect";

import { AgentHome } from "./agent-home.ts";
import { isJsonObject } from "./patch.ts";
import type { JsonObject, JsonValue } from "./patch.ts";

/**
 * Epsilon's own log: JSON lines in `<home>/.epsilon/logs/`, and the terminal in dev.
 *
 * One process writes files, so rotation has no race. Secrets are redacted by key before a
 * line is written, because a provider error message can carry a key and a log is easier
 * to share than a conversation.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogFields = Readonly<JsonObject>;

export type LogApi = {
	readonly write: (level: LogLevel, message: string, fields?: LogFields) => Effect.Effect<void>;
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

export const LogLive = Layer.effect(
	Log,
	Effect.gen(function* () {
		const home = yield* AgentHome;
		const fs = yield* FileSystem.FileSystem;
		const dir = join(home.epsilonDir, "logs");
		const path = join(dir, "epsilon.log");
		const onTerminal = process.env["NODE_ENV"] !== "production";

		const rotate: Effect.Effect<void> = Effect.gen(function* () {
			const size = yield* fs.stat(path).pipe(
				Effect.map((info) => Number(info.size)),
				Effect.orElseSucceed(() => 0),
			);
			if (size < maxLogBytes) return;
			for (let index = keptLogFiles - 1; index >= 1; index--) {
				yield* fs
					.rename(join(dir, `epsilon.log.${index}`), join(dir, `epsilon.log.${index + 1}`))
					.pipe(Effect.ignore);
			}
			yield* fs.rename(path, join(dir, "epsilon.log.1")).pipe(Effect.ignore);
		});

		const write = (level: LogLevel, message: string, fields: LogFields = {}): Effect.Effect<void> =>
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
	}),
);
