import { skipToken, useQuery } from "@tanstack/react-query";

import { settingsKeys } from "@/api/keys";
import { fetchProviderDetail } from "@/lib/api";

/** The editable detail of one provider. `undefined` means a new, unsaved one. */
export const useProviderDetail = (providerId: string | undefined) =>
	useQuery({
		queryKey: settingsKeys.provider(providerId),
		queryFn: providerId === undefined ? skipToken : () => fetchProviderDetail(providerId),
	});
