/**
 * A model's identity in a menu or a picker: the pair the engine switches on.
 * Provider ids are letters, digits, dashes and underscores, so one slash keeps
 * the key unambiguous.
 */
export const modelKey = (model: { provider: string; id: string }): string =>
	`${model.provider}/${model.id}`;
