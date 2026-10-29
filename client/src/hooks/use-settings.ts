import { useQuery } from "@tanstack/react-query";

import { fetchSettings } from "@/lib/api";

/**
 * The settings snapshot. Sections share one query key, so the page loads it
 * once and every write invalidates the same entry.
 */
export const useSettings = () => useQuery({ queryKey: ["settings"], queryFn: fetchSettings });
