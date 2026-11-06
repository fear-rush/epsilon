/**
 * Stable keys for a list of rows that have no id of their own: new rows take the next
 * number and a removal drops its number with it, so an edit never remounts a row.
 */
import { useState } from "react";

export type RowIds = {
	ids: readonly number[];
	/** Forget the number of the row at this index. */
	drop: (index: number) => void;
};

export function useRowIds(count: number): RowIds {
	const [state, setState] = useState<{ list: number[]; next: number }>({ list: [], next: 0 });
	if (state.list.length !== count) {
		const list = state.list.slice(0, count);
		let next = state.next;
		while (list.length < count) list.push(next++);
		setState({ list, next });
	}
	const drop = (index: number) =>
		setState((current) => ({ ...current, list: current.list.filter((_, at) => at !== index) }));
	return { ids: state.list, drop };
}
