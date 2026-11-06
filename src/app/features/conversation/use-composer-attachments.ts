import { useState } from "react";
import type { ChangeEvent } from "react";

import {
	PROMPT_IMAGE_BASE64_TOTAL_MAX,
	PROMPT_IMAGE_BYTES_MAX,
	PROMPT_IMAGE_MAX,
	promptImagesBase64Length,
} from "#protocol/conversation/commands";
import type { Tone } from "@/components/patterns/status/status-tone";

import type { Attachment } from "./composer/attachments";

/** A megabyte as a file size reads it, for the caps the protocol states in bytes. */
const MEGABYTE = 1024 * 1024;

/** What one image may hold, in the words of the message that refuses it. */
const IMAGE_MEGABYTES = PROMPT_IMAGE_BYTES_MAX / MEGABYTE;

/** The whole prompt's images, as the message that refuses them writes it. */
const IMAGE_TOTAL_CHARACTERS = PROMPT_IMAGE_BASE64_TOTAL_MAX.toLocaleString();

/**
 * Base64 for a file's bytes. One `String.fromCharCode` call over 2 MB of arguments
 * overflows the stack, so the binary string is built a chunk at a time.
 */
const base64Of = (bytes: Uint8Array): string => {
	const CHUNK = 0x8000;
	let binary = "";
	for (let offset = 0; offset < bytes.length; offset += CHUNK) {
		binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK));
	}
	return btoa(binary);
};

/** A file the user picked, read the way the prompt command carries it. */
const readAttachment = async (file: File): Promise<Attachment | undefined> => {
	try {
		return {
			data: base64Of(new Uint8Array(await file.arrayBuffer())),
			mimeType: file.type,
			name: file.name,
		};
	} catch {
		return undefined;
	}
};

/**
 * The images waiting to be sent: picked, pasted or dropped, held until the message goes.
 * A refused file is reported through `setNotice`.
 */
export function useComposerAttachments(
	setNotice: (notice: { readonly text: string; readonly tone: Tone } | undefined) => void,
) {
	const [attachments, setAttachments] = useState<Attachment[]>([]);

	/**
	 * Add picked, pasted or dropped files. The caps are the protocol's own, checked here
	 * so a file the user chose gets a reason instead of a refused command; pi resizes and
	 * rejects images itself, so nothing here reads their pixels.
	 */
	const attach = async (files: File[]) => {
		const images = files.filter((file) => file.type.startsWith("image/"));
		const problems: string[] = [];
		if (images.length < files.length) problems.push("Only images can be attached.");
		const room = Math.max(0, PROMPT_IMAGE_MAX - attachments.length);
		const withinCount = images.slice(0, room);
		if (withinCount.length < images.length) {
			problems.push(`A message carries at most ${PROMPT_IMAGE_MAX} images.`);
		}
		const sized = withinCount.filter((file) => file.size <= PROMPT_IMAGE_BYTES_MAX);
		const oversized = withinCount.length - sized.length;
		if (oversized > 0) {
			const subject = oversized === 1 ? "One image is" : `${oversized} images are`;
			problems.push(`${subject} over the ${IMAGE_MEGABYTES} MB limit for one image.`);
		}
		const read = await Promise.all(sized.map(readAttachment));
		const loaded = read.filter((attachment): attachment is Attachment => attachment !== undefined);
		if (loaded.length < read.length) problems.push("An image could not be read.");
		let total = promptImagesBase64Length(attachments);
		const admitted: Attachment[] = [];
		for (const attachment of loaded) {
			if (total + attachment.data.length > PROMPT_IMAGE_BASE64_TOTAL_MAX) {
				problems.push(`Images together are over the ${IMAGE_TOTAL_CHARACTERS} character limit.`);
				break;
			}
			total += attachment.data.length;
			admitted.push(attachment);
		}
		if (admitted.length > 0) {
			// The caps were read from this render's list; a second attach that landed
			// before it re-rendered must not get past the count.
			setAttachments((previous) => [...previous, ...admitted].slice(0, PROMPT_IMAGE_MAX));
		}
		setNotice(problems.length === 0 ? undefined : { text: problems.join(" "), tone: "warning" });
	};

	const pickFiles = (event: ChangeEvent<HTMLInputElement>) => {
		const files = [...(event.target.files ?? [])];
		// An emptied value lets the same file be picked again after it was removed.
		event.target.value = "";
		void attach(files);
	};

	const removeAttachment = (index: number) => {
		setAttachments((previous) => previous.filter((_attachment, at) => at !== index));
		setNotice(undefined);
	};

	return { attach, attachments, pickFiles, removeAttachment, setAttachments };
}
