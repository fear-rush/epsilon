import { skipToken, useQuery } from "@tanstack/react-query";

import { settingsKeys } from "@/api/keys";
import { fetchSkill } from "@/api/endpoints";

/** The editable detail of one user skill. `undefined` means a new one. */
export const useSkill = (name: string | undefined) =>
	useQuery({
		queryKey: settingsKeys.skill(name),
		queryFn: name === undefined ? skipToken : () => fetchSkill(name),
	});
