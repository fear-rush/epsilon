import { createFileRoute } from "@tanstack/react-router";

import { ProvidersLayout } from "@/features/settings/providers/providers-layout";

export const Route = createFileRoute("/settings/providers")({ component: ProvidersLayout });
