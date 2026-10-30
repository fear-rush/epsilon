import { useQuery } from "@tanstack/react-query";

import { settingsKeys } from "@/api/keys";
import { fetchSettings } from "@/lib/api";

/**
 * The settings snapshot. Sections share one query key, so the page loads it
 * once and every write invalidates the same family.
 */
export const useSettings = () =>
	useQuery({ queryKey: settingsKeys.snapshot(), queryFn: fetchSettings });
