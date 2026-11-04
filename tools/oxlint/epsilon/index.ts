import { eslintCompatPlugin } from "@oxlint/plugins";

import { designTokensRule } from "./rules/design-tokens.ts";
import { effectOnlyIoRule } from "./rules/effect-only-io.ts";
import { feedbackSurfacesRule } from "./rules/feedback-surfaces.ts";
import { noFeatureInternalsRule } from "./rules/no-feature-internals.ts";
import { noRealSleepRule } from "./rules/no-real-sleep.ts";

/** Epsilon's own rules: design tokens, the feedback surfaces, feature boundaries, and the time and IO rules of 09. */
const epsilonPlugin = eslintCompatPlugin({
	meta: { name: "epsilon" },
	rules: {
		"design-tokens": designTokensRule,
		"effect-only-io": effectOnlyIoRule,
		"feedback-surfaces": feedbackSurfacesRule,
		"no-feature-internals": noFeatureInternalsRule,
		"no-real-sleep": noRealSleepRule,
	},
});

export default epsilonPlugin;
