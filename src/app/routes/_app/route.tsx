/**
 * A pathless layout: it adds no segment to the URL. Everything under it shares the chat
 * column and the readiness gate; `/settings` sits beside it as its own surface.
 */
import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/features/app-shell/app-shell";

export const Route = createFileRoute("/_app")({ component: AppShell });
