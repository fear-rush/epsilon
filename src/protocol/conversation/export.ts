import { Schema } from "effect";

/** The two files pi writes a transcript as, and the type a browser saves each under. */
export const ExportFormat = Schema.Literals(["html", "jsonl"]);
export type ExportFormat = typeof ExportFormat.Type;

/** What a browser saves: the bytes pi wrote, and the name to save them under. */
export const ExportedSession = Schema.Struct({
	filename: Schema.String,
	mimeType: Schema.String,
	text: Schema.String,
});
export type ExportedSession = typeof ExportedSession.Type;
