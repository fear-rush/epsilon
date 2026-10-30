/**
 * The tabs watching one session. The session asks how many remain to decide its
 * idle lifetime, so this is the only place that counts them.
 */
import type { ServerFrame } from "shared";

import type { FrameSink } from "./dialogs";

/** A session with no tab keeps the last few frames worth showing on the next one. */
const MAX_DEFERRED = 5;

export class SessionFrames {
	private readonly sinks = new Set<FrameSink>();
	private readonly deferred: ServerFrame[] = [];

	/** Called after every change, so the session can cancel or start its idle timer. */
	constructor(private readonly changed: () => void) {}

	get count(): number {
		return this.sinks.size;
	}

	add(sink: FrameSink): void {
		this.sinks.add(sink);
		this.changed();
	}

	remove(sink: FrameSink): void {
		this.sinks.delete(sink);
		this.changed();
	}

	/** A frame nobody could receive yet; kept for the next subscriber. */
	defer(frame: ServerFrame): void {
		if (this.deferred.length < MAX_DEFERRED) this.deferred.push(frame);
	}

	takeDeferred(): ServerFrame[] {
		return this.deferred.splice(0);
	}

	emit(frame: ServerFrame): void {
		for (const sink of this.sinks) sink(frame);
	}
}
