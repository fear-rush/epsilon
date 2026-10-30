import { useQueryClient } from "@tanstack/react-query";

/**
 * Re-read the settings snapshot after a write, and the readiness answer with it:
 * adding a provider is what makes the not-ready notice clear.
 */
export const useSettingsRefresh = (): (() => void) => {
	const queryClient = useQueryClient();
	return () => {
		void queryClient.invalidateQueries({ queryKey: ["settings"] });
		void queryClient.invalidateQueries({ queryKey: ["provider"] });
		void queryClient.invalidateQueries({ queryKey: ["mcp"] });
		void queryClient.invalidateQueries({ queryKey: ["readiness"] });
	};
};
