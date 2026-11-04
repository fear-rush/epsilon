/**
 * Saving a transcript. The engine writes pi's export and hands back the bytes, so every
 * caller that offers an export goes through here for the download itself: the session
 * controls' buttons and `/export` in the composer.
 */
import type { ExportedSession } from "#protocol/conversation/export";

/** Hand the answer's text to the browser's own download, under the name the engine chose. */
export const downloadExport = ({ filename, mimeType, text }: ExportedSession): void => {
	const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	document.body.append(link);
	link.click();
	link.remove();
	// The download reads the blob after this task, so the URL has to outlive it.
	setTimeout(() => URL.revokeObjectURL(url), 0);
};
