/** Filesystem questions the dashboard asks about a path it did not create. */
import { stat } from "node:fs/promises";

/** Whether the path is an existing directory; a missing or unreadable path is false. */
export const isDirectory = async (path: string): Promise<boolean> => {
	try {
		return (await stat(path)).isDirectory();
	} catch {
		return false;
	}
};

/** Whether the path is an existing regular file; a missing or unreadable path is false. */
export const isFile = async (path: string): Promise<boolean> => {
	try {
		return (await stat(path)).isFile();
	} catch {
		return false;
	}
};
