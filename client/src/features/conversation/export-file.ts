/**
 * Saving a transcript. pi writes the export on the server and the browser downloads
 * the bytes it returns, so every caller that offers an export goes through here for
 * the download itself: the session controls' menu and `/export` in the composer.
 */
import { exportSession } from "@/api/endpoints";
import type { ExportedSession, ExportFormat } from "@/api/types";

/** Hand the answer's text to the browser's own download, under the name the server chose. */
const saveAs = ({ filename, mimeType, text }: ExportedSession): void => {
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

/** Read the transcript in `format` and start the download. Throws with the server's refusal. */
export const downloadExport = async (sessionId: string, format: ExportFormat): Promise<void> => {
	saveAs(await exportSession(sessionId, format));
};
