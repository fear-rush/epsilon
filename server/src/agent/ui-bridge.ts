/**
 * The bridge pi's `ExtensionUIContext` calls. Dialogs go to `Dialogs`; a method
 * that needs a terminal is reported once, and the ones an extension reaches
 * before the first tab attaches are held back and reported as one notice when it
 * arrives, because a session_start often touches several at once.
 */
import type { DialogAnswer, DialogQuestion, ExtensionDisplay, ProtocolErrorCode } from "shared";

import type { Dialogs } from "./dialogs";

/** What the engine needs from the session that owns the browser sockets. */
export type UiHost = {
	ask: (question: DialogQuestion, timeoutMs?: number) => Promise<DialogAnswer>;
	display: (request: ExtensionDisplay) => void;
	/** A method that needs pi's TUI. The host shows one notice per method. */
	unsupported: (method: string) => void;
	fail: (error: Error, code?: ProtocolErrorCode) => void;
};

export class UiBridge {
	private readonly early = new Set<string>();
	readonly host: UiHost;

	constructor(
		private readonly dialogs: Dialogs,
		private readonly hasSubscriber: () => boolean,
		fail: (error: Error, code?: ProtocolErrorCode) => void,
	) {
		this.host = {
			ask: dialogs.ask,
			display: dialogs.display,
			unsupported: (method) => {
				if (this.hasSubscriber()) this.dialogs.unsupported(method);
				else this.early.add(method);
			},
			fail,
		};
	}

	/** Called when a tab arrives: one notice for everything held back. */
	flush(): void {
		if (this.early.size === 0) return;
		this.dialogs.reportUnsupported(this.early);
		this.early.clear();
	}
}
