/**
 * A second signal forces the exit.
 *
 * The first signal interrupts the main fiber, and closing scopes in reverse order is what
 * shuts everything down. If one of those finalizers waits on an engine that ignores
 * shutdown, that wait has no end; the second signal is the operator's way out.
 */
export const installForceExit = (exit: (code: number) => void): void => {
	let signals = 0;
	const onSignal = (): void => {
		signals += 1;
		if (signals > 1) exit(1);
	};
	process.on("SIGINT", onSignal);
	process.on("SIGTERM", onSignal);
};
