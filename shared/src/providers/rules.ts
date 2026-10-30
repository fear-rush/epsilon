/**
 * The provider rules the browser form and the server both run: the API families
 * and the id pattern. Request and response shapes live in the server's contract.
 */
import { z } from "zod";

/** The API families `models.json` accepts for a provider. */
export const providerApiSchema = z.enum([
	"openai-completions",
	"openai-responses",
	"anthropic-messages",
	"google-generative-ai",
]);

export type ProviderApi = z.infer<typeof providerApiSchema>;

/** The provider key under `providers` in models.json, and the URL segment. */
export const providerIdSchema = z
	.string()
	.min(1)
	// `new` is the add-provider page, so it cannot also name a provider.
	.regex(
		/^(?!new$)[A-Za-z0-9][A-Za-z0-9_-]*$/,
		'Use letters, digits, dashes and underscores; "new" is reserved',
	);

/**
 * A model's identity in a menu or a picker: the pair the engine switches on.
 * Provider ids are letters, digits, dashes and underscores, so one slash keeps
 * the key unambiguous.
 */
export const modelKey = (model: { provider: string; id: string }): string =>
	`${model.provider}/${model.id}`;
