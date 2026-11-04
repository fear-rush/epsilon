import type { ReactNode } from "react";

import { FieldGroup } from "@/components/ui/field";

/** The fields of a form inside a section, at the field gap and the row padding. */
export function FieldStack({ children }: { children: ReactNode }) {
	return <FieldGroup className="gap-field pad-row">{children}</FieldGroup>;
}
