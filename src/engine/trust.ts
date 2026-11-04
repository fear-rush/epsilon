import {
	ProjectTrustStore,
	SettingsManager,
	hasTrustRequiringProjectResources,
} from "@earendil-works/pi-coding-agent";
import type {
	LoadExtensionsResult,
	ProjectTrustContext,
	ProjectTrustEvent,
	ProjectTrustEventResult,
	ProjectTrustHandler,
} from "@earendil-works/pi-coding-agent";

/**
 * pi's project-trust decision, in pi's order, for the engine process.
 *
 * `dist/core/project-trust.js` is the specification: a folder with nothing gated is
 * trusted with no decision and no record; otherwise the extensions the bootstrap pass
 * loaded get `project_trust` first, then `trust.json`, then the home's
 * `defaultProjectTrust`. `"ask"` is false here because the engine has no dialog; the
 * page's Trust gate asks, and until the operator answers nothing runs.
 *
 * The backend decides the same chain with no extensions for the project page. It is
 * deliberately mirrored: the engine's answer may come from a `project_trust` handler
 * that only exists in a loaded extension.
 */

/** What a handler may show: a headless engine has no UI, so nothing is shown. */
const contextOf = (cwd: string): ProjectTrustContext => ({
	cwd,
	mode: "json",
	hasUI: false,
	ui: {
		confirm: () => Promise.resolve(false),
		input: () => Promise.resolve(undefined),
		notify: () => {},
		select: () => Promise.resolve(undefined),
	},
});

/** One loaded extension and the `project_trust` handlers it registered. */
type TrustExtension = {
	readonly path: string;
	readonly handlers: readonly ProjectTrustHandler[];
};

const trustExtensions = (extensions: LoadExtensionsResult): ReadonlyArray<TrustExtension> =>
	extensions.extensions.map((extension) => ({
		path: extension.path,
		// SAFETY: the map is keyed by event name, and this key holds ProjectTrustHandler entries.
		handlers: (extension.handlers.get("project_trust") ?? []) as ProjectTrustHandler[],
	}));

/**
 * The first `project_trust` handler that answers yes or no wins; `undecided` falls
 * through. A handler that throws is reported with pi's own sentence and does not
 * decide, so the next handler and the rest of the chain still run.
 */
const emitProjectTrust = async (
	extensions: ReadonlyArray<TrustExtension>,
	cwd: string,
	onProblem: (message: string) => void,
): Promise<ProjectTrustEventResult | undefined> => {
	const event: ProjectTrustEvent = { cwd, type: "project_trust" };
	const failures: string[] = [];
	for (const extension of extensions) {
		for (const handler of extension.handlers) {
			try {
				// oxlint-disable-next-line no-await-in-loop -- pi's handlers decide in order
				const result = await handler(event, contextOf(cwd));
				if (result.trusted === "undecided") continue;
				for (const failure of failures) onProblem(failure);
				return result;
			} catch (cause) {
				failures.push(
					`Extension "${extension.path}" project_trust error: ${
						cause instanceof Error ? cause.message : String(cause)
					}`,
				);
			}
		}
	}
	for (const failure of failures) onProblem(failure);
	return undefined;
};

/**
 * pi's answer for a folder. `extensions` is the bootstrap pass's result; without one
 * (the first load of a folder with no gated resources) only the store and the default
 * decide.
 */
export async function decideProjectTrust(options: {
	readonly cwd: string;
	readonly agentDir: string;
	readonly extensions?: LoadExtensionsResult;
	readonly onProblem: (message: string) => void;
}): Promise<boolean> {
	if (!hasTrustRequiringProjectResources(options.cwd)) return true;
	const store = new ProjectTrustStore(options.agentDir);
	if (options.extensions !== undefined) {
		const answer = await emitProjectTrust(
			trustExtensions(options.extensions),
			options.cwd,
			options.onProblem,
		);
		if (answer !== undefined) {
			const trusted = answer.trusted === "yes";
			if (answer.remember === true) store.set(options.cwd, trusted);
			return trusted;
		}
	}
	const saved = store.get(options.cwd);
	if (saved !== null) return saved;
	const settings = SettingsManager.create(options.cwd, options.agentDir, {
		projectTrusted: false,
	});
	return settings.getDefaultProjectTrust() === "always";
}
