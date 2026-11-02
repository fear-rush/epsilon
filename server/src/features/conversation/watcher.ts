/**
 * The chat's session file, watched for a write this engine did not make. pi reads
 * the file once and holds the transcript it loaded, so another process's edit is
 * invisible to it; a change while nothing runs is reported once, and the tab
 * offers a reload.
 */
import { watch } from "node:fs";
import type { FSWatcher } from "node:fs";

/**
 * pi writes on every message and result, so a change this soon after our own work
 * is this engine writing, not another process.
 */
const OWN_WRITE_WINDOW_MS = 2_000;

export class FileWatcher {
	private watcher: FSWatcher | undefined;
	/** When this engine last wrote or produced an event. */
	private lastOwnActivity = 0;
	/** Set once a change is reported, so one write does not fill the transcript with rows. */
	private driftSeen = false;

	constructor(
		/** False while the engine is busy or gone: its own writes are not drift. */
		private readonly canReport: () => boolean,
		/** Called once per outside change, from the watcher's own callback. */
		private readonly onDrift: () => void,
	) {}

	/**
	 * Follow one file. Undefined means pi has not written the session yet, so
	 * there is nothing to watch; the first message creates it.
	 */
	watch(file: string | undefined): void {
		this.stop();
		if (file === undefined) return;
		try {
			this.watcher = watch(file, { persistent: false }, () => this.sawChange());
		} catch {
			this.watcher = undefined;
		}
	}

	stop(): void {
		this.watcher?.close();
		this.watcher = undefined;
	}

	get watching(): boolean {
		return this.watcher !== undefined;
	}

	/** This engine wrote something, or pi produced an event for it. */
	markOwnActivity(): void {
		this.lastOwnActivity = Date.now();
	}

	/** A reload or a replacement read the file again, so a reported drift is gone. */
	clearDrift(): void {
		this.driftSeen = false;
	}

	private sawChange(): void {
		if (this.driftSeen || !this.canReport()) return;
		if (Date.now() - this.lastOwnActivity < OWN_WRITE_WINDOW_MS) return;
		this.driftSeen = true;
		this.onDrift();
	}
}
