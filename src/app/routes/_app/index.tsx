import { createFileRoute } from "@tanstack/react-router";
import { Schema } from "effect";

import { NewChat } from "@/features/conversation/new-chat";

/** A project chat names its folder here; a plain chat has no parameter at all. */
const Search = Schema.Struct({ place: Schema.optional(Schema.NonEmptyString) });

export const Route = createFileRoute("/_app/")({
	head: () => ({ meta: [{ title: "New chat · Epsilon" }] }),
	validateSearch: Schema.toStandardSchemaV1(Search),
	component: HomeRoute,
});

function HomeRoute() {
	const { place } = Route.useSearch();
	return <NewChat place={place ?? null} />;
}
