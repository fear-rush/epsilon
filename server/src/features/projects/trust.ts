/**
 * pi's project-trust decision, in pi's order. `dist/core/project-trust.js` is the
 * specification: a folder with nothing gated is trusted with no decision and no
 * record; otherwise the extensions that a bootstrap pass loaded get `project_trust`
 * first, then `trust.json`, then the home's `defaultProjectTrust`.
 *
 * pi does not export its resolver, but it exports everything the chain needs: the
 * store, the resource predicate, the extension handlers and the settings getter.
 * The "ask" step is the dashboard's own Trust gate, which is shown because this
 * answer is false: there is no synchronous dialog to ask in.
 */
import type { AgentHome } from "../../platform/agent-home";
import type {
	LoadExtensionsResult,
	ProjectTrustContext,
	ProjectTrustEvent,
	ProjectTrustEventResult,
	ProjectTrustHandler,
} from "../../platform/pi";
import { hasProjectResources, projectTrustStore, untrustedSettings } from "../../platform/pi";

/** One loaded extension and the `project_trust` handlers it registered. */
export type ProjectTrustExtension = {
	path: string;
	handlers: readonly ProjectTrustHandler[];
};

/**
 * The extensions a bootstrap pass loaded, ready for pi's event. `Extension.handlers`
 * is typed with pi's generic handler; the event name fixes this signature.
 */
export const trustExtensions = (result: LoadExtensionsResult): ProjectTrustExtension[] =>
	result.extensions.map((extension) => ({
		path: extension.path,
		// SAFETY: the map is keyed by event name, and this key only holds ProjectTrustHandler entries.
		handlers: (extension.handlers.get("project_trust") ?? []) as ProjectTrustHandler[],
	}));

/** The context the settings page and an engine have: no dialog, so never asked. */
const headlessTrustContext = (cwd: string): ProjectTrustContext => ({
	cwd,
	mode: "json",
	hasUI: false,
	ui: {
		select: async () => undefined,
		confirm: async () => false,
		input: async () => undefined,
		notify: () => {},
	},
});

export type ProjectTrustOptions = {
	cwd: string;
	home: AgentHome;
	/** Absent before the extensions load: the chain then skips pi's event. */
	extensions?: readonly ProjectTrustExtension[];
	/** What a handler may show. Without one, the folder is treated as headless. */
	context?: ProjectTrustContext;
	/** pi's sentence for a handler that threw, for the caller to report. */
	onExtensionError?: (message: string) => void;
};

/** pi's `resolveProjectTrusted()`, over the pieces pi exports. */
export const decideProjectTrust = async (options: ProjectTrustOptions): Promise<boolean> => {
	// Nothing pi gates here, so neither a decision nor a record is needed.
	if (!hasProjectResources(options.cwd)) return true;
	const store = projectTrustStore(options.home);
	if (options.extensions !== undefined) {
		const result = await emitProjectTrust(
			options.extensions,
			options.cwd,
			options.context ?? headlessTrustContext(options.cwd),
			options.onExtensionError,
		);
		if (result !== undefined) {
			const trusted = result.trusted === "yes";
			if (result.remember === true) store.set(options.cwd, trusted);
			return trusted;
		}
	}
	const saved = store.get(options.cwd);
	if (saved !== null) return saved;
	switch (untrustedSettings(options.cwd, options.home).getDefaultProjectTrust()) {
		case "always":
			return true;
		case "never":
			return false;
		case "ask":
			// The page's Trust gate asks; until the operator answers, nothing loads.
			return false;
	}
};

/**
 * The first `project_trust` handler that answers yes or no wins; `undecided` falls
 * through. A handler that throws is reported with pi's own sentence and does not
 * decide, so the next handler and the rest of the chain still run.
 */
const emitProjectTrust = async (
	extensions: readonly ProjectTrustExtension[],
	cwd: string,
	context: ProjectTrustContext,
	onError: ((message: string) => void) | undefined,
): Promise<ProjectTrustEventResult | undefined> => {
	const event: ProjectTrustEvent = { type: "project_trust", cwd };
	const failures: { extensionPath: string; error: string }[] = [];
	const report = (): void => {
		for (const failure of failures) {
			onError?.(`Extension "${failure.extensionPath}" project_trust error: ${failure.error}`);
		}
	};
	for (const extension of extensions) {
		// One extension may register more than one handler for this event.
		for (const handler of extension.handlers) {
			try {
				const result = await handler(event, context);
				if (result.trusted === "undecided") continue;
				report();
				return result;
			} catch (error) {
				failures.push({
					extensionPath: extension.path,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}
	}
	report();
	return undefined;
};
