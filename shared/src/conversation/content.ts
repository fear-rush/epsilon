/**
 * The content the transcript draws. Messages and tool results are pi's shapes, so
 * these schemas read only the parts this page renders and ignore the rest, which
 * is also what keeps an extension's own content from breaking a turn.
 */
import { z } from "zod";

const contentPartSchema = z.looseObject({
	type: z.string(),
	text: z.string().optional(),
	data: z.string().optional(),
	mimeType: z.string().optional(),
});

export type ContentPart = z.infer<typeof contentPartSchema>;

/**
 * Content as pi hands it over, before the parse: a message's content array, a
 * tool event's payload, or the string a custom message carries. The fields are
 * optional because this is the input side of the schema.
 */
type ContentInput = {
	type?: string;
	text?: string;
	data?: string;
	mimeType?: string;
};

export type ExternalContent =
	| string
	| readonly ContentInput[]
	| { content?: readonly ContentInput[] };

export type ContentImage = { type: "image"; data: string; mimeType: string };

/** A tool result's own shape: the parts sit under `content`. */
const payloadSchema = z.looseObject({ content: z.array(contentPartSchema).optional() });

/**
 * The parts of whatever arrived: a message's content array, or a tool event's
 * `{ content }` payload. Anything else is no content.
 */
export const contentParts = (value: ExternalContent): ContentPart[] => {
	const array = z.array(contentPartSchema).safeParse(value);
	if (array.success) return array.data;
	const payload = payloadSchema.safeParse(value);
	return payload.success ? (payload.data.content ?? []) : [];
};

export const textOf = (parts: readonly ContentPart[]): string =>
	parts
		.filter((part) => part.type === "text")
		.map((part) => part.text ?? "")
		.join("");

export const imagesOf = (parts: readonly ContentPart[]): ContentImage[] =>
	parts
		.filter((part) => part.type === "image" && part.data !== undefined)
		.map((part) => ({
			type: "image",
			data: part.data ?? "",
			mimeType: part.mimeType ?? "application/octet-stream",
		}));
