import { useRef, useState } from "react";

/**
 * The state every settings editor shares: a draft nothing writes until Save, a
 * dirty flag, one message per field, the dialogs that confirm leaving, and the
 * flag that lets a deliberate exit (after a save, a delete or a discard) pass the
 * unsaved-changes block. A form keeps its own fields, validation and mutations.
 */

export function useDraftForm<Draft extends object, Field extends string>({
	initial,
	fields,
	onEdit,
}: {
	initial: () => Draft;
	/** Every field that can carry a message, so an edit clears only its own. */
	fields: readonly Field[];
	/** Runs on every edit, for state that goes stale with the draft (a test result). */
	onEdit?: () => void;
}) {
	const [draft, setDraft] = useState<Draft>(initial);
	const [dirty, setDirty] = useState(false);
	const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [cancelOpen, setCancelOpen] = useState(false);
	const allowLeave = useRef(false);

	const update = (patch: Partial<Draft>) => {
		allowLeave.current = false;
		setDraft((current) => ({ ...current, ...patch }));
		setDirty(true);
		onEdit?.();
		setErrors((current) => keepUntouched(current, fields, Object.keys(patch)));
	};

	return {
		draft,
		update,
		dirty,
		/** The draft now matches what is stored. */
		markSaved: () => setDirty(false),
		errors,
		setErrors,
		/** Call before a navigation the user chose, so the block lets it through. */
		allowLeave: () => {
			allowLeave.current = true;
		},
		blocked: () => dirty && !allowLeave.current,
		deleteOpen,
		setDeleteOpen,
		cancelOpen,
		setCancelOpen,
	};
}

/**
 * The messages a form keeps after a change: every field the change did not
 * touch. A form clears a field's message as soon as that field is edited, and
 * nothing else, so a fix does not hide the other problems.
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
