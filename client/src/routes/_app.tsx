/**
 * A pathless layout: it adds no segment to the URL. Everything under it shares
 * the session sidebar and the readiness gate; `/settings` sits beside it.
 */
import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/app/app-shell";

export const Route = createFileRoute("/_app")({ component: AppShell });
