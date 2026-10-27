/**
 * Pure reads over the frame list. No React and no state: S1 renders raw frames,
 * and the reducer replaces this in S2.
 */
import type { DialogQuestion, ServerFrame } from "shared";

type MetaFrame = Extract<ServerFrame, { t: "meta" }>;

export const lastMeta = (frames: ServerFrame[]): MetaFrame | undefined => {
	for (let index = frames.length - 1; index >= 0; index -= 1) {
		const frame = frames[index];
		if (frame !== undefined && frame.t === "meta") return frame;
	}
	return undefined;
};

/** A question stays open until this tab answers it. */
export const openQuestions = (frames: ServerFrame[], answered: string[]): DialogQuestion[] => {
	const open = new Map<string, DialogQuestion>();
	for (const frame of frames) {
		if (frame.t === "dialog" && !answered.includes(frame.request.id)) {
			open.set(frame.request.id, frame.request);
		}
	}
	return [...open.values()];
};
