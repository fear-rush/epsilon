/**
 * The state every settings editor shares: a draft nothing writes until Save, a
 * dirty flag, one message per field, the dialogs that confirm leaving, and the
 * flag that lets a deliberate exit (after a save, a delete or a discard) pass the
 * unsaved-changes block. A form keeps its own fields, validation and mutations.
 */
import { useRef, useState } from "react";

import { keepUntouched } from "./field-errors";

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
