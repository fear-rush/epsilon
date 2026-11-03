/**
 * The only waiting helper. Everything else in a test is event-driven or virtual.
 *
 * Give it a predicate and it polls fast enough to be invisible (10 ms), fails with the
 * name of what it waited for, and never outlives the per-test timeout on its own.
 *
 * It uses `setTimeout` rather than `Bun.sleep` because the e2e specs also run under
 * Playwright's Node workers, where `Bun` is not defined.
 */
export type Predicate = () => boolean | Promise<boolean>;

export type UntilOptions = {
	/** What is being waited for, used in the failure message. */
	readonly what: string;
	/** Milliseconds before giving up. Keep it below the test's own timeout. */
	readonly deadline?: number;
};

const defaultDeadlineMs = 2000;
const pollMs = 10;

const pause = (ms: number): Promise<void> =>
	new Promise((resolve) => {
		setTimeout(resolve, ms);
	});

export async function until(predicate: Predicate, options: UntilOptions): Promise<void> {
	const deadline = options.deadline ?? defaultDeadlineMs;
	const started = performance.now();
	for (;;) {
		// oxlint-disable-next-line no-await-in-loop -- polling is sequential by design
		if (await predicate()) return;
		if (performance.now() - started >= deadline) {
			throw new Error(`waited ${deadline} ms for ${options.what}`);
		}
		// oxlint-disable-next-line no-await-in-loop -- polling is sequential by design
		await pause(pollMs);
	}
}
