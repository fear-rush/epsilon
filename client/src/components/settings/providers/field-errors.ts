/**
 * The messages a form keeps after a change: every field the change did not
 * touch. Both provider forms clear a field's message as soon as that field is
 * edited, and nothing else, so a fix does not hide the other problems.
 */
export const keepUntouched = <Field extends string>(
	current: Partial<Record<Field, string>>,
	fields: readonly Field[],
	changed: readonly string[],
): Partial<Record<Field, string>> => {
	const next: Partial<Record<Field, string>> = {};
	for (const field of fields) {
		const message = current[field];
		if (message !== undefined && !changed.includes(field)) next[field] = message;
	}
	return next;
};
