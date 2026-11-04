/**
 * The last value that was not `undefined`. A dialog that closes by clearing the
 * payload that filled its title, description or payload keeps those words through
 * the exit transition, instead of flashing the fallback the cleared state renders.
 */
import { useState } from "react";

export function useLastDefined<Value>(value: Value | undefined): Value | undefined {
	const [last, setLast] = useState(value);
	if (value !== undefined && value !== last) {
		setLast(value);
		return value;
	}
	return last;
}
