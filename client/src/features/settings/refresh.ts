import { useQueryClient } from "@tanstack/react-query";

import { readinessKeys, settingsKeys } from "@/api/keys";

/**
 * Re-read the settings snapshot after a write, and the readiness answer with it:
 * adding a provider is what makes the not-ready notice clear.
 */
export const useSettingsRefresh = (): (() => void) => {
	const queryClient = useQueryClient();
	return () => {
		void queryClient.invalidateQueries({ queryKey: settingsKeys.all });
		void queryClient.invalidateQueries({ queryKey: readinessKeys.all });
	};
};
