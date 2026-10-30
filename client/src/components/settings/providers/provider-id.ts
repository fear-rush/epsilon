/**
 * A provider id derived from its display name. pi's rule is a leading letter or
 * digit, then letters, digits, dashes and underscores, and "new" is reserved by
 * the add route. The id is the `models.json` key and the address models use, so
 * it is generated once for a new provider and never follows a later rename.
 */
const MAX_LENGTH = 40;

export const providerIdFromName = (name: string): string => {
	const ascii = name.normalize("NFKD").replace(/[\u0300-\u036f]/gu, "");
	const slug = ascii
		.toLowerCase()
		.replace(/[^a-z0-9_-]+/gu, "-")
		.replace(/-{2,}/gu, "-")
		.replace(/^-+|-+$/gu, "")
		.slice(0, MAX_LENGTH)
		.replace(/-+$/gu, "");
	if (slug === "") return "provider";
	return slug === "new" ? "new-provider" : slug;
};

/** The first free id, so a name matching a provider pi ships does not edit it. */
export const uniqueProviderId = (base: string, taken: ReadonlySet<string>): string => {
	if (base === "" || !taken.has(base)) return base;
	let suffix = 2;
	while (taken.has(`${base}-${suffix}`)) suffix += 1;
	return `${base}-${suffix}`;
};

/** Lowercased display names already in use, excluding the provider being edited. */
export const providerNamesInUse = (
	providers: readonly { id: string; name: string }[],
	builtins: readonly { id: string; name: string }[],
	excludeId: string | undefined,
): Set<string> => {
	const names = new Set<string>();
	for (const provider of [...providers, ...builtins]) {
		if (provider.id !== excludeId) names.add(provider.name.trim().toLowerCase());
	}
	return names;
};
