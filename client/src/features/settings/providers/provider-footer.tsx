import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { ReactNode } from "react";

/** The provider page's footer actions: a test menu, then Cancel or Delete, then Save. */
export function ProviderActions({
	isNew,
	saving,
	test,
	onSave,
	onCancel,
	onDelete,
}: {
	isNew: boolean;
	saving: boolean;
	test: ReactNode;
	onSave: () => void;
	onCancel: () => void;
	onDelete: () => void;
}) {
	return (
		<>
			{test}
			<Button type="button" variant="destructive" onClick={isNew ? onCancel : onDelete}>
				{isNew ? "Cancel" : "Delete"}
			</Button>
			<Button type="button" onClick={onSave} disabled={saving}>
				{saving && <Spinner data-icon="inline-start" />}
				Save
			</Button>
		</>
	);
}
