/**
 * Keys for a list of values that may repeat and carry no id: each value plus how many
 * times it appeared before, so the key follows the content and not only its position.
 */
export function occurrenceKeys(values: readonly string[]): string[] {
	const seen = new Map<string, number>();
	return values.map((value) => {
		const occurrence = seen.get(value) ?? 0;
		seen.set(value, occurrence + 1);
		return `${value}-${occurrence}`;
	});
}

/** Keys for inline images: the head of each one's data, which differs between pictures. */
export function imageKeys(images: readonly { readonly data: string }[]): string[] {
	return occurrenceKeys(images.map((image) => image.data.slice(0, 64)));
}
